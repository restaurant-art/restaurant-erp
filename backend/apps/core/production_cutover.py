"""Explicit, reviewable opening migration. No historical sales are replayed."""
from decimal import Decimal
from django.db.models import Sum
from django.utils import timezone

from .models import SharedAppState
from .production_domain import UNITS, fail, number, quantity
from .production_models import *
from .production_service import HANDLERS, money, receive, save_item, scoped, serial, latest_recipes

PREFIXES = ("inventory", "food-stock", "recipes", "production-batches", "production-wastage", "finished-goods", "inventory-transactions", "menu-items")


def legacy_data(site):
    return {prefix: (SharedAppState.objects.filter(state_key=f"vestora-{prefix}-{site.store_id}").values_list("state_value", flat=True).first() or []) for prefix in PREFIXES}


def review(site):
    legacy = legacy_data(site)
    mapped = set(KitchenItem.objects.filter(site=site).exclude(legacy_key="").values_list("legacy_key", flat=True))
    serving = latest_recipes(site, "serving")
    issues = []
    reconciliation = []
    for item in legacy["inventory"]:
        if str(item.get("id")) not in mapped:
            issues.append(f"Inventory {item.get('name')}: map its stock type, unit, location and opening value.")
        else:
            mapped_item = KitchenItem.objects.get(site=site, legacy_key=str(item["id"]))
            expected = quantity(mapped_item, item.get("stock", 0), item.get("unit"))
            expected_value = money(number(item.get("stock", 0)) * number(item.get("cost", 0), precision=Decimal("0.00000001")))
            totals = KitchenBalance.objects.filter(lot__item=mapped_item).aggregate(q=Sum("quantity"), v=Sum("value"))
            q, v = totals["q"] or Decimal(0), totals["v"] or Decimal(0)
            reconciliation.append({"name": item.get("name"), "item": mapped_item.pk, "unit": mapped_item.base_unit,
                "legacy_quantity": expected, "opening_quantity": q, "quantity_difference": q - expected,
                "legacy_value": expected_value, "opening_value": v, "value_difference": v - expected_value})
    for item in legacy["menu-items"]:
        if item.get("status") != "Inactive" and str(item.get("id")) not in serving:
            issues.append(f"Menu {item.get('name')}: configure a stock method and independent serving components.")
    for batch in legacy["production-batches"]:
        if batch.get("status") not in ("Completed", "Cancelled"):
            issues.append(f"Legacy batch {batch.get('batchNo', batch.get('id'))}: reconcile already-issued ingredients and measured WIP before activation.")
    return {"legacy": legacy, "issues": issues, "reconciliation": serial(reconciliation),
        "policy": "Moving weighted-average carrying value, including the purchase cost treatment already configured in UVPRO.",
        "instruction": "Review raw and cooked units independently. Map legacy recipes manually; no portion or yield is inferred. Enter measured prepared/WIP opening balances separately."}


def import_legacy(tx, data):
    if tx.site.enabled:
        fail("Opening import is only available before activation.")
    legacy = legacy_data(tx.site)
    location = scoped(KitchenLocation, tx.site, data.get("location"))
    imported = []
    for mapping in data.get("mappings", []):
        old = next((r for r in legacy["inventory"] if str(r.get("id")) == str(mapping.get("legacy_key"))), None)
        if not old:
            fail("Legacy inventory record not found.")
        if KitchenItem.objects.filter(site=tx.site, legacy_key=str(old["id"])).exists():
            fail("This legacy inventory item is already imported.")
        unit = str(old.get("unit", "")).lower()
        base = UNITS.get(unit, (None,))[0]
        if not base:
            base = mapping.get("base_unit")
        result = save_item(tx, {"name": old["name"], "kind": mapping.get("kind"), "base_unit": base,
                              "legacy_key": str(old["id"]), "measures": mapping.get("measures", {})})
        item = scoped(KitchenItem, tx.site, result["id"])
        # Preserve the legacy display unit and valuation; reject unknown conversions.
        item.inventory_item.unit = unit
        item.inventory_item.save(update_fields=["unit"])
        amount = quantity(item, old.get("stock", 0), unit)
        value = money(number(old.get("stock", 0)) * number(old.get("cost", 0), "Legacy rate", precision=money(1)))
        if amount:
            receive(tx, item, location, amount, value, f"opening:{old['id']}", "opening", expires=None)
        imported.append({"item": item.pk, "legacy_key": old["id"], "quantity": str(amount), "value": str(value)})
    if not imported:
        fail("Select inventory mappings to import.")
    return {"imported": imported}


def activate(tx, data):
    if tx.site.enabled:
        fail("This branch already uses the production ledger.")
    if not tx.reason or not data.get("openings_reviewed") or not data.get("legacy_wip_reconciled"):
        fail("Confirm opening quantities/values and legacy WIP reconciliation, with an audit explanation.")
    audit = review(tx.site)
    unresolved = [issue for issue in audit["issues"] if not issue.startswith("Legacy batch")]
    if unresolved:
        fail(unresolved)
    tx.site.legacy_snapshot = serial({**audit["legacy"], "reconciliation": tx.reason, "opening_comparison": audit["reconciliation"], "actor": tx.actor_id,
                                    "opening_transactions": list(KitchenTransaction.objects.filter(site=tx.site).values_list("id", flat=True))})
    references = []
    for key in ("vestora-sales-ledger", "vestora-table-orders"):
        rows = SharedAppState.objects.filter(state_key=key).values_list("state_value", flat=True).first() or []
        references.extend(str(row.get("id")) for row in rows if str(row.get("storeId")) == tx.site.store_id)
    tx.site.legacy_snapshot["historic_order_references"] = references
    tx.site.enabled = True
    tx.site.cutover_at = timezone.now()
    tx.site.save(update_fields=["legacy_snapshot", "enabled", "cutover_at"])
    return {"enabled": True, "cutover_at": tx.site.cutover_at.isoformat(), "historic_sales_replayed": 0}


def location(tx, data):
    name = str(data.get("name", "")).strip()
    if not name:
        fail("Location name is required.")
    loc, _ = KitchenLocation.objects.get_or_create(site=tx.site, name=name)
    return {"id": loc.pk, "name": loc.name}


def quarantine(tx, data):
    lot = scoped(KitchenLot, tx.site, data.get("lot"))
    if not tx.reason:
        fail("Record the quarantine/release reason.")
    lot.quarantined = bool(data.get("quarantined"))
    lot.save(update_fields=["quarantined"])
    return {"lot": lot.pk, "quarantined": lot.quarantined}


def close_period(tx, data):
    day = tx.business_date
    if tx.site.closed_through and day < tx.site.closed_through:
        fail("Closed periods cannot be reopened through normal operations.")
    if not tx.reason:
        fail("Record the closing approval reason.")
    tx.site.closed_through = day
    tx.site.save(update_fields=["closed_through"])
    return {"closed_through": str(day)}


def policy(tx, data):
    if data.get("valuation_policy", "moving_average") != "moving_average":
        fail("This ERP uses moving weighted average; changing valuation requires an accounting migration.")
    if data.get("allocation_policy", "FEFO") not in ("FEFO", "FIFO"):
        fail("Choose FIFO or FEFO physical allocation.")
    if not tx.reason:
        fail("Record the policy approval reason.")
    tx.site.allocation_policy = data.get("allocation_policy", "FEFO")
    tx.site.overhead_allowed = bool(data.get("overhead_allowed"))
    tx.site.save(update_fields=["allocation_policy", "overhead_allowed"])
    return {"allocation_policy": tx.site.allocation_policy, "overhead_allowed": tx.site.overhead_allowed}


HANDLERS.update({"import_legacy": import_legacy, "activate": activate, "location": location,
                 "quarantine": quarantine, "close_period": close_period, "policy": policy})
