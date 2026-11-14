"""Store-scoped barcode catalog, preferences and print job audit trail."""

import hashlib
import json
from uuid import UUID

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from .barcode_labels import (
    MAX_LABELS, barcode_format, bounded, code_owners, first_batches, item_label, label_settings,
    money_value, purchase_label_count, text,
)
from .cloud_views import _state_value, _user_access
from .models import BarcodeLabelSettings, BarcodePrintJob, SharedAppState
from .internal_barcodes import InternalBarcodeError, assign_internal_barcodes
from .product_state import products_for
from .production_access import ADMIN, require_access
from .production_domain import fail
from .production_models import KitchenLot, ProductionSite

PAGE_SIZE = 25


def store_context(user, store_id):
    if not store_id or len(store_id) > 100:
        raise NotFound("Store not found.")
    require_access(user, store_id)
    site = ProductionSite.objects.select_related("branch").filter(store_id=store_id).first()
    if site:
        require_access(user, store_id, site.branch)
    return site


def allowed(user, store_id, site, action):
    try:
        require_access(user, store_id, site.branch if site else None, action)
    except PermissionDenied:
        return False
    return True


def rights(user, store_id, site):
    manage = allowed(user, store_id, site, "product")
    catalog = manage or allowed(user, store_id, site, "inventory_start_count")
    purchase = allowed(user, store_id, site, "purchase")
    # Purchase-only custom roles can use their existing Purchase Entry access.
    access = _user_access(user)
    linked = access.get("linked") or {}
    roles = [role for role in access.get("roles", []) if role.get("name") == linked.get("role")]
    role = next((role for role in roles if str(role.get("storeId")) == store_id), None)
    if role is None:
        role = next((role for role in roles if role.get("storeId") == "GLOBAL"), None)
    if role is not None and not (user.is_superuser or user.user_type in ADMIN | {"super_admin"}):
        grants = role.get("permissions", [])
        purchase = purchase or (role.get("status") != "Inactive" and "inventory" in role.get("modules", []) and (
            "access:inventory:purchase" in grants or not any(str(grant).startswith("access:") for grant in grants)
        ))
    if not (catalog or purchase):
        raise PermissionDenied("Inventory or Purchase Entry access is required.")
    return {"catalog": catalog, "purchase": purchase, "manage": manage}


def require_right(access, field):
    if not access[field]:
        raise PermissionDenied(f"Barcode {field} access is required.")


def existing_records(prefix, store_id):
    rows = _state_value(f"vestora-{prefix}-{store_id}", [])
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def product_catalog(store_id, site):
    products = products_for(site) if site else {
        str(row["id"]): row for row in existing_records("inventory", store_id) if row.get("id")
    }
    owners = code_owners(products, existing_records("menu-items", store_id))
    return products, owners, first_batches(products)


def store_labels(store_id, site):
    store = next((row for row in (_state_value("vestora-stores", []) or [])
                  if isinstance(row, dict) and str(row.get("id")) == store_id), {})
    branch = text(site.branch.name if site else store.get("branch") or store.get("name") or store_id)
    name = text(store.get("name") or branch)
    return name, branch


def page_number(request):
    return bounded(request.query_params.get("page", 1), "Page", 1, 100000, integer=True)


def paginate(rows, request):
    page = page_number(request)
    offset = (page - 1) * PAGE_SIZE
    return {"total": len(rows), "rows": rows[offset:offset + PAGE_SIZE]}


def search_match(query, *terms):
    fields = " ".join(str(term or "") for term in terms).casefold()
    return all(word in fields for word in query)


@api_view(["GET"])
def catalog(request, store_id):
    site = store_context(request.user, store_id)
    access = rights(request.user, store_id, site)
    require_right(access, "catalog")
    products, owners, batches = product_catalog(store_id, site)
    item_id = request.query_params.get("item")
    if item_id:
        if item_id not in products:
            raise NotFound("Product not found in this store.")
        return Response(item_label(products[item_id], products, owners, batches))
    query = text(request.query_params.get("q")).casefold().split()
    rows = []
    for product in products.values():
        label = item_label(product, products, owners, batches)
        if search_match(query, label["name"], label["sku"], label["id"], label["category"], label["brand"],
                        " ".join(code["barcode"] for code in label["codes"]), product.get("plu")):
            rows.append(label)
    rows.sort(key=lambda row: (row["name"].casefold(), row["id"]))
    if request.query_params.get("all") == "1":
        if len(rows) > MAX_LABELS:
            fail(f"Narrow the search to {MAX_LABELS:,} items or fewer before selecting all.")
        return Response({"total": len(rows), "rows": rows})
    return Response(paginate(rows, request))


@api_view(["POST"])
def generate(request, store_id):
    site = store_context(request.user, store_id)
    require_right(rights(request.user, store_id, site), "manage")
    item_id = text(request.data.get("item"), 180) if isinstance(request.data, dict) else ""
    if not item_id:
        fail("Choose a Product Master item.")
    with transaction.atomic():
        if site:
            ProductionSite.objects.filter(pk=site.pk).update(lock_version=F("lock_version") + 1)
        row = SharedAppState.objects.select_for_update().filter(state_key=f"vestora-inventory-{store_id}").first()
        old = row.state_value if row and isinstance(row.state_value, list) else []
        if not any(isinstance(product, dict) and str(product.get("id")) == item_id for product in old):
            raise NotFound("Product not found in this store.")
        menu = existing_records("menu-items", store_id)
        try:
            records = assign_internal_barcodes(old, old, menu)
        except InternalBarcodeError as error:
            fail(str(error))
        if records != old:
            row.state_value = records
            row.updated_at = timezone.now()
            row.save(update_fields=["state_value", "updated_at"])
        products = {str(product["id"]): product for product in records if isinstance(product, dict) and product.get("id") is not None}
        return Response(item_label(products[item_id], products, code_owners(products, menu), first_batches(products)))


def purchase_records(store_id):
    return [row for row in existing_records("inventory-transactions", store_id)
            if row.get("type") == "Purchase" and row.get("purchaseId")]


def purchase_document(receipts, reference, products, owners, batches, site):
    if not receipts:
        raise NotFound("Approved purchase bill not found in this store.")
    first = receipts[0]
    doc = {
        "id": reference, "invoice": text(first.get("invoice") or first.get("reference")),
        "supplier": text(first.get("supplier")), "date": text(first.get("date")), "rows": [],
    }
    prefix = f"{reference}:"
    expiry = {
        lot["reference"]: timezone.localtime(lot["expires_at"]).date().isoformat()
        for lot in KitchenLot.objects.filter(site=site, reference__startswith=prefix, expires_at__isnull=False)
        .values("reference", "expires_at")
    } if site else {}
    for index, receipt in enumerate(receipts):
        product_id = text(receipt.get("itemId"), 180)
        product = products.get(product_id)
        master = item_label(product, products, owners, batches) if product else {}
        name = text(receipt.get("item") or (product or {}).get("name"))
        code = text(receipt.get("barcode"))
        mrp = money_value(receipt.get("mrp"))
        price = money_value(receipt.get("sellingPrice"))
        candidates = master.get("codes", [])
        if code:
            matched = next((candidate for candidate in candidates if candidate["barcode"] == code), None)
            historical = {
                "barcode": code, "format": barcode_format(code), "mrp": mrp, "price": price,
                "internal": bool(matched and matched.get("internal")),
                "issue": matched["issue"] if matched else "This bill's barcode is no longer assigned to this product.",
            }
            candidates = [historical, *[candidate for candidate in candidates if candidate["barcode"] != code]]
        doc["rows"].append({
            **master, "id": text(receipt.get("id") or index, 180), "product_id": product_id,
            "name": name, "sku": text(receipt.get("sku") or master.get("sku")),
            "unit": text(master.get("unit") or receipt.get("stockUnit") or receipt.get("unit")),
            "mrp": mrp if mrp is not None else master.get("mrp"),
            "price": price if price is not None else master.get("price"), "codes": candidates,
            "purchase_quantity": text(receipt.get("qty") or f'{receipt.get("quantity", "")} {receipt.get("unit", "")}'),
            "default_quantity": purchase_label_count(receipt, product),
            "batch": text(receipt.get("batchLabel") or receipt.get("batchNumber") or master.get("batch")),
            "expiry": text(receipt.get("expiryDate") or receipt.get("expires_at") or expiry.get(f"{prefix}{index + 1}")),
            "can_generate": False,
        })
    return doc


@api_view(["GET"])
def purchases(request, store_id):
    site = store_context(request.user, store_id)
    require_right(rights(request.user, store_id, site), "purchase")
    receipts = purchase_records(store_id)
    reference = request.query_params.get("reference")
    if reference:
        products, owners, batches = product_catalog(store_id, site)
        return Response(purchase_document(
            [receipt for receipt in receipts if str(receipt.get("purchaseId")) == reference], reference, products, owners, batches, site
        ))
    documents = {}
    for receipt in receipts:
        key = str(receipt["purchaseId"])
        row = documents.setdefault(key, {"id": key, "invoice": text(receipt.get("invoice") or receipt.get("reference")),
                                         "supplier": text(receipt.get("supplier")), "date": text(receipt.get("date")), "lines": 0})
        row["lines"] += 1
    query = text(request.query_params.get("q")).casefold().split()
    visible = [row for row in documents.values() if search_match(query, row["id"], row["invoice"], row["supplier"], row["date"])]
    visible.sort(key=lambda row: (row["date"], row["id"]), reverse=True)
    return Response(paginate(visible, request))


@api_view(["GET", "PUT"])
def preferences(request, store_id):
    site = store_context(request.user, store_id)
    access = rights(request.user, store_id, site)
    if request.method == "PUT":
        require_right(access, "manage")
        settings = label_settings(request.data)
        BarcodeLabelSettings.objects.update_or_create(store_id=store_id, defaults={"settings": settings})
    else:
        saved = BarcodeLabelSettings.objects.filter(store_id=store_id).first()
        settings = label_settings(saved.settings if saved else {})
    store, branch = store_labels(store_id, site)
    return Response({"settings": settings, "store": store, "branch": branch, "access": access})


def snapshot_job(job):
    return {
        "id": job.id, "created_at": job.created_at, "user": job.actor_name, "branch": job.branch_name,
        "source": job.source, "purchase_reference": job.purchase_reference, "action": job.action, "status": job.status,
        "label_count": job.label_count, "copies": job.copies, "labels": job.labels, "settings": job.settings,
        "reprint_of": job.reprint_of_id,
    }


def visible_jobs(access, store_id):
    sources = (["single", "bulk"] if access["catalog"] else []) + (["purchase"] if access["purchase"] else [])
    return BarcodePrintJob.objects.filter(store_id=store_id, source__in=sources)


def uuid(value, label):
    try:
        return UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        fail(f"{label} must be a valid identifier.")


@api_view(["GET", "POST"])
def jobs(request, store_id):
    site = store_context(request.user, store_id)
    access = rights(request.user, store_id, site)
    history = visible_jobs(access, store_id)
    if request.method == "GET":
        page = page_number(request)
        offset = (page - 1) * PAGE_SIZE
        return Response({
            "total": history.count(),
            "rows": [snapshot_job(job) for job in history.order_by("-created_at", "-pk")[offset:offset + PAGE_SIZE]],
        })
    data = request.data
    if not isinstance(data, dict):
        fail("Enter valid print job details.")
    job_id = uuid(data.get("id"), "Job")
    action = data.get("action")
    if action not in ("print", "pdf"):
        fail("Choose print or PDF.")
    fingerprint = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    old = history.filter(pk=job_id, actor=request.user).first()
    if old:
        if old.request_hash != fingerprint:
            fail("This job was already prepared with different selections.")
        return Response(snapshot_job(old))
    reprint = None
    store, branch = store_labels(store_id, site)
    if data.get("reprint_of"):
        reprint = history.filter(pk=uuid(data["reprint_of"], "Original job")).first()
        if not reprint:
            raise NotFound("Original print job not found.")
        source, reference = reprint.source, reprint.purchase_reference
        labels, copies, settings = reprint.labels, reprint.copies, reprint.settings
    else:
        source = data.get("source")
        if source not in ("single", "bulk", "purchase"):
            fail("Choose a valid print source.")
        require_right(access, "purchase" if source == "purchase" else "catalog")
        selections = data.get("lines")
        if not isinstance(selections, list) or not 1 <= len(selections) <= MAX_LABELS or (source == "single" and len(selections) != 1):
            fail("Choose a valid number of products for this job.")
        settings = label_settings(data.get("settings", {}))
        copies = bounded(data.get("copies", 1), "Copies", 1, 99, integer=True)
        reference = text(data.get("purchase_reference"), 180) if source == "purchase" else ""
        products, owners, batches = product_catalog(store_id, site)
        if source == "purchase":
            rows = {row["id"]: row for row in purchase_document(
                [receipt for receipt in purchase_records(store_id) if str(receipt["purchaseId"]) == reference],
                reference, products, owners, batches, site
            )["rows"]}
        else:
            rows = {item_id: item_label(product, products, owners, batches) for item_id, product in products.items()}
        seen, labels = set(), []
        for selection in selections:
            if not isinstance(selection, dict):
                fail("Invalid product selection.")
            item_id = text(selection.get("id"), 180)
            if item_id not in rows or item_id in seen:
                fail("Choose each existing item or purchase line once.")
            seen.add(item_id)
            item = rows[item_id]
            option = next((candidate for candidate in item["codes"]
                           if candidate["barcode"] == selection.get("barcode") and candidate["mrp"] == selection.get("code_mrp")), None)
            if option is None or option["issue"]:
                fail(f'{item["name"]}: {option["issue"] if option else "Select a valid saved barcode."}')
            quantity = bounded(selection.get("quantity"), "Label quantity", 1, MAX_LABELS, integer=True)
            labels.append({
                **{field: item.get(field) for field in ("name", "sku", "unit", "price", "batch", "expiry")},
                "id": item_id, "store": store, "barcode": option["barcode"], "format": option["format"],
                "mrp": item.get("mrp") if source == "purchase" or option["mrp"] is None else option["mrp"],
                "price": item.get("price") if source == "purchase" or option["price"] is None else option["price"],
                "quantity": quantity,
            })
    label_count = copies * sum(label["quantity"] for label in labels)
    if label_count > MAX_LABELS:
        fail(f"Print up to {MAX_LABELS:,} labels per job, including copies.")
    job, _ = BarcodePrintJob.objects.get_or_create(pk=job_id, defaults={
        "store_id": store_id, "branch_name": branch, "actor": request.user,
        "actor_name": text(request.user.get_full_name() or request.user.get_username()),
        "source": source, "purchase_reference": reference, "action": action, "copies": copies,
        "label_count": label_count, "labels": labels, "settings": settings,
        "request_hash": fingerprint, "reprint_of": reprint,
    })
    if job.store_id != store_id or job.actor_id != request.user.pk or job.request_hash != fingerprint:
        fail("This print identifier has already been used.")
    return Response(snapshot_job(job))


@api_view(["POST"])
def handoff(request, store_id, job_id):
    site = store_context(request.user, store_id)
    access = rights(request.user, store_id, site)
    job = visible_jobs(access, store_id).filter(pk=job_id, actor=request.user).first()
    if not job:
        raise NotFound("Print job not found.")
    job.status = "print_dialog_requested" if job.action == "print" else "pdf_download_started"
    job.save(update_fields=["status"])
    return Response({"status": job.status})
