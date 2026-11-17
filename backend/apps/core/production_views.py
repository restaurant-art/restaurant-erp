import csv
import io
from datetime import date

from django.db import IntegrityError, OperationalError, transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import Branch, SharedAppState
from .production_access import CAPABILITIES, allowed_branches, require_access
from .production_batch_sales import batch_sales_report
from .production_cutover import review  # registers cutover commands
from . import production_purchase  # registers the existing purchase bridge
from .production_domain import fail, quantity
from .production_models import *
from .production_reports import availability, batch_report, posted_sale_costs, report, trace
from .production_service import execute, latest_recipes, recipe_snapshot, serial


def site_for(request, store_id):
    require_access(request.user, store_id)
    site = ProductionSite.objects.select_related("branch__restaurant").filter(store_id=store_id).first()
    if site:
        require_access(request.user, store_id, site.branch)
    return site


def capabilities(user, site):
    result = []
    from rest_framework.exceptions import PermissionDenied
    for action in CAPABILITIES:
        try:
            require_access(user, site.store_id, site.branch, action)
            result.append(action)
        except PermissionDenied:
            pass
    return result


def inventory_unit_factor(item):
    try:
        return str(quantity(item, 1, item.inventory_item.unit, False))
    except ValidationError:
        # Older mapped products may still need their custom measure configured.
        # Keep them visible without substituting an invented conversion.
        return None


@api_view(["GET"])
def workspace(request, store_id):
    site = site_for(request, store_id)
    if not site:
        return Response({"configured": False, "enabled": False,
            "branches": list(allowed_branches(request.user).values("id", "name", "restaurant__name"))})
    location = request.query_params.get("location")
    if location and not KitchenLocation.objects.filter(site=site, pk=location).exists():
        fail("Location is not in this branch.")
    locations = list(KitchenLocation.objects.filter(site=site).values("id", "name"))
    orders = KitchenOrder.objects.filter(site=site).order_by("-pk")
    order_reference = request.query_params.get("order")
    if order_reference:
        orders = orders.filter(reference=order_reference)
    if request.query_params.get("view") == "checkout":
        return Response({"configured": True, "enabled": site.enabled, "locations": locations,
                         "orders": order_rows(orders if order_reference else orders.none())})
    items = [{"id": item.pk, "name": item.inventory_item.name, "kind": item.kind,
              "unit": item.base_unit, "measures": item.measures, "legacy_key": item.legacy_key,
              "production_consumption": item.production_consumption, "pack_size": item.pack_size,
              "inventory_unit": item.inventory_item.unit,
              "inventory_factor": inventory_unit_factor(item)} for item in KitchenItem.objects.filter(site=site).select_related("inventory_item")]
    return Response({"configured": True, "enabled": site.enabled, "branch": site.branch.name,
        "storeId": store_id, "menu": SharedAppState.objects.filter(state_key=f"vestora-menu-items-{store_id}").values_list("state_value", flat=True).first() or [],
        "inventory": SharedAppState.objects.filter(state_key=f"vestora-inventory-{store_id}").values_list("state_value", flat=True).first() or [],
        "cutover_at": site.cutover_at, "closed_through": site.closed_through,
        "valuation_policy": site.valuation_policy, "allocation_policy": site.allocation_policy,
        "overhead_allowed": site.overhead_allowed, "capabilities": capabilities(request.user, site),
        "locations": locations, "items": items,
        "recipes": [recipe_snapshot(r) for r in latest_recipes(site, "production").values()],
        "servings": [recipe_snapshot(r) for r in latest_recipes(site, "serving").values()],
        "batches": [batch_report(b) for b in ProductionBatch.objects.filter(site=site).order_by("-pk")[:200]],
        "orders": order_rows(orders[:200]),
        "stock": availability(site, location),
        "cutover": review(site) if not site.enabled else None})


def order_rows(orders):
    return [{"reference": order.reference, "location": order.location_id, "lines": serial([
        {"id": line.pk, "key": line.key, "menu_key": line.menu_key, "quantity": line.quantity,
         "fulfilled": line.fulfilled, "cancelled": line.cancelled, "revision": line.revision, "snapshot": line.snapshot}
        for line in order.lines.all()
    ])} for order in orders.prefetch_related("lines")]


@api_view(["POST"])
def setup(request, store_id):
    require_access(request.user, store_id, action="setup")
    branch = allowed_branches(request.user).filter(pk=request.data.get("branch")).first()
    if not branch:
        fail("Choose an assigned branch.")
    require_access(request.user, store_id, branch, "setup")
    with transaction.atomic():
        existing = ProductionSite.objects.filter(store_id=store_id).first()
        if existing and existing.branch_id != branch.pk:
            fail("This store is already bound to another branch.")
        if ProductionSite.objects.filter(branch=branch).exclude(store_id=store_id).exists():
            fail("This branch is already bound to a different store.")
        site, _ = ProductionSite.objects.get_or_create(store_id=store_id, defaults={"branch": branch})
        for name in ("Main store", "Kitchen"):
            KitchenLocation.objects.get_or_create(site=site, name=name)
    return Response({"configured": True, "enabled": site.enabled})


@api_view(["POST"])
def command(request, store_id):
    site = site_for(request, store_id)
    if not site:
        fail("Set up this branch's production ledger first.")
    action = request.data.get("command")
    require_access(request.user, store_id, site.branch, action or "unknown")
    data = request.data.get("data", {})
    try:
        if isinstance(data, dict) and action in ("start_count", "record_count", "adjust_count"):
            scope = data.get("scope", "all") if action == "start_count" else KitchenCount.objects.filter(
                site=site, pk=data.get("count")).values_list("scope", flat=True).first()
            if scope in ("inventory", "all"):
                require_access(request.user, store_id, site.branch, "inventory_" + action)
        result = execute(site, request.user, action, request.data.get("key"), data, preview=bool(request.data.get("preview")))
    except (IntegrityError, OperationalError):
        return Response({"error": "Stock changed or a source reference already exists. Refresh, then retry the same operation key."}, status=409)
    except (KeyError, TypeError, ValueError) as exc:
        raise ValidationError("Invalid production command fields. Check the required quantities, units and references.") from exc
    return Response(result)


@api_view(["POST"])
def sale_costs(request, store_id):
    site = site_for(request, store_id)
    if not site or not site.enabled:
        return Response({"costs": {}, "enabled": False})
    references = request.data.get("references")
    if not isinstance(references, list) or len(references) > 500 or any(
            not isinstance(ref, str) or not ref or len(ref) > 180 for ref in references):
        fail("Send up to 500 saved order references.")
    return Response({"costs": posted_sale_costs(site, references), "enabled": True})


@api_view(["GET"])
def reports(request, store_id):
    site = site_for(request, store_id)
    if not site:
        fail("Production ledger is not configured.")
    try:
        day = date.fromisoformat(request.query_params.get("date", timezone.localdate().isoformat()))
    except ValueError:
        fail("Choose a valid report date.")
    if request.query_params.get("view") == "batch-profit":
        return Response({"batches": batch_sales_report(site, day)})
    data = report(site, day, request.query_params.get("location"))
    if request.query_params.get("batch"):
        data["trace"] = trace(site, request.query_params["batch"])
    if request.query_params.get("export") == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Item", "Unit", "Lot", "Location", "Opening", "Receipts", "Issues", "Expected closing", "Closing value"])
        def cell(value):
            value = str(value)
            return "'" + value if value.startswith(("=", "+", "-", "@")) else value
        for row in data["closing"]:
            writer.writerow([cell(row[key]) for key in ("name", "unit", "reference", "location", "opening", "receipts", "issues", "closing", "closing_value")])
        response = HttpResponse(output.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="uvpro-kitchen-{day}.csv"'
        return response
    return Response(data)
