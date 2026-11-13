from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from .production_models import *
from .production_domain import UNITS
from .production_service import NEGATIVE_STOCK_REFERENCE, ZERO, latest_recipes, serial


def availability(site, location=None):
    items = {}
    balances = KitchenBalance.objects.filter(lot__site=site).select_related("lot__item__inventory_item", "location")
    if location:
        balances = balances.filter(location_id=location)
    balances = balances.annotate(held_qty=Sum("kitchenreservation__quantity"),
                                 held_packs=Sum("kitchenreservation__sealed_packages"))
    rows = []
    now = timezone.now()
    for b in balances:
        usable = not b.lot.quarantined and (not b.lot.expires_at or b.lot.expires_at > now)
        held = b.held_qty or ZERO
        is_shortage = b.lot.reference.startswith(NEGATIVE_STOCK_REFERENCE)
        available = (b.quantity - held if is_shortage else max(ZERO, b.quantity - held)) if usable else ZERO
        key = (b.location_id, b.lot.item_id)
        held_packs = b.held_packs or 0
        saleable_packs = max(0, min(b.sealed_packages - held_packs, int(available // b.lot.pack_size))) if usable and b.lot.pack_size else 0
        pool = items.setdefault(key, {"on_hand": ZERO, "available": ZERO, "value": ZERO, "sealed_available": ZERO, "cost_incomplete": False})
        pool["available"] += available
        if usable and b.quantity > 0:
            pool["on_hand"] += b.quantity
            pool["value"] += b.value
            pool["cost_incomplete"] |= b.lot.cost_incomplete or b.value <= 0
        if b.lot.pack_size == b.lot.item.pack_size:
            pool["sealed_available"] += saleable_packs * (b.lot.pack_size or ZERO)
        rows.append({"balance": b.pk, "lot": b.lot_id, "batch": b.lot.batch_id, "reference": b.lot.reference,
            "item": b.lot.item_id, "name": b.lot.item.inventory_item.name, "unit": b.lot.item.base_unit,
            "location": b.location_id, "location_name": b.location.name, "on_hand": b.quantity,
            "reserved": held, "available": available, "value": b.value, "usable": usable,
            "cost_incomplete": b.lot.cost_incomplete or (b.quantity > 0 and b.value <= 0),
            "unopened_packs": b.sealed_packages, "loose_quantity": b.open_quantity,
            "saleable_packs": saleable_packs,
            "pack_size": b.lot.pack_size, "pack_verified": bool(b.lot.pack_size),
            "pack_tracking_required": b.lot.item.inventory_item.unit.lower() not in UNITS,
            "expires_at": b.lot.expires_at, "quarantined": b.lot.quarantined})
    servings = []
    locations = KitchenLocation.objects.filter(site=site)
    if location:
        locations = locations.filter(pk=location)
    recipes = latest_recipes(site, "serving").values()
    for loc in locations:
        for recipe in recipes:
            limits, cost = [], ZERO
            complete = True
            for c in recipe.content["components"]:
                pool = items.get((loc.pk, c["item"]), {"on_hand": ZERO, "available": ZERO, "value": ZERO})
                required = Decimal(c["quantity"])
                limits.append(max(0, int(pool.get("sealed_available", ZERO) // required)) if c.get("sealed") else max(0, int(pool["available"] // required)))
                if pool["on_hand"] > 0 and not pool.get("cost_incomplete"):
                    cost += required * pool["value"] / pool["on_hand"]
                else:
                    complete = False
            servings.append({"menu_key": recipe.key, "name": recipe.name, "location": loc.pk,
                "available_servings": min(limits) if limits else None, "estimated_component_cost": cost if complete else None,
                "shared_stock": True, "method": recipe.stock_method, "recipe_version": recipe.version})
    return serial({"balances": rows, "servings": servings,
                   "note": "Menu availability represents alternative uses of shared components; counts must not be added."})


def closing_report(site, day, location=None):
    rows = {}
    movements = KitchenMovement.objects.filter(transaction__site=site, transaction__business_date__lte=day)
    if location:
        movements = movements.filter(balance__location_id=location)
    grouped = movements.values("balance_id", "balance__lot__item_id", "balance__lot__item__inventory_item__name",
        "balance__lot__item__base_unit", "balance__lot_id", "balance__lot__reference", "balance__location__name").annotate(
        opening=Sum("quantity", filter=Q(transaction__business_date__lt=day)),
        receipts=Sum("quantity", filter=Q(transaction__business_date=day, quantity__gt=0)),
        issues=Sum("quantity", filter=Q(transaction__business_date=day, quantity__lt=0)),
        closing=Sum("quantity"), closing_value=Sum("value"), unopened_packs=Sum("sealed_delta"),
        loose_quantity=Sum("open_delta")).order_by("balance_id")
    for group in grouped:
        key = group["balance_id"]
        rows[key] = {"balance": key, "item": group["balance__lot__item_id"],
            "name": group["balance__lot__item__inventory_item__name"], "unit": group["balance__lot__item__base_unit"],
            "lot": group["balance__lot_id"], "reference": group["balance__lot__reference"], "location": group["balance__location__name"],
            "opening": group["opening"] or ZERO, "receipts": group["receipts"] or ZERO, "issues": -(group["issues"] or ZERO),
            "closing": group["closing"], "closing_value": group["closing_value"],
            "unopened_packs": group["unopened_packs"], "loose_quantity": group["loose_quantity"], "categories": {}}
    for entry in movements.filter(transaction__business_date=day).values("balance_id", "category").annotate(total=Sum("quantity")):
        rows[entry["balance_id"]]["categories"][entry["category"]] = entry["total"]
    return serial(list(rows.values()))


def batch_report(batch):
    actual_inputs = {r["item"]: r for r in batch.actual.get("inputs", [])}
    actual_outputs = {r["item"]: r for r in batch.actual.get("outputs", [])}
    def compare(rows, actual):
        return [{**row, "standard_scaled": str(Decimal(row["quantity"]) * batch.planned_scale),
            "actual": actual.get(row["item"], {}).get("quantity", "0"),
            "difference": str(Decimal(actual.get(row["item"], {}).get("quantity", "0")) - Decimal(row["quantity"]) * batch.planned_scale)} for row in rows]
    return {"id": batch.pk, "reference": batch.reference, "parent_reference": batch.parent_reference,
        "status": batch.status, "date": str(batch.business_date), "shift": batch.shift,
        "source_location": batch.source_location_id, "destination_location": batch.destination_location_id,
        "recipe": batch.snapshot, "scale": str(batch.planned_scale), "actual": batch.actual,
        "transaction": str(batch.transaction_id) if batch.transaction_id else None,
        "input_comparison": compare(batch.snapshot["inputs"], actual_inputs),
        "output_comparison": compare(batch.snapshot["outputs"], actual_outputs),
        "comparison_basis": "snapshot standard quantities × planned batch scale; variation is not automatically waste"}


def trace(site, batch_id):
    batch = ProductionBatch.objects.filter(site=site, pk=batch_id).first()
    if not batch or not batch.transaction_id:
        return []
    return serial(list(KitchenMovement.objects.filter(transaction__site=site).filter(
        Q(balance__lot__batch_id=batch_id) | Q(transaction_id=batch.transaction_id) | Q(transaction__related_id=batch.transaction_id))
        .order_by("pk").values("id", "transaction_id", "transaction__kind", "transaction__source", "transaction__actor_id",
             "transaction__business_date", "category", "quantity", "value", "sealed_delta", "open_delta", "balance__location__name", "balance__lot_id")))


def uncosted_lots(fulfillments):
    lot_ids = {a["lot"] for f in fulfillments for a in f.allocations if "lot" in a and "cost_incomplete" not in a}
    return set(KitchenLot.objects.filter(pk__in=lot_ids, cost_incomplete=True).values_list("pk", flat=True))


def incomplete_fulfillment(fulfillment, old_lots):
    return any(a.get("cost_incomplete", Decimal(a.get("cost") or 0) <= 0 or a.get("lot") in old_lots)
               for a in fulfillment.allocations)


def posted_sale_costs(site, references):
    fulfillments = list(KitchenFulfillment.objects.filter(
        line__order__site=site, line__order__reference__in=references,
    ).select_related("line__order"))
    old_lots = uncosted_lots(fulfillments)
    orders = KitchenOrder.objects.filter(site=site, reference__in=references).prefetch_related("lines")
    costs = {}
    for order in orders:
        costs[order.reference] = {
            "cost": ZERO,
            "complete": all(line.fulfilled + line.cancelled >= line.quantity for line in order.lines.all()),
        }
    for fulfillment in fulfillments:
        order_cost = costs[fulfillment.line.order.reference]
        order_cost["cost"] += sum((Decimal(a["cost"]) for a in fulfillment.allocations), ZERO)
        order_cost["complete"] &= not incomplete_fulfillment(fulfillment, old_lots)
    recoveries = KitchenTransaction.objects.filter(site=site, kind="disposition", result__outcome="usable_return",
        related_id__in={f.transaction_id for f in fulfillments}).values_list("result", flat=True)
    reference_by_fulfillment = {f.pk: f.line.order.reference for f in fulfillments}
    for result in recoveries:
        reference = reference_by_fulfillment.get(result["fulfillment"])
        if reference:
            costs[reference]["cost"] -= sum((Decimal(entry["value"]) for entry in result.get("returns", [])), ZERO)
    return serial(costs)


def report(site, day, location=None):
    fulfillments = KitchenFulfillment.objects.filter(transaction__site=site, transaction__business_date=day).select_related("line__order")
    if location:
        fulfillments = fulfillments.filter(line__order__location_id=location)
    fulfillments = list(fulfillments)
    old_lots = uncosted_lots(fulfillments)
    sales = [{"fulfillment": f.pk, "order": f.line.order.reference, "line": f.line.key,
        "menu": f.snapshot["name"], "recipe_version": f.snapshot["version"], "quantity": str(f.quantity),
        "components": f.allocations, "food_cost": str(sum((Decimal(a["cost"]) for a in f.allocations), ZERO)),
        "gross_menu_value": str(f.quantity * Decimal(f.snapshot.get("commerce", {}).get("unit_price", 0))),
        "measurement": "configured portion estimate at posted inventory cost"} for f in fulfillments]
    for sale, fulfillment in zip(sales, fulfillments):
        incomplete = incomplete_fulfillment(fulfillment, old_lots)
        sale["cost_incomplete"] = incomplete
        sale["gross_food_margin"] = None if incomplete else str(Decimal(sale["gross_menu_value"]) - Decimal(sale["food_cost"]))
        commerce = fulfillment.snapshot.get("commerce", {})
        value = Decimal(sale["gross_menu_value"])
        if commerce.get("price_basis", "tax_inclusive") == "tax_inclusive":
            value /= 1 + Decimal(commerce.get("tax_rate", 0)) / 100
        sale["net_menu_value"] = str(value)
        sale["food_margin_before_discount"] = None if incomplete else str(value - Decimal(sale["food_cost"]))
        sale["margin_basis"] = "Saved menu value excluding tax less carrying food cost; discounts, refunds and operating expenses remain in financial reports."
    return {"day": str(day), "closing": closing_report(site, day, location), "sales": sales,
        "batches": [batch_report(b) for b in ProductionBatch.objects.filter(site=site, business_date=day)],
        "usage": serial(list(KitchenMovement.objects.filter(transaction__site=site, transaction__business_date=day)
            .exclude(category__in=("valuation", "serving", "production_input", "production_receipt"))
            .values("transaction_id", "transaction__source", "transaction__reason", "category", "quantity", "value", "balance_id"))),
        "dispositions": serial(list(KitchenTransaction.objects.filter(site=site, kind="disposition", business_date=day).values("id", "source", "reason", "result"))),
        "counts": serial(list(KitchenCount.objects.filter(site=site).values("id", "location_id", "mode", "scope", "cutoff", "expected", "physical", "adjustment_id")))}
