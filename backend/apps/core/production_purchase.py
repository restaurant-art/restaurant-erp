"""Atomic bridge from the existing approved purchase invoice into kitchen stock."""
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone

from .models import SharedAppState
from .production_domain import fail, money, number, quantity, UNITS, QTY
from .production_models import KitchenItem, KitchenLocation, KitchenTransaction
from .production_service import HANDLERS, receive, scoped, transfer_or_usage, moment
from .product_state import require_product_enabled


def shared(site, prefix):
    row, _ = SharedAppState.objects.select_for_update().get_or_create(
        state_key=f"vestora-{prefix}-{site.store_id}", defaults={"state_value": []})
    return row


def purchase_quantity(item, original, row, product):
    """Validate the approved size snapshot, then receive its measured contents."""
    size = original.get("purchaseUnit")
    if row.get("purchaseUnit") != size:
        fail("The receipt purchase size must match the submitted invoice.")
    if original.get("unit") and original["unit"] != row.get("unit"):
        fail("The receipt unit must match the submitted invoice.")
    if not size:
        if item.pack_size:
            fail("This older draft has no recorded pack contents. Return it to Draft and reselect the product before approving; existing stock is unchanged.")
        return quantity(item, row["quantity"], row.get("unit"), False)
    if not isinstance(size, dict):
        fail("Choose a saved purchase size.")
    size_unit = str(size.get("unit", "")).strip().lower()
    if size_unit not in UNITS:
        fail("Purchase sizes require a standard weight, volume or count measure.")
    net = number(size.get("quantity"), "Net package quantity", allow_zero=False)
    product_unit = str(product.get("unit", "")).strip().lower()
    delivery = size.get("mode") == "delivery" and str(size.get("name", "")).strip().lower() in {product_unit, "pack"}
    configured = size.get("mode") == "configured" and str(size.get("name", "")).lower() == product_unit and quantity(item, net, size_unit, False) == item.pack_size
    if size.get("mode") and not delivery and not configured:
        fail("Choose a valid purchase size.")
    loose = str(size.get("name", "")).strip().lower() == size_unit and net == 1
    saved = any(str(entry.get("id")) == str(size.get("id"))
                and entry.get("name") == size.get("name")
                and str(entry.get("unit", "")).lower() == size_unit
                and number(entry.get("quantity"), "Saved package quantity", allow_zero=False) == net
                for entry in product.get("purchaseUnits", []))
    if (not loose and not saved and not delivery and not configured) or row.get("unit") != size.get("name"):
        fail("This purchase size changed or is missing. Select it again in the invoice draft.")
    return quantity(item, number(original["quantity"]) * net, size_unit, False)


def purchase(tx, data):
    if not tx.site.enabled:
        fail("Use the existing purchase workflow until cutover is active.")
    source = str(data.get("source", ""))
    if not source:
        fail("Purchase reference is required.")
    if KitchenTransaction.objects.filter(site=tx.site, kind="purchase", source=source).exclude(pk=tx.pk).exists():
        fail("This purchase is already posted. Refresh its approved invoice.")
    drafts = shared(tx.site, "purchase-drafts")
    draft = next((row for row in drafts.state_value if str(row.get("id")) == str(data.get("draft_id"))), None)
    if not draft or draft.get("status") != "PendingApproval":
        fail("Synchronize the submitted purchase draft before approval.")
    if draft.get("entry") != data.get("entry"):
        fail("The purchase draft changed. Refresh before approval.")
    location = scoped(KitchenLocation, tx.site, data.get("location"))
    rows = data.get("receipts", [])
    if len(rows) != len(draft["entry"].get("lines", [])) or not rows:
        fail("Receipt lines must match the submitted purchase draft.")
    stock, validated_rows = [], []
    products = {str(product.get("id")): product for product in shared(tx.site, "inventory").state_value}
    for index, (row, original) in enumerate(zip(rows, draft["entry"]["lines"])):
        item = KitchenItem.objects.filter(site=tx.site, legacy_key=str(row.get("itemId"))).first()
        product = products.get(str(row.get("itemId")))
        if product is not None:
            require_product_enabled(product, products)
        if not item and product and product.get("productionConsumption") is False:
            from .production_products import configure_product
            item = configure_product(tx, product)
        if not item:
            name = row.get("item") or "This purchase item"
            unit = row.get("unit") or "no Product Master unit"
            fail(f"{name} has Product Master unit '{unit}' but is not linked to Production stock. In Production → Setup, link this item and choose its stock type and compatible base unit before approval.")
        if str(original.get("itemId")) != item.legacy_key or number(row.get("quantity")) != number(original.get("quantity")):
            fail("Approved item/quantity must match the submitted purchase line.")
        if item.kind not in ("raw", "resale"):
            fail("Purchased receipts require a raw or resale item; prepared stock needs a production batch.")
        amount = purchase_quantity(item, original, row, products.get(item.legacy_key, {}))
        display_unit = str(item.inventory_item.unit).strip().lower()
        if display_unit in UNITS or display_unit in item.measures:
            stock_quantity = (amount / quantity(item, 1, display_unit, False)).quantize(QTY, rounding=ROUND_HALF_UP)
        elif (row.get("purchaseUnit") or {}).get("mode") == "delivery":
            # A variable-size pack has no permanent display-unit conversion;
            # keep its physical package count here while the kitchen ledger stores measured base units.
            stock_quantity = number(row.get("quantity"), "Received package count", allow_zero=False)
        else:
            fail(f"Configure a conversion for {display_unit} on {item.inventory_item.name}, or record the actual delivery size.")
        # The existing invoice calculator allocates discounts, freight and tax.
        # Preserve that carrying-cost treatment, with an explicit approved value.
        value = number(row.get("carryingValue"), "Approved receipt value", precision=Decimal("0.00000001"))
        sealed_packages = 0
        if item.pack_size:
            size = original.get("purchaseUnit")
            is_loose = size and str(size.get("name", "")).lower() in UNITS
            if not is_loose:
                count = number(row["quantity"], "Number of unopened packs", allow_zero=False)
                if count != count.to_integral_value() or amount != count * item.pack_size:
                    fail("This receipt's pack size differs from its product. Select a separate SKU for the different pack size.")
                sealed_packages = int(count)
        balance = receive(tx, item, location, amount, value, f"{source}:{index + 1}", "purchase_receipt",
                          expires=moment(original.get("expires_at")), pack_size=item.pack_size, sealed_packages=sealed_packages)
        stock.append({"item": item.pk, "lot": balance.lot_id, "quantity": str(amount), "value": str(value)})
        validated_rows.append({**row, "stockQuantity": float(stock_quantity), "stockUnit": item.inventory_item.unit})
    transactions = shared(tx.site, "inventory-transactions")
    if any(r.get("purchaseId") == source for r in transactions.state_value):
        fail("This purchase already appears in the legacy invoice ledger; reconcile it without receiving twice.")
    now = timezone.now().isoformat()
    transactions.state_value = [{**row, "productionTransaction": str(tx.pk)} for row in validated_rows] + transactions.state_value
    transactions.updated_at = timezone.now()
    transactions.save()
    drafts.state_value = [{**r, "status": "Approved", "purchaseId": source, "approvedAt": now, "updatedAt": now} if r.get("id") == draft["id"] else r for r in drafts.state_value]
    drafts.updated_at = timezone.now()
    drafts.save()
    return {"purchase": source, "stock": stock}


def purchase_return(tx, data):
    if not data.get("receipts"):
        fail("Select supplier return lines.")
    if KitchenTransaction.objects.filter(site=tx.site, kind="purchase_return", source=tx.source).exclude(pk=tx.pk).exists():
        fail("This supplier return is already posted.")
    ledger = shared(tx.site, "inventory-transactions")
    rows = ledger.state_value
    voided = {entry.get("correctsTransaction") for entry in rows if entry.get("correctsTransaction")}
    active = [entry for entry in rows if entry.get("productionTransaction") not in voided
              and not entry.get("correctionOnly") and entry.get("status") not in ("Cancelled", "Deleted", "Reversed")]
    result, saved_rows = [], []
    for row in data["receipts"]:
        item = KitchenItem.objects.filter(site=tx.site, legacy_key=str(row.get("itemId"))).first()
        if not item:
            fail("Map the returned stock item before posting.")
        supplier = str(row.get("supplier") or "").strip().casefold()
        reference = str(row.get("invoice") or row.get("reference") or "").strip().casefold()
        if not row.get("purchaseId") and not reference:
            # Legacy warehouse returns without an invoice retain physical
            # traceability but do not credit a supplier bill.
            result.append(transfer_or_usage(tx, {"item": item.pk, "location": data.get("location"),
                "quantity": row.get("quantity"), "unit": row.get("unit"), "category": "supplier_return"}))
            saved_rows.append({**row, "productionTransaction": str(tx.pk)})
            continue
        originals = [entry for entry in active if entry.get("type") == "Purchase"
                     and (not supplier or str(entry.get("supplier") or "").strip().casefold() == supplier)
                     and (entry.get("purchaseId") == row.get("purchaseId") if row.get("purchaseId") else
                          reference and reference in {str(entry.get("invoice") or "").strip().casefold(),
                                                      str(entry.get("purchaseId") or "").strip().casefold()})]
        ids = {entry.get("purchaseId") for entry in originals if entry.get("purchaseId")}
        if len(ids) != 1:
            fail("Select one approved invoice for this supplier return.")
        purchase_id = ids.pop()
        original_lines = [entry for entry in originals if str(entry.get("itemId")) == item.legacy_key]
        if not original_lines:
            fail(f"{item.inventory_item.name} is not on the selected invoice.")
        received = sum(quantity(item, line.get("stockQuantity", line["quantity"]), line.get("stockUnit") or line["unit"])
                       for line in original_lines)
        prior = [entry for entry in active + saved_rows
                 if entry.get("type") == "Purchase Return" and str(entry.get("itemId")) == item.legacy_key
                 and (entry.get("purchaseId") == purchase_id or (
                     not entry.get("purchaseId") and
                     str(entry.get("supplier") or "").strip().casefold() == str(originals[0].get("supplier") or "").strip().casefold()
                     and str(entry.get("invoice") or entry.get("reference") or "").strip().casefold()
                         == str(originals[0].get("invoice") or "").strip().casefold()))]
        prior_quantity = sum(quantity(item, line["quantity"], line["unit"]) for line in prior)
        amount = quantity(item, row.get("quantity"), row.get("unit"), False)
        if amount + prior_quantity > received:
            fail(f"The return exceeds the quantity remaining on the invoice for {item.inventory_item.name}.")
        original_total = sum(Decimal(str(line.get("total") or 0)) for line in original_lines)
        original_tax = sum(Decimal(str(line.get("tax") or 0)) for line in original_lines)
        previous_total = sum(abs(Decimal(str(line.get("total") or 0))) for line in prior)
        previous_tax = sum(abs(Decimal(str(line.get("tax") or 0))) for line in prior)
        def credit(value, previous):
            to_date = (value * (amount + prior_quantity) / received).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            return max(Decimal(0), to_date - previous)
        total = credit(original_total, previous_total)
        tax = min(total, credit(original_tax, previous_tax))
        result.append(transfer_or_usage(tx, {"item": item.pk, "location": data.get("location"),
            "quantity": row.get("quantity"), "unit": row.get("unit"), "category": "supplier_return"}))
        saved_rows.append({**row, "type": "Purchase Return", "purchaseId": purchase_id, "invoice": originals[0].get("invoice"),
                           "supplier": originals[0].get("supplier"), "total": float(total), "tax": float(tax),
                           "subtotal": float(total - tax), "productionTransaction": str(tx.pk)})
    ledger.state_value = saved_rows + rows
    ledger.updated_at = timezone.now()
    ledger.save()
    return {"returns": result}


def reverse_purchase_invoice(tx, original):
    """Append an invoice credit; never edit or delete the approved receipt."""
    ledger = shared(tx.site, "inventory-transactions")
    originals = [r for r in ledger.state_value if r.get("productionTransaction") == str(original.pk)]
    if not originals:
        fail("The original invoice link is missing; reconcile before correction.")
    now = timezone.now().isoformat()
    credits = [{**r, "id": f"COR-{tx.pk}-{index}", "type": "Purchase Return" if original.kind == "purchase" else "Purchase",
        "returnId": f"COR-{tx.pk}", "date": str(tx.business_date), "createdAt": now,
        "notes": tx.reason, "productionTransaction": str(tx.pk), "correctsTransaction": str(original.pk),
        "correctionOnly": True} for index, r in enumerate(originals)]
    ledger.state_value = credits + ledger.state_value
    ledger.save()


HANDLERS.update({"purchase": purchase, "purchase_return": purchase_return})
