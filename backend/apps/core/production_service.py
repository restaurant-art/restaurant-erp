"""All kitchen writes use one branch mutex and one database transaction.

PostgreSQL serializes the site row; the initial UPDATE also takes SQLite's write
lock before reads. There are no client balance deltas or floating point costs.
"""
import hashlib
import json
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import F, Max, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError

from .models import AuditLog, InventoryItem, SharedAppState
from .production_models import *
from .production_domain import METHODS, KINDS, UNITS, allocate_cost, check_cycles, fail, money, number, quantity
from .pack_stock import issue_split, validate_split
from .product_state import require_item_enabled

ZERO = Decimal(0)
NEGATIVE_STOCK_REFERENCE = "__negative_stock__:"


def serial(value):
    return json.loads(json.dumps(value, default=str))


def scoped(model, site, pk):
    try:
        return model.objects.get(pk=pk, site=site)
    except (model.DoesNotExist, ValueError, TypeError):
        fail(f"{model.__name__} is not in this branch.")


def business_date(site, value=None):
    try:
        day = date.fromisoformat(str(value)) if value else timezone.localdate()
    except ValueError:
        fail("Enter a valid business date.")
    if site.closed_through and day <= site.closed_through:
        fail("This business period is closed. Post a correction in an open period.")
    if site.cutover_at and day < timezone.localdate(site.cutover_at):
        fail("Do not replay pre-cutover transactions.")
    if day > timezone.localdate():
        fail("A posted movement cannot have a future business date.")
    return day


def moment(value):
    if not value:
        return None
    result = parse_datetime(str(value))
    if result is None or timezone.is_naive(result):
        fail("Preparation and expiry timestamps need a timezone.")
    return result


def recipe_snapshot(recipe):
    return {"id": recipe.pk, "key": recipe.key, "version": recipe.version,
            "name": recipe.name, "method": recipe.stock_method, **recipe.content}


def latest_recipes(site, kind):
    result = {}
    for recipe in KitchenRecipe.objects.filter(site=site, kind=kind).order_by("version"):
        result[recipe.key] = recipe
    return result


def normalize_rows(site, rows, allow_zero=False):
    if not isinstance(rows, list):
        fail("Component rows must be a list.")
    result, seen = [], set()
    for row in rows:
        item = scoped(KitchenItem, site, row.get("item"))
        require_item_enabled(item)
        if item.pk in seen:
            fail("Combine duplicate components into one row.")
        seen.add(item.pk)
        amount = quantity(item, row.get("quantity"), row.get("unit"), allow_zero)
        result.append({"item": item.pk, "name": item.inventory_item.name,
                       "quantity": str(amount), "unit": item.base_unit,
                       **({"weight": str(number(row.get("weight", 1), "Allocation weight"))} if "weight" in row else {})})
    return result


def available_balances(site, item, location, usable=True):
    rows = KitchenBalance.objects.filter(lot__site=site, lot__item=item, location=location, quantity__gt=0)
    if usable:
        rows = rows.filter(lot__quarantined=False).filter(Q(lot__expires_at__isnull=True) | Q(lot__expires_at__gt=timezone.now()))
    if site.allocation_policy == "FEFO":
        rows = rows.order_by(F("lot__expires_at").asc(nulls_last=True), "lot__received_at", "pk")
    else:
        rows = rows.order_by("lot__received_at", "pk")
    return list(rows.select_related("lot__item__inventory_item", "location"))


def is_negative_stock_balance(balance):
    return balance.lot.reference.startswith(NEGATIVE_STOCK_REFERENCE)


def last_known_unit_cost(site, item, location, before=None):
    """Find shortage cost only when a real purchase preceded the transaction.

    Product Master prices and opening/count/transfer receipts are not purchase
    history.  A prior approved purchase is the gate; when one exists, use the
    current moving average if stock remains, otherwise that purchase's unit cost.
    """
    before = before or timezone.now()
    reversed_purchases = KitchenTransaction.objects.filter(
        site=site, kind="reverse", related__kind="purchase", created_at__lt=before,
    ).values("related_id")
    purchases = KitchenMovement.objects.filter(
        balance__lot__site=site,
        balance__lot__item=item,
        transaction__site=site,
        transaction__kind="purchase",
        transaction__created_at__lt=before,
        category="purchase_receipt",
        quantity__gt=0,
    ).exclude(transaction_id__in=reversed_purchases)
    last_purchase = purchases.order_by("-transaction__created_at", "-pk").first()
    if not last_purchase:
        return ZERO

    positive = KitchenBalance.objects.filter(lot__site=site, lot__item=item, quantity__gt=0)
    local = positive.filter(location=location).aggregate(qty=Sum("quantity"), value=Sum("value"))
    qty, value = local["qty"] or ZERO, local["value"] or ZERO
    if qty > 0 and value > 0:
        return value / qty

    branch = positive.aggregate(qty=Sum("quantity"), value=Sum("value"))
    qty, value = branch["qty"] or ZERO, branch["value"] or ZERO
    if qty > 0 and value > 0:
        return value / qty

    return last_purchase.value / last_purchase.quantity


def negative_stock_balance(site, item, location):
    """Return the per-item/location shortage ledger row, not a physical lot."""
    reference = f"{NEGATIVE_STOCK_REFERENCE}{location.pk}"
    lot, _ = KitchenLot.objects.get_or_create(site=site, item=item, reference=reference,
        defaults={"pack_size": None})
    balance, _ = KitchenBalance.objects.get_or_create(lot=lot, location=location)
    return balance


def reserved(balance, exclude_line=None):
    rows = KitchenReservation.objects.filter(balance=balance)
    if exclude_line:
        rows = rows.exclude(line=exclude_line)
    return rows.aggregate(total=Sum("quantity"))["total"] or ZERO


def allocate(site, item, location, amount, selected=None, exclude_line=None, usable=True, sealed=False, pack_size=None,
             allow_negative=False):
    balances = available_balances(site, item, location, usable)
    if selected:
        chosen = [int(pk) for pk in selected]
        balances = sorted([b for b in balances if b.lot_id in chosen], key=lambda b: chosen.index(b.lot_id))
    remaining, picks = amount, {}
    # Use already opened stock first across eligible lots, then FEFO sealed stock.
    for loose_only in ([False] if sealed else [True, False]):
        for balance in balances:
            held = reserved(balance, exclude_line)
            available = max(ZERO, balance.quantity - held - picks.get(balance.pk, ZERO))
            if sealed:
                if not balance.lot.pack_size or balance.lot.pack_size != (pack_size or item.pack_size):
                    continue
                reservations = KitchenReservation.objects.filter(balance=balance)
                if exclude_line:
                    reservations = reservations.exclude(line=exclude_line)
                held_packs = reservations.aggregate(n=Sum("sealed_packages"))["n"] or 0
                available = min(available // balance.lot.pack_size, balance.sealed_packages - held_packs) * balance.lot.pack_size
            elif loose_only:
                reservations = KitchenReservation.objects.filter(balance=balance)
                if exclude_line:
                    reservations = reservations.exclude(line=exclude_line)
                held_packs = reservations.aggregate(n=Sum("sealed_packages"))["n"] or 0
                # Whole-pack promises do not reserve the already opened contents.
                # Keep measured reservations protected while consuming free loose
                # stock before opening a packet in another eligible lot.
                held_loose = max(ZERO, held - held_packs * (balance.lot.pack_size or ZERO))
                available = min(available, max(ZERO, balance.open_quantity - held_loose))
            take = min(remaining, available)
            if sealed:
                take = (take // balance.lot.pack_size) * balance.lot.pack_size
            if take > 0:
                picks[balance.pk] = picks.get(balance.pk, ZERO) + take
                remaining -= take
            if remaining == 0:
                break
        if remaining == 0:
            break
    if remaining and allow_negative:
        # Negative stock covers a real shortage. Do not bypass an order's
        # reservations when enough physical stock exists but is already
        # promised to another order.
        physical = sum((balance.quantity for balance in balances), ZERO)
        if physical >= amount:
            fail(f"{item.inventory_item.name} has enough stock, but it is reserved for another order.")
        deficit = negative_stock_balance(site, item, location)
        picks[deficit.pk] = picks.get(deficit.pk, ZERO) + remaining
        remaining = ZERO
    if remaining:
        fail(f"Insufficient usable {item.inventory_item.name} at {location.name}: short {remaining} {item.base_unit}.")
    by_id = {b.pk: b for b in balances}
    if allow_negative and any(pk not in by_id for pk in picks):
        deficit = negative_stock_balance(site, item, location)
        by_id[deficit.pk] = deficit
    return [(by_id[pk], amount) for pk, amount in picks.items() if amount > 0]


def move(tx, balance, qty, value, category, sealed_delta=None, open_delta=None):
    # Refresh because the same balance may occur in multiple components/lines.
    balance.refresh_from_db()
    value = money(value)
    negative_balance = is_negative_stock_balance(balance)
    next_quantity = balance.quantity + qty
    next_value = balance.value + value
    if not negative_balance and (next_quantity < 0 or next_value < 0):
        fail("Movement would create negative quantity or carrying value.")
    if negative_balance and ((next_quantity < 0 and next_value > 0) or
            (next_quantity == 0 and next_value != 0) or (next_quantity > 0 and next_value < 0)):
        fail("Negative stock quantity and carrying value must be settled together.")
    if sealed_delta is None:
        if negative_balance and next_quantity <= 0:
            sealed_delta, open_delta = 0, 0
        elif negative_balance and balance.quantity < 0:
            sealed_delta, open_delta = 0, next_quantity
        else:
            sealed_delta, open_delta = (issue_split(balance.quantity, balance.open_quantity,
                balance.sealed_packages, balance.lot.pack_size, -qty)[:2] if qty < 0 else (0, qty))
    next_open = balance.open_quantity + open_delta
    next_sealed = balance.sealed_packages + sealed_delta
    if negative_balance and next_quantity < 0:
        if balance.lot.pack_size or next_open != 0 or next_sealed != 0:
            fail("Negative stock must remain an unclassified base-unit shortage.")
    else:
        validate_split(next_quantity, next_open, next_sealed, balance.lot.pack_size)
    balance.sealed_packages += sealed_delta
    balance.open_quantity += open_delta
    balance.quantity += qty
    balance.value += value
    balance.save(update_fields=["quantity", "value", "sealed_packages", "open_quantity"])
    return KitchenMovement.objects.create(transaction=tx, balance=balance, category=category, quantity=qty, value=value,
        sealed_delta=sealed_delta, open_delta=open_delta)


def average_pool(tx, item, location):
    """Reconcile current lot values to the established moving weighted average.

    Value-only ledger rows make every redistribution explicit. Historic receipt
    and batch cost rows are never recosted.
    """
    rows = available_balances(tx.site, item, location, usable=False)
    total_qty = sum((b.quantity for b in rows), ZERO)
    total_value = sum((b.value for b in rows), ZERO)
    if not total_qty:
        return
    costs = allocate_cost(total_value, [b.quantity for b in rows])
    for balance, cost in zip(rows, costs):
        if cost != balance.value:
            move(tx, balance, ZERO, cost - balance.value, "valuation")


def issue_allocations(tx, allocations, category, mode="consume", cost_override=None):
    result = []
    for balance, amount in allocations:
        balance.refresh_from_db()
        if amount > balance.quantity or amount <= 0:
            fail("Issue exceeds the balance on hand.")
        if cost_override is None:
            cost = balance.value if amount == balance.quantity else money(balance.value * amount / balance.quantity)
        else:
            cost = money(cost_override)
            if cost < 0 or cost > balance.value:
                fail("The stock valuation cannot cover this issue.")
        sealed_delta, open_delta, sent_packs, sent_loose = issue_split(balance.quantity, balance.open_quantity,
            balance.sealed_packages, balance.lot.pack_size, amount, mode)
        held_packs = KitchenReservation.objects.filter(balance=balance).aggregate(n=Sum("sealed_packages"))["n"] or 0
        if balance.sealed_packages + sealed_delta < held_packs:
            fail("These unopened packs are reserved by a sale. Release the reservation before consuming them.")
        movement = move(tx, balance, -amount, -cost, category, sealed_delta, open_delta)
        result.append({"balance": balance.pk, "lot": balance.lot_id, "item": balance.lot.item_id,
                       "quantity": str(amount), "cost": str(cost), "movement": movement.pk,
                       "sealed_packages": sent_packs, "open_quantity": str(sent_loose),
                       "cost_incomplete": balance.lot.cost_incomplete or cost <= 0 or
                           (tx.site.valuation_policy == "moving_average" and KitchenBalance.objects.filter(
                               lot__item_id=balance.lot.item_id, location=balance.location, quantity__gt=0,
                               lot__cost_incomplete=True).exists())})
    return result


def issue_available_or_shortage(tx, item, location, amount, category, sealed=False, pack_size=None, exclude_line=None):
    """Consume real stock first; record only the unfilled remainder as debt."""
    picks = allocate(tx.site, item, location, amount, exclude_line=exclude_line,
        sealed=sealed, pack_size=pack_size, allow_negative=True)
    result = []
    for balance, quantity_to_issue in picks:
        if is_negative_stock_balance(balance):
            unit_cost = last_known_unit_cost(tx.site, item, location, before=tx.created_at)
            estimated_cost = money(unit_cost * quantity_to_issue)
            movement = move(tx, balance, -quantity_to_issue, -estimated_cost,
                "negative_stock_sale" if sealed else "negative_stock_serving", 0, 0)
            result.append({"balance": balance.pk, "lot": balance.lot_id, "item": item.pk,
                "quantity": str(quantity_to_issue), "unit_cost": str(unit_cost),
                "estimated_cost": str(estimated_cost), "cost": str(estimated_cost), "movement": movement.pk,
                "sealed_packages": 0, "open_quantity": "0", "negative_stock": True,
                "cost_incomplete": unit_cost <= 0})
        else:
            result.extend(issue_allocations(tx, [(balance, quantity_to_issue)], category,
                mode="sealed" if sealed else "consume"))
    return result


def receive(tx, item, location, amount, value, reference, category="receipt", batch=None, expires=None,
            prepared=None, lot=None, pack_size=None, sealed_packages=0, cost_incomplete=False):
    if amount <= 0:
        fail("A receipt needs positive good quantity.")
    if lot is None:
        lot = KitchenLot.objects.create(site=tx.site, item=item, reference=reference, batch=batch,
                                       expires_at=expires, prepared_at=prepared, pack_size=pack_size,
                                       cost_incomplete=cost_incomplete or value <= 0)
    balance, _ = KitchenBalance.objects.get_or_create(lot=lot, location=location)
    sealed_packages = number(sealed_packages, "Unopened packages")
    if sealed_packages != sealed_packages.to_integral_value():
        fail("Unopened packages must be a whole number.")
    if is_negative_stock_balance(balance):
        net_quantity = balance.quantity + amount
        opened_delta = max(ZERO, net_quantity) - max(ZERO, balance.quantity)
        move(tx, balance, amount, value, category, 0, opened_delta)
    else:
        move(tx, balance, amount, value, category, int(sealed_packages), amount - sealed_packages * (lot.pack_size or ZERO))
    settle_negative_stock(tx, item, location, balance)
    average_pool(tx, item, location)
    return balance


def settle_negative_stock(tx, item, location, receipt_balance):
    """Incoming stock pays earlier fulfilled shortages before becoming usable."""
    if (is_negative_stock_balance(receipt_balance) or receipt_balance.lot.quarantined or
            (receipt_balance.lot.expires_at and receipt_balance.lot.expires_at <= timezone.now())):
        return
    debts = KitchenBalance.objects.filter(lot__site=tx.site, lot__item=item,
        lot__reference__startswith=NEGATIVE_STOCK_REFERENCE, location=location,
        quantity__lt=0).select_related("lot").order_by("pk")
    for debt in debts:
        receipt_balance.refresh_from_db()
        debt.refresh_from_db()
        available = max(ZERO, receipt_balance.quantity - reserved(receipt_balance))
        amount = min(-debt.quantity, available)
        if amount <= 0:
            continue
        receipt_cost = money(receipt_balance.value * amount / receipt_balance.quantity)
        debt_cost = money(-debt.value * amount / -debt.quantity) if debt.quantity else ZERO
        clears_debt = amount == -debt.quantity
        consumes_receipt = amount == receipt_balance.quantity
        if consumes_receipt:
            # When no received quantity remains, consume its full actual value
            # and adjust the outstanding deficit to retain a valid carrying value.
            settlement_cost = receipt_balance.value
        elif clears_debt:
            # A surplus receipt is valued at the prior carrying cost of the
            # shortage. The remaining receipt value then gives the weighted
            # average cost of the stock that is physically left.
            settlement_cost = min(debt_cost, receipt_balance.value)
        else:
            settlement_cost = min(debt_cost, receipt_balance.value)

        debt_revaluation = debt_cost - settlement_cost
        next_debt_quantity = debt.quantity + amount
        next_debt_value = debt.value + debt_revaluation + settlement_cost
        if next_debt_quantity == 0:
            # Clear rounding or receipt-price variance when the deficit closes.
            debt_revaluation -= next_debt_value
        elif next_debt_value > 0:
            # A negative quantity cannot carry a positive value. Keep the
            # remaining shortage at zero value rather than invalidating stock.
            debt_revaluation -= next_debt_value
        if debt_revaluation:
            move(tx, debt, ZERO, debt_revaluation, "negative_stock_revaluation")
        issue_allocations(tx, [(receipt_balance, amount)], "negative_stock_settlement",
            mode="consume", cost_override=settlement_cost)
        move(tx, debt, amount, settlement_cost, "negative_stock_cleared", 0, 0)


def projected_inventory(site, item_ids=None):
    """Compatibility display only; the decimal subledger is authoritative."""
    mapping = {}
    items = KitchenItem.objects.filter(site=site).select_related("inventory_item")
    balances = KitchenBalance.objects.filter(lot__site=site).select_related("lot", "location")
    if item_ids is not None:
        items = items.filter(pk__in=item_ids)
        balances = balances.filter(lot__item_id__in=item_ids)
    by_item = {}
    for balance in balances:
        by_item.setdefault(balance.lot.item_id, []).append(balance)
    changed = []
    for item in items:
        package_rows = by_item.get(item.pk, [])
        qty = sum((balance.quantity for balance in package_rows), ZERO)
        value = sum((balance.value for balance in package_rows), ZERO)
        legacy_unit = item.inventory_item.unit.lower()
        factor = UNITS.get(legacy_unit, (item.base_unit, Decimal(item.measures.get(legacy_unit, 1))))[1]
        stock = qty / factor
        # Preserve the last positive unit valuation when net stock is zero or
        # negative; otherwise a shortage would display a negative unit cost.
        cost = value / stock if stock > 0 else Decimal(item.inventory_item.valuation_rate or 0)
        stored_stock = stock.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
        stored_cost = cost.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if item.inventory_item.current_stock != stored_stock or item.inventory_item.valuation_rate != stored_cost:
            item.inventory_item.current_stock = stored_stock
            item.inventory_item.valuation_rate = stored_cost
            changed.append(item.inventory_item)
        if item.legacy_key:
            locations = {}
            for b in package_rows:
                loc = locations.setdefault(str(b.location_id), {"name": b.location.name, "unopened": 0, "loose": 0.0, "total": 0.0})
                loc["unopened"] += b.sealed_packages
                loc["loose"] += float(b.open_quantity)
                loc["total"] += float(b.quantity)
            mapping[item.legacy_key] = {"stock": float(stock), "cost": float(cost), "productionManaged": True,
                "unopenedPacks": sum(b.sealed_packages for b in package_rows),
                "looseStock": float(sum((b.open_quantity for b in package_rows), ZERO)),
                "totalBaseStock": float(qty), "productionBaseUnit": item.base_unit,
                "packTracking": bool(item.pack_size), "stockLocations": locations,
                "productionConsumption": item.production_consumption}
    if changed:
        InventoryItem.objects.bulk_update(changed, ["current_stock", "valuation_rate"])
    row = SharedAppState.objects.select_for_update().filter(state_key=f"vestora-inventory-{site.store_id}").first()
    if row and isinstance(row.state_value, list):
        updated = [{**entry, **mapping.get(str(entry.get("id")), {})} for entry in row.state_value]
        if updated != row.state_value:
            row.state_value = updated
            row.save(update_fields=["state_value", "updated_at"])


def save_recipe(tx, data):
    kind = data.get("kind")
    if kind not in ("production", "serving"):
        fail("Choose a production or serving recipe.")
    key, name = str(data.get("key", "")).strip(), str(data.get("name", "")).strip()
    if not key or not name:
        fail("Recipe name and stable recipe/menu key are required.")
    current = latest_recipes(tx.site, kind).get(key)
    if int(data.get("expected_version", 0)) != (current.version if current else 0):
        fail("Recipe changed. Refresh before creating another version.")
    content = {"instructions": str(data.get("instructions", "")), "normal_loss_reference": str(data.get("normal_loss_reference", ""))}
    method = ""
    if kind == "production":
        content["inputs"] = normalize_rows(tx.site, data.get("inputs", []))
        for row in content["inputs"]:
            if not scoped(KitchenItem, tx.site, row["item"]).production_consumption:
                fail(f"Enable Production Consumption for {row['name']} before using it in a recipe.")
        content["outputs"] = normalize_rows(tx.site, data.get("outputs", []))
        if not content["inputs"] or not content["outputs"]:
            fail("A production recipe needs inputs and expected good outputs.")
        content["allocation"] = "explicit_weights"
        others = [r.content for k, r in latest_recipes(tx.site, kind).items() if k != key]
        check_cycles([*others, content])
    else:
        method = data.get("stock_method")
        if method not in METHODS:
            fail("Choose one explicit stock method.")
        content["components"] = normalize_rows(tx.site, data.get("components", []))
        if (method == "non_stock") != (not content["components"]):
            fail("Non-stock items must have no components; stocked servings must have components.")
        for component in content["components"]:
            item = scoped(KitchenItem, tx.site, component["item"])
            if method == "prepared" and item.kind not in ("prepared", "intermediate", "resale"):
                fail("Prepared servings cannot also deduct raw ingredients. Use cook on order for raw inputs.")
            if method == "resale" and item.kind != "resale" and not item.pack_size:
                fail("Purchased resale requires resale stock.")
            if method == "resale" and item.pack_size:
                if Decimal(component["quantity"]) % item.pack_size:
                    fail("A packaged resale serving must contain whole unopened packs.")
                component.update(sealed=True, pack_size=str(item.pack_size))
            if method == "cook_on_order" and not item.production_consumption:
                fail("Production Consumption is disabled for this ingredient.")
        content["measurement"] = "configured_portion_estimate"
    recipe = KitchenRecipe.objects.create(site=tx.site, key=key, version=(current.version + 1 if current else 1),
        name=name, kind=kind, stock_method=method, content=content, created_by=tx.actor)
    return recipe_snapshot(recipe)


def save_item(tx, data):
    name = str(data.get("name", "")).strip()
    if not name or data.get("kind") not in KINDS or data.get("base_unit") not in ("g", "ml", "piece"):
        fail("Enter an item name, stock type and base unit (g, ml or piece).")
    measures = {str(k).lower(): str(number(v, "Measure", allow_zero=False)) for k, v in data.get("measures", {}).items()}
    if set(measures) & set(UNITS):
        fail("Standard measurement units cannot be overridden.")
    if data["base_unit"] == "piece" and any(Decimal(v) != Decimal(v).to_integral_value() for v in measures.values()):
        fail("Piece measures must contain whole pieces.")
    if data.get("id"):
        item = scoped(KitchenItem, tx.site, data["id"])
        if item.base_unit != data["base_unit"] or item.kind != data["kind"]:
            has_history = KitchenMovement.objects.filter(balance__lot__item=item).exists()
            has_stock = KitchenBalance.objects.filter(lot__item=item).filter(
                Q(quantity__gt=0) | Q(open_quantity__gt=0) | Q(sealed_packages__gt=0)
            ).exists()
            if has_history or has_stock:
                fail("This product has stock history or on-hand quantity. Keep its current stock unit, or create a new SKU for a different unit.")
            item.base_unit = data["base_unit"]
            item.kind = data["kind"]
        item.measures = measures
        item.save(update_fields=["base_unit", "kind", "measures"])
        inventory_unit = str(data.get("inventory_unit", "")).strip().lower()
        if inventory_unit and item.inventory_item.unit != inventory_unit:
            item.inventory_item.unit = inventory_unit
            item.inventory_item.save(update_fields=["unit"])
        InventoryItem.objects.filter(pk=item.inventory_item_id).update(name=name)
    else:
        legacy_key = str(data.get("legacy_key", ""))
        if legacy_key and KitchenItem.objects.filter(site=tx.site, legacy_key=legacy_key).exists():
            fail("This legacy item is already mapped.")
        old = None
        if legacy_key:
            row = SharedAppState.objects.filter(state_key=f"vestora-inventory-{tx.site.store_id}").first()
            old = next((r for r in (row.state_value if row else []) if str(r.get("id")) == legacy_key), None)
            if not old:
                fail("Choose an existing inventory product to map.")
            if tx.site.enabled and number(old.get("stock", 0)) != 0:
                fail("After cutover, only an existing zero-stock legacy item can be newly mapped. Reconcile untracked on-hand stock before mapping.")
        inventory_unit = str(data.get("inventory_unit") or (old["unit"] if old else data["base_unit"])).strip().lower()
        inv = InventoryItem.objects.create(restaurant=tx.site.branch.restaurant, branch=tx.site.branch,
                                          name=name, unit=inventory_unit)
        item = KitchenItem.objects.create(site=tx.site, inventory_item=inv, kind=data["kind"],
            base_unit=data["base_unit"], measures=measures, legacy_key=legacy_key)
        if old and (inv.unit in UNITS or inv.unit in measures):
            quantity(item, 1, inv.unit, False)  # Validate known legacy display conversions, even with zero opening stock.
    if "pack_size" in data:
        pack_size = number(data["pack_size"], "Net quantity per pack", allow_zero=False) if data["pack_size"] is not None else None
        if item.pack_size != pack_size and item.pack_size and KitchenMovement.objects.filter(balance__lot__item=item).exists():
            fail("This SKU has stock history for its recorded pack size. Create a separate SKU and barcode for the different size, even when its current stock is zero.")
        if item.pack_size != pack_size and KitchenBalance.objects.filter(lot__item=item, sealed_packages__gt=0).exists():
            fail("This product has unopened stock. Create a separate product/SKU for a different pack size.")
        item.pack_size = pack_size
    if "production_consumption" in data:
        if not isinstance(data["production_consumption"], bool):
            fail("Production Consumption must be enabled or disabled.")
        item.production_consumption = data["production_consumption"]
    if item.pack_size and quantity(item, 1, item.inventory_item.unit, False) != item.pack_size:
        fail("Change pack contents in Product Master; the inventory unit and pack conversion must agree.")
    item.save(update_fields=["pack_size", "production_consumption"])
    return {"id": item.pk}


def _references_product(value, product_id):
    if isinstance(value, list):
        return any(_references_product(entry, product_id) for entry in value)
    if not isinstance(value, dict):
        return False
    reference_fields = ("item", "itemId", "productId", "inventoryItemId", "inventoryId", "item_id")
    if any(str(value.get(field)) == product_id for field in reference_fields if value.get(field) is not None):
        return True
    return any(_references_product(entry, product_id) for entry in value.values())


def delete_item(tx, data):
    fail("Inventory products are retained for stock and history. Use Disable or Enable instead of deleting.")


def draft_batch(tx, data):
    recipe = scoped(KitchenRecipe, tx.site, data.get("recipe"))
    if recipe.kind != "production":
        fail("Select a production recipe.")
    for component in recipe.content.get("inputs", []) + recipe.content.get("outputs", []):
        require_item_enabled(scoped(KitchenItem, tx.site, component["item"]))
    scale = number(data.get("scale", 1), "Planned batch scale", allow_zero=False)
    # Scaling by input or target is planning only. Actuals are never recalculated.
    if data.get("scale_item"):
        row = next((r for r in recipe.content[data.get("scale_basis", "inputs")] if str(r["item"]) == str(data["scale_item"])), None)
        if not row:
            fail("Scaling item is not in this recipe.")
        item = scoped(KitchenItem, tx.site, row["item"])
        scale = quantity(item, data.get("scale_quantity"), data.get("scale_unit"), False) / Decimal(row["quantity"])
        scale = scale.quantize(Decimal("0.000001"))
    reference = str(data.get("reference", "")).strip()
    if not reference or ProductionBatch.objects.filter(site=tx.site, reference=reference).exists():
        fail("Use a new, unique batch reference.")
    batch = ProductionBatch.objects.create(site=tx.site, reference=reference, recipe=recipe,
        parent_reference=str(data.get("parent_reference", "")), snapshot=recipe_snapshot(recipe), planned_scale=scale,
        source_location=scoped(KitchenLocation, tx.site, data.get("source_location")),
        destination_location=scoped(KitchenLocation, tx.site, data.get("destination_location")),
        business_date=tx.business_date, shift=str(data.get("shift", "")), operator=tx.actor)
    return {"id": batch.pk, "snapshot": batch.snapshot, "scale": str(scale)}


def post_batch(tx, data):
    batch = scoped(ProductionBatch, tx.site, data.get("batch"))
    if batch.status != "draft":
        fail("This batch is already settled. Use a linked correction or a new completed sub-batch.")
    tx.source = batch.reference
    tx.save(update_fields=["source"])
    business_date(tx.site, batch.business_date)
    if tx.business_date != batch.business_date:
        fail("Post using the batch business date.")
    inputs = normalize_rows(tx.site, data.get("inputs", []), allow_zero=True)
    outputs = normalize_rows(tx.site, data.get("outputs", []), allow_zero=True)
    for label, rows in (("inputs", inputs), ("outputs", outputs)):
        if {r["item"] for r in rows} != {r["item"] for r in batch.snapshot[label]}:
            fail(f"Confirm every snapshot {label} row, including zero quantities.")
    if not any(Decimal(r["quantity"]) > 0 for r in inputs):
        fail("Record actual ingredients consumed.")
    overhead = number(data.get("overhead", 0), "Overhead", precision=Decimal("0.00000001"))
    if overhead and not tx.site.overhead_allowed:
        fail("Production overhead is not enabled by this branch's costing policy.")
    allocations, shortages, input_cost = [], [], ZERO
    selections = data.get("selected_lots", {})
    for row in inputs:
        item = scoped(KitchenItem, tx.site, row["item"])
        if not item.production_consumption:
            fail(f"Production Consumption is disabled for {item.inventory_item.name}.")
        picks = allocate(tx.site, item, batch.source_location, Decimal(row["quantity"]),
            selections.get(str(item.pk)), allow_negative=True)
        used = []
        for balance, amount in picks:
            if is_negative_stock_balance(balance):
                unit_cost = last_known_unit_cost(tx.site, item, batch.source_location, before=tx.created_at)
                estimated_cost = money(unit_cost * amount)
                movement = move(tx, balance, -amount, -estimated_cost, "negative_stock_production_input", 0, 0)
                used.append({"balance": balance.pk, "lot": balance.lot_id, "item": item.pk,
                    "quantity": str(amount), "unit_cost": str(unit_cost), "estimated_cost": str(estimated_cost),
                    "cost": str(estimated_cost), "movement": movement.pk,
                    "sealed_packages": 0, "open_quantity": "0", "negative_stock": True,
                    "cost_incomplete": unit_cost <= 0})
                shortages.append({"item": item.pk, "item_name": item.inventory_item.name,
                    "location": batch.source_location_id, "location_name": batch.source_location.name,
                    "quantity": str(amount), "unit": item.base_unit, "unit_cost": str(unit_cost),
                    "estimated_cost": str(estimated_cost)})
            else:
                used.extend(issue_allocations(tx, [(balance, amount)], "production_input"))
        allocations.extend(used)
        input_cost += sum((Decimal(a["cost"]) for a in used), ZERO)
    total = money(input_cost + overhead)
    loss = number(data.get("abnormal_loss_cost", 0), "Abnormal loss cost", precision=Decimal("0.00000001"))
    good = [r for r in outputs if Decimal(r["quantity"]) > 0]
    disposition = str(data.get("disposition", "")).strip()
    if not good:
        if not disposition:
            fail("Zero good output requires a failed-batch disposition; actual consumption is retained.")
        loss = total
    if loss > total or (loss and not disposition):
        fail("Separately recognized loss must be within batch cost and have a disposition.")
    direct = data.get("direct_costs", {})
    direct_values = [number(direct.get(str(row["item"]), 0), "Direct cost", precision=Decimal("0.00000001")) for row in good]
    if set(direct) - {str(row["item"]) for row in good} or sum(direct_values) > total - loss:
        fail("Direct allocations must refer to good outputs and fit within eligible batch cost.")
    weights = {r["item"]: r.get("weight", "1") for r in batch.snapshot["outputs"]}
    costs = allocate_cost(total - loss - sum(direct_values), [weights[r["item"]] for r in good]) if good else []
    receipts = []
    cost_incomplete = any(entry["cost_incomplete"] for entry in allocations)
    for row, shared, direct_cost in zip(good, costs, direct_values):
        item = scoped(KitchenItem, tx.site, row["item"])
        amount, cost = Decimal(row["quantity"]), shared + direct_cost
        expires = moment(data.get("expires_at", {}).get(str(item.pk)))
        prepared = moment(data.get("prepared_at")) or timezone.now()
        if expires and expires <= prepared:
            fail("Expiry must follow preparation.")
        balance = receive(tx, item, batch.destination_location, amount, cost, batch.reference,
                          "production_receipt", batch, expires, prepared, cost_incomplete=cost_incomplete)
        receipts.append({**row, "lot": balance.lot_id, "cost": str(cost), "unit_cost": str(cost / amount),
                         "cost_incomplete": balance.lot.cost_incomplete})
    rejects = normalize_rows(tx.site, data.get("rejects", []), allow_zero=True)
    leftovers = normalize_rows(tx.site, data.get("leftovers", []), allow_zero=True)
    if any(r["item"] not in {o["item"] for o in outputs} for r in rejects):
        fail("Rejects must refer to configured outputs; they never enter saleable stock.")
    batch.actual = serial({"inputs": inputs, "outputs": receipts, "allocations": allocations,
        "shortages": shortages, "input_cost": input_cost, "overhead": overhead, "total_cost": total, "loss_cost": loss,
        "cost_incomplete": cost_incomplete,
        "rejects": rejects, "leftovers_observed": leftovers, "process_loss": str(data.get("process_loss", "")),
        "disposition": disposition, "notes": str(data.get("notes", "")),
        "loss_treatment": "normal rejects absorbed in good output; abnormal loss separately recognized"})
    batch.status = "posted" if good else "aborted"
    batch.transaction = tx
    batch.save(update_fields=["actual", "status", "transaction"])
    return {"batch": batch.pk, "status": batch.status, **batch.actual}


def validate_retail_component(item, snapshot, component):
    """Old packet products/orders must not turn unverified weight into packs."""
    if snapshot.get("method") not in ("retail", "resale") or item.inventory_item.unit.lower() in UNITS:
        return
    if not item.pack_size:
        fail("Save this product's pack contents in Product Master, then verify its unopened stock in Production Closing before selling packets.")
    if not component.get("sealed") or Decimal(str(component.get("pack_size") or 0)) != item.pack_size:
        fail("This order uses an older pack configuration. Refresh its stock reservation before selling unopened packs.")


def reserve_line(site, line, selected=None):
    KitchenReservation.objects.filter(line=line).delete()  # reservations are mutable promises, never movements
    outstanding = line.quantity - line.fulfilled - line.cancelled
    for component in line.snapshot.get("components", []):
        item = scoped(KitchenItem, site, component["item"])
        validate_retail_component(item, line.snapshot, component)
        amount = quantity(item, Decimal(component["quantity"]) * outstanding)
        sealed = bool(component.get("sealed"))
        picks = allocate(site, item, line.order.location, amount, (selected or {}).get(str(item.pk)),
                         sealed=sealed, pack_size=Decimal(component["pack_size"]) if sealed else None,
                         allow_negative=True)
        KitchenReservation.objects.bulk_create([KitchenReservation(line=line, balance=b, quantity=q,
            sealed_packages=int(q / b.lot.pack_size) if sealed and b.lot.pack_size else 0) for b, q in picks])


def confirm_order(tx, data):
    reference = str(data.get("reference", "")).strip()
    if not reference:
        fail("An order reference is required.")
    if reference in tx.site.legacy_snapshot.get("historic_order_references", []):
        fail("This is a pre-cutover order. Reconcile its physical stock separately; historic sales cannot be replayed.")
    location = scoped(KitchenLocation, tx.site, data.get("location"))
    order, created = KitchenOrder.objects.get_or_create(site=tx.site, reference=reference, defaults={"location": location})
    if order.location_id != location.pk:
        fail("An existing order cannot change kitchens.")
    entries = data.get("lines", [])
    if not entries:
        fail("Confirm at least one order line.")
    seen, result = set(), []
    recipes = latest_recipes(tx.site, "serving")
    for entry in entries:
        key, menu_key = str(entry.get("key", "")), str(entry.get("menu_key", ""))
        if not key or key in seen:
            fail("Order lines need unique stable keys.")
        seen.add(key)
        qty = number(entry.get("quantity"), "Serving quantity", allow_zero=False)
        line = order.lines.filter(key=key).first()
        if line:
            if line.menu_key != menu_key:
                fail("Use a new order line when changing a menu item.")
            if qty != line.quantity or entry.get("refresh_recipe") or entry.get("reallocate"):
                if int(entry.get("expected_revision", 0)) != line.revision:
                    fail("Order changed. Refresh its revision before amending reservations.")
                if qty < line.fulfilled + line.cancelled:
                    fail("An amendment cannot remove fulfilled or cancelled quantities.")
                if entry.get("refresh_recipe"):
                    if line.fulfilled:
                        fail("Add a new line to change portions after partial fulfillment.")
                    if line.snapshot.get("method") == "retail":
                        from .production_products import retail_snapshot
                        sales_unit = entry.get("sales_unit") or line.snapshot.get("sales_unit")
                        if not sales_unit:
                            fail("Select the selling unit when refreshing an older retail order.")
                        snapshot = retail_snapshot(tx.site, {**entry, "sales_unit": sales_unit,
                            "product_id": line.snapshot["product_id"]})
                    elif menu_key not in recipes:
                        fail(f"Configure serving components for menu item {menu_key}.")
                    else:
                        snapshot = recipe_snapshot(recipes[menu_key])
                    line.snapshot = {**snapshot, "commerce": line.snapshot.get("commerce", {})}
                if qty > line.quantity or entry.get("refresh_recipe") or entry.get("reallocate"):
                    for component in line.snapshot.get("components", []):
                        require_item_enabled(scoped(KitchenItem, tx.site, component["item"]))
                line.quantity = qty
                line.revision += 1
                line.save()
                reserve_line(tx.site, line, entry.get("selected_lots"))
        else:
            if entry.get("product_id"):
                from .production_products import retail_snapshot
                snapshot = retail_snapshot(tx.site, entry)
            elif menu_key not in recipes:
                fail(f"Configure an explicit stock method and serving components for menu item {menu_key}; no full/half conversion is inferred.")
            else:
                snapshot = recipe_snapshot(recipes[menu_key])
            snapshot["commerce"] = {"unit_price": str(number(entry.get("unit_price", 0), "Serving price", precision=Decimal("0.00000001"))),
                "tax_rate": str(number(entry.get("tax_rate", 0), "Serving tax rate")),
                "price_basis": "tax_exclusive" if entry.get("price_basis") == "tax_exclusive" else "tax_inclusive"}
            for component in snapshot.get("components", []):
                require_item_enabled(scoped(KitchenItem, tx.site, component["item"]))
            line = KitchenOrderLine.objects.create(order=order, key=key, menu_key=menu_key,
                snapshot=snapshot, quantity=qty)
            reserve_line(tx.site, line, entry.get("selected_lots"))
        result.append({"id": line.pk, "key": line.key, "quantity": str(line.quantity),
                       "fulfilled": str(line.fulfilled), "cancelled": str(line.cancelled),
                       "revision": line.revision, "snapshot": line.snapshot})
    return {"order": order.pk, "reference": order.reference, "lines": result}


def order_for(site, data):
    order = KitchenOrder.objects.filter(site=site, reference=str(data.get("reference", ""))).first()
    if not order:
        fail("Confirm the order before fulfillment or disposition.")
    return order


def fulfill_order(tx, data):
    order = order_for(tx.site, data)
    targets = data.get("targets")
    if not isinstance(targets, dict) or not targets:
        fail("Supply cumulative fulfilled targets for the selected order lines.")
    fulfilled = []
    for key, target in targets.items():
        line = order.lines.filter(key=key).first()
        if not line:
            fail("Unknown order line.")
        target = number(target, "Fulfilled target")
        if target > line.quantity - line.cancelled:
            fail("Fulfillment target must be between already fulfilled and ordered less cancelled.")
        if target <= line.fulfilled:
            continue  # an older KOT may be acknowledged after the full order was served
        start = data.get("expected_previous", {}).get(key)
        if start is not None and number(start) != line.fulfilled:
            fail("Complete the earlier KOT for this line first, or serve the entire order explicitly.")
        delta = target - line.fulfilled
        if not delta:
            continue  # independent retry keys still cannot fulfill the same target twice
        allocations = []
        for component in line.snapshot.get("components", []):
            item = scoped(KitchenItem, tx.site, component["item"])
            validate_retail_component(item, line.snapshot, component)
            if line.snapshot.get("method") == "cook_on_order" and not item.production_consumption:
                fail("Production Consumption is disabled for a reserved ingredient.")
            required = quantity(item, Decimal(component["quantity"]) * delta)
            for reservation in line.reservations.filter(balance__lot__item=item).select_related("balance__lot"):
                if required <= 0:
                    break
                lot = reservation.balance.lot
                if lot.quarantined or (lot.expires_at and lot.expires_at <= timezone.now()):
                    fail("Reserved stock is expired or quarantined. Explicitly reallocate this order before service.")
                take = min(required, reservation.quantity)
                if take:
                    sealed = bool(component.get("sealed"))
                    reservation.quantity -= take
                    negative_balance = is_negative_stock_balance(reservation.balance)
                    if sealed and not negative_balance:
                        if take % lot.pack_size:
                            fail("Sell a whole number of unopened packs.")
                        reservation.sealed_packages -= int(take / lot.pack_size)
                    reservation.save(update_fields=["quantity", "sealed_packages"])
                    if negative_balance:
                        # Recheck stock at service time: receipts after KOT
                        # confirmation are used before any new shortage posts.
                        allocations.extend(issue_available_or_shortage(tx, item, order.location, take,
                            "retail_sale" if sealed else "serving", sealed=sealed,
                            pack_size=Decimal(component["pack_size"]) if sealed else None,
                            exclude_line=line))
                    else:
                        allocations.extend(issue_allocations(tx, [(reservation.balance, take)], "retail_sale" if sealed else "serving",
                                                             mode="sealed" if sealed else "consume"))
                    required -= take
            if required:
                allocations.extend(issue_available_or_shortage(tx, item, order.location, required,
                    "retail_sale" if component.get("sealed") else "serving",
                    sealed=bool(component.get("sealed")),
                    pack_size=Decimal(component["pack_size"]) if component.get("sealed") else None,
                    exclude_line=line))
        fulfillment = KitchenFulfillment.objects.create(transaction=tx, line=line, quantity=delta,
            snapshot=line.snapshot, allocations=allocations)
        line.fulfilled = target
        line.save(update_fields=["fulfilled"])
        fulfilled.append({"id": fulfillment.pk, "line": key, "quantity": str(delta), "allocations": allocations,
                          "food_cost": str(sum((Decimal(a["cost"]) for a in allocations), ZERO)),
                          "cost_incomplete": any(a["cost_incomplete"] for a in allocations),
                          "measurement": "configured_portion_estimate"})
    return {"order": order.pk, "fulfillments": fulfilled}


def cancel_order(tx, data):
    order = order_for(tx.site, data)
    if not tx.reason:
        fail("Record the cancellation reason and physical disposition.")
    if data.get("used_targets"):
        fulfill_order(tx, {"reference": order.reference, "targets": data["used_targets"]})
    lines = order.lines.all()
    if data.get("line"):
        lines = lines.filter(key=str(data["line"]))
        if not lines.exists():
            fail("Unknown cancellation line.")
    result = []
    for line in lines:
        if line.fulfilled and data.get("disposition") not in ("no_return", "waste", "handled_separately"):
            fail("Food was already used. Record no return, waste, or a separate controlled return; refunds do not restore stock.")
        line.cancelled = line.quantity - line.fulfilled
        line.revision += 1
        line.save(update_fields=["cancelled", "revision"])
        KitchenReservation.objects.filter(line=line).delete()
        result.append({"line": line.key, "cancelled": str(line.cancelled), "already_used": str(line.fulfilled)})
    return {"lines": result, "disposition": data.get("disposition", "unused"), "stock_restored": False}


def transfer_or_usage(tx, data):
    location = scoped(KitchenLocation, tx.site, data.get("location"))
    item = scoped(KitchenItem, tx.site, data.get("item"))
    amount = quantity(item, data.get("quantity"), data.get("unit"), False)
    category = data.get("category")
    if category not in ("transfer", "waste", "staff_meal", "complimentary", "sample", "remake", "supplier_return"):
        fail("Choose a supported stock movement category.")
    if not tx.reason or not tx.source:
        fail("Every usage needs a reason and unique source reference.")
    if data.get("fulfillment") or data.get("order"):
        fail("Already served food needs a linked disposition, not another stock issue.")
    if KitchenTransaction.objects.filter(site=tx.site, kind="usage", source=tx.source).exclude(pk=tx.pk).exists():
        fail("This usage source has already been posted; open its transaction.")
    sealed = bool(item.pack_size and (data.get("stock_form") == "sealed" or
        str(data.get("unit", "")).lower() == item.inventory_item.unit.lower()))
    picks = allocate(tx.site, item, location, amount, data.get("selected_lots"), usable=category not in ("waste", "transfer", "supplier_return"), sealed=sealed)
    allocations = issue_allocations(tx, picks, "transfer_out" if category == "transfer" else category,
        mode="sealed" if sealed else "preserve" if category == "transfer" else "consume")
    if category == "transfer":
        destination = scoped(KitchenLocation, tx.site, data.get("destination"))
        if destination == location:
            fail("Choose a different destination.")
        for entry in allocations:
            lot = KitchenLot.objects.get(pk=entry["lot"])
            receive(tx, item, destination, Decimal(entry["quantity"]), Decimal(entry["cost"]), lot.reference, "transfer_in", lot=lot,
                    sealed_packages=entry["sealed_packages"])
    return {"allocations": allocations, "category": category}


def receipt(tx, data):
    location = scoped(KitchenLocation, tx.site, data.get("location"))
    item = scoped(KitchenItem, tx.site, data.get("item"))
    amount = quantity(item, data.get("quantity"), data.get("unit"), False)
    cost = number(data.get("total_cost"), "Receipt carrying value", precision=Decimal("0.00000001"))
    if item.kind in ("intermediate", "prepared") and data.get("category") != "opening":
        fail("Prepared stock must be received from a production batch or a controlled return.")
    if data.get("category") == "opening" and tx.site.enabled:
        fail("Opening balances can only be entered before cutover.")
    if not tx.source or not tx.reason:
        fail("Receipt source and valuation explanation are required.")
    if KitchenTransaction.objects.filter(site=tx.site, kind="receipt", source=tx.source).exclude(pk=tx.pk).exists():
        fail("This receipt source already exists.")
    balance = receive(tx, item, location, amount, cost, tx.source, data.get("category", "receipt"),
                      expires=moment(data.get("expires_at")), pack_size=item.pack_size,
                      sealed_packages=data.get("sealed_packages", number(data["quantity"]) if item.pack_size and str(data.get("unit", "")).lower() == item.inventory_item.unit.lower() else 0))
    return {"lot": balance.lot_id, "quantity": str(amount), "cost": str(cost)}


def disposition(tx, data):
    fulfillment = KitchenFulfillment.objects.filter(pk=data.get("fulfillment"), transaction__site=tx.site).first()
    if not fulfillment or not tx.reason:
        fail("A fulfillment in this branch and a reason are required.")
    outcome = data.get("outcome")
    if outcome not in ("no_return", "waste", "usable_return"):
        fail("Choose no return, waste, or a controlled usable return.")
    if KitchenTransaction.objects.filter(site=tx.site, kind="disposition", source=f"fulfillment:{fulfillment.pk}").exclude(pk=tx.pk).exists():
        fail("This fulfillment already has a disposition. Use a linked correction for a posting error.")
    tx.source = f"fulfillment:{fulfillment.pk}"
    tx.related = fulfillment.transaction
    tx.save(update_fields=["source", "related"])
    returns = []
    if outcome == "usable_return":
        location = scoped(KitchenLocation, tx.site, data.get("location"))
        for entry in data.get("returns", []):
            allocation = next((a for a in fulfillment.allocations if str(a["movement"]) == str(entry.get("movement"))), None)
            if not allocation or any(r["movement"] == allocation["movement"] for r in returns):
                fail("Select each original allocation at most once.")
            lot = KitchenLot.objects.get(pk=allocation["lot"])
            if lot.quarantined or (lot.expires_at and lot.expires_at <= timezone.now()):
                fail("Expired or quarantined food cannot be returned as usable.")
            amount = quantity(lot.item, entry.get("quantity"), allow_zero=False)
            original = Decimal(allocation["quantity"])
            if amount > original:
                fail("Returned quantity exceeds the original consumption.")
            value = money(Decimal(allocation["cost"]) * amount / original)
            sealed_count = number(entry.get("sealed_packages", 0), "Returned unopened packs")
            if sealed_count > allocation.get("sealed_packages", 0):
                fail("Returned unopened packs exceed the original sealed sale.")
            receive(tx, lot.item, location, amount, value, lot.reference, "controlled_return", lot=lot, sealed_packages=sealed_count)
            returns.append({"movement": allocation["movement"], "quantity": str(amount), "value": str(value)})
        if not returns:
            fail("Record actual recoverable quantities for a usable return.")
    return {"fulfillment": fulfillment.pk, "outcome": outcome, "returns": returns,
            "additional_stock_issue": False}


def inventory_product_ids(site):
    master = SharedAppState.objects.filter(state_key=f"vestora-inventory-{site.store_id}").values_list("state_value", flat=True).first() or []
    return {str(product.get("id")) for product in master if isinstance(product, dict) and product.get("id") is not None}


def count_items(site, scope):
    rows = KitchenItem.objects.filter(site=site)
    if scope == "inventory":
        rows = rows.filter(legacy_key__in=inventory_product_ids(site)).exclude(legacy_key="")
    elif scope == "production":
        rows = rows.filter(production_consumption=True)
    return rows


def validate_count_scope(count, expected=None):
    expected = count.expected if expected is None else expected
    expected_ids = {row["item"] for row in expected}
    eligible_ids = set(count_items(count.site, count.scope).values_list("pk", flat=True))
    if count.scope == "inventory" and count.mode == "full" and inventory_product_ids(count.site) - set(
            count_items(count.site, count.scope).values_list("legacy_key", flat=True)):
        fail("Save or link every inventory product in Product Master before completing a full stock take.")
    if not expected_ids.issubset(eligible_ids) or (count.mode == "full" and expected_ids != eligible_ids):
        fail("A new stock item or product setting changed during counting. Start a fresh stock take for this section.")
    items = {item.pk: item for item in count_items(count.site, count.scope).select_related("inventory_item")}
    for row in expected:
        item = items[row["item"]]
        if row.get("read_only_reason"):
            fail(row["read_only_reason"])
        if row.get("configuration_error"):
            fail(row["configuration_error"])
        if row.get("base_unit") and item.base_unit != row["base_unit"]:
            fail("Product measurement changed during counting. Start a fresh physical count.")
        if count.scope == "inventory" and row.get("count_basis") != "debt" and (item.inventory_item.unit != row.get("count_unit") or
                quantity(item, 1, item.inventory_item.unit, False) != Decimal(row["count_factor"])):
            fail("Product measurement changed during counting. Start a fresh physical count.")
        if row.get("new") and item.pack_size != (Decimal(row["pack_size"]) if row.get("pack_size") else None):
            fail("Pack contents changed during counting. Start a fresh physical count.")


def count_gain_rate(count, data, key):
    rate = number(data.get("unit_costs", {}).get(str(key)), "Count gain unit cost", precision=Decimal("0.00000001"))
    expected = next(row for row in count.expected if str(row["balance"]) == str(key))
    return rate / Decimal(expected.get("count_factor", "1"))


def start_count(tx, data):
    location = scoped(KitchenLocation, tx.site, data.get("location"))
    scope = data.get("scope", "all")
    if scope not in ("all", "inventory", "production"):
        fail("Choose Inventory or Production stock counting.")
    mode = data.get("mode", "legacy")
    if mode not in ("legacy", "single", "full", "items"):
        fail("Choose one item correction or a full stock take.")
    if mode == "items" and (scope != "inventory" or tx.kind != "inventory_start_count"):
        fail("Use the Inventory items list to correct selected stock quantities.")
    item = scoped(KitchenItem, tx.site, data.get("item")) if mode == "single" else None
    eligible_items = count_items(tx.site, scope)
    if scope == "inventory" and mode == "full" and inventory_product_ids(tx.site) - set(eligible_items.values_list("legacy_key", flat=True)):
        fail("Save or link every inventory product in Product Master before starting a full stock take.")
    if item and not eligible_items.filter(pk=item.pk).exists():
        fail("Choose a Product Master item in Inventory, or a production ingredient in Production.")
    balances = KitchenBalance.objects.filter(location=location, lot__site=tx.site).select_related("lot__item__inventory_item").order_by("pk")
    balances = balances.filter(lot__item__in=eligible_items)
    if item:
        balances = balances.filter(lot__item=item)
    expected = [{"balance": b.pk, "lot": b.lot_id, "item": b.lot.item_id,
                 "quantity": str(b.quantity), "value": str(b.value), "sealed_packages": b.sealed_packages,
                 "open_quantity": str(b.open_quantity),
                 "pack_size": str((b.lot.pack_size or b.lot.item.pack_size or "") if not is_negative_stock_balance(b) else ""),
                 "debt": is_negative_stock_balance(b),
                 **({"read_only_reason": "Verify this historical pack stock in Production before editing unopened packs in Inventory."}
                    if scope == "inventory" and not is_negative_stock_balance(b) and b.quantity > 0
                    and not b.lot.pack_size and (b.lot.item.pack_size or
                    str(b.lot.item.inventory_item.unit).strip().lower() not in UNITS) else {})} for b in balances]
    if mode != "legacy":
        items = [item] if item else list(eligible_items.select_related("inventory_item").order_by("inventory_item__name", "pk"))
        if not items:
            fail("Create stock items before starting a full stock take.")
        # A negative-stock debt row is not a physical lot. Give the operator a
        # separate zero-balance row in which to record physical packs or loose stock.
        physical_item_ids = {b.lot.item_id for b in balances if not is_negative_stock_balance(b)}
        for stock_item in items:
            if stock_item.pk not in physical_item_ids:
                expected.append({"balance": f"new:{stock_item.pk}", "lot": None, "item": stock_item.pk,
                    "quantity": "0", "value": "0", "sealed_packages": 0, "open_quantity": "0",
                    "pack_size": str(stock_item.pack_size or ""), "new": True})
    item_map = {entry.pk: entry for entry in eligible_items.select_related("inventory_item")}
    for row in expected:
        stock_item = item_map[row["item"]]
        unit = stock_item.inventory_item.unit if scope == "inventory" else stock_item.base_unit
        if scope == "inventory":
            row["count_basis"] = "debt" if row.get("debt") else "unverified" if row.get("read_only_reason") else "sealed" if row.get("pack_size") else "total"
            if row["count_basis"] in ("debt", "unverified"):
                unit = stock_item.base_unit
        row.update(count_unit=unit, base_unit=stock_item.base_unit)
        try:
            row["count_factor"] = row["pack_size"] if scope == "inventory" and row.get("count_basis") == "sealed" else str(quantity(stock_item, 1, unit, False))
        except ValidationError:
            if mode != "items":
                raise
            row.update(count_factor=None, configuration_error=(
                f"Configure the stock unit conversion for {stock_item.inventory_item.name} in Product Master before editing its quantity."))
    if scope == "inventory" and mode == "full":
        readonly = next((row for row in expected if row.get("read_only_reason")), None)
        if readonly:
            fail(readonly["read_only_reason"])
    count = KitchenCount.objects.create(site=tx.site, location=location, mode=mode, scope=scope, expected=expected, actor=tx.actor,
        cutoff_movement=KitchenMovement.objects.filter(transaction__site=tx.site).aggregate(last=Max("pk"))["last"] or 0)
    return {"id": count.pk, "location_id": location.pk, "mode": mode, "scope": scope,
            "cutoff": count.cutoff.isoformat(), "expected": expected}


def record_count(tx, data):
    count = scoped(KitchenCount, tx.site, data.get("count"))
    if count.adjustment_id:
        fail("This count is already adjusted.")
    entries = data.get("physical", [])
    if not isinstance(entries, list):
        fail("Physical counts must be a list.")
    if count.mode in ("single", "full") and {str(row.get("balance")) for row in entries if isinstance(row, dict)} != {str(row["balance"]) for row in count.expected}:
        fail("Enter a physical count for every listed batch, including zero, before recording this stock take.")
    selected_ids = {str(entry.get("balance")) for entry in entries if isinstance(entry, dict)}
    selected_expected = [row for row in count.expected if str(row["balance"]) in selected_ids]
    validate_count_scope(count, selected_expected if count.mode == "items" else None)
    existing_ids = [row["balance"] for row in count.expected if not row.get("new")]
    scoped_movements = KitchenMovement.objects.filter(balance__location=count.location,
        balance__lot__site=tx.site, balance__lot__item__in=count_items(tx.site, count.scope))
    if count.mode == "single":
        scoped_movements = scoped_movements.filter(balance__lot__item_id=count.expected[0]["item"])
    elif count.mode == "items":
        scoped_movements = scoped_movements.filter(balance__lot__item_id__in={row["item"] for row in selected_expected})
    if count.mode in ("single", "full", "items") and scoped_movements.filter(pk__gt=count.cutoff_movement).exclude(balance_id__in=existing_ids).exists():
        fail("A new stock lot arrived during counting. Start a fresh count so no stock is missed.")
    observed_movement = KitchenMovement.objects.filter(transaction__site=tx.site).aggregate(last=Max("pk"))["last"] or 0
    observed = []
    for entry in entries:
        if not isinstance(entry, dict):
            fail("Each physical count needs a stock row and quantity.")
        expected = next((r for r in count.expected if str(r["balance"]) == str(entry.get("balance"))), None)
        if not expected or any(str(r["balance"]) == str(expected["balance"]) for r in observed):
            fail("Count each listed stock row once.")
        new_balance = bool(expected.get("new"))
        balance = None if new_balance else KitchenBalance.objects.select_related("lot__item").get(pk=expected["balance"])
        item = scoped(KitchenItem, tx.site, expected["item"]) if new_balance else balance.lot.item
        counted = number(entry.get("quantity"))
        physical = quantity(item, counted * Decimal(expected.get("count_factor", "1")))
        size = Decimal(expected["pack_size"]) if expected.get("pack_size") else None
        sealed_basis = count.scope == "inventory" and expected.get("count_basis") == "sealed"
        if sealed_basis:
            if counted != counted.to_integral_value():
                fail("Count unopened packs as whole numbers.")
            physical = quantity(item, counted * size + (balance.open_quantity if balance else ZERO))
        if balance and is_negative_stock_balance(balance) and physical:
            fail("A negative-stock debt is not physical stock. Count it as zero and enter any physical stock on the new-stock row.")
        # The operator counts at a recorded time. Subsequent movement delta is
        # explicitly shown; opening the count does not stop kitchen operations.
        delta = (KitchenMovement.objects.filter(balance=balance, pk__gt=count.cutoff_movement).aggregate(q=Sum("quantity"))["q"] or ZERO) if balance else ZERO
        expected_now = Decimal(expected["quantity"]) + delta
        package_count = {}
        if size:
            sealed = counted if sealed_basis else physical / size if count.scope == "inventory" else number(entry.get("sealed_packages"), "Counted unopened packs")
            if sealed != sealed.to_integral_value():
                fail("Count unopened packs as whole numbers.")
            opened = physical - sealed * size
            from .pack_stock import validate_split
            validate_split(physical, opened, int(sealed), size)
            package_count = {"sealed_packages": int(sealed), "open_quantity": str(opened), "pack_size": str(size),
                "sealed_variance": int(sealed) - (balance.sealed_packages if balance else 0),
                "open_variance": str(opened - (balance.open_quantity if balance else ZERO))}
        observed.append({"balance": expected["balance"], "quantity": str(physical), "expected_at_cutoff": expected["quantity"],
            "counted_quantity": str(counted),
            "movement_since_cutoff": str(delta), "expected_at_observation": str(expected_now),
            "variance": str(physical - expected_now), "observed_at": timezone.now().isoformat(),
            "observed_movement": observed_movement if count.mode in ("single", "full", "items") else (KitchenMovement.objects.filter(balance=balance).aggregate(last=Max("pk"))["last"] or 0),
            **package_count})
    if not observed:
        fail("Enter at least one physical count.")
    count.physical = observed
    count.save(update_fields=["physical"])
    return {"id": count.pk, "physical": observed, "stock_changed": False}


def adjust_count(tx, data):
    count = scoped(KitchenCount, tx.site, data.get("count"))
    if count.adjustment_id or not count.physical or not tx.reason:
        fail("A recorded count, reason and an unposted adjustment are required.")
    selected_ids = {str(entry["balance"]) for entry in count.physical}
    selected_expected = [row for row in count.expected if str(row["balance"]) in selected_ids]
    validate_count_scope(count, selected_expected if count.mode == "items" else None)
    if count.mode in ("single", "full", "items"):
        scoped_movements = KitchenMovement.objects.filter(balance__location=count.location,
            balance__lot__site=tx.site, balance__lot__item__in=count_items(tx.site, count.scope),
            pk__gt=count.physical[0]["observed_movement"])
        if count.mode == "single":
            scoped_movements = scoped_movements.filter(balance__lot__item_id=count.expected[0]["item"])
        elif count.mode == "items":
            scoped_movements = scoped_movements.filter(balance__lot__item_id__in={row["item"] for row in selected_expected})
        if scoped_movements.exists():
            fail("Stock moved after the physical count. Record a fresh count before posting an adjustment.")
    adjustments = []
    for entry in count.physical:
        if str(entry["balance"]).startswith("new:"):
            delta = Decimal(entry["variance"])
            if not delta:
                continue
            item = scoped(KitchenItem, tx.site, int(str(entry["balance"]).split(":", 1)[1]))
            snapshot_size = Decimal(entry["pack_size"]) if entry.get("pack_size") else None
            if item.pack_size != snapshot_size:
                fail("Pack contents changed since counting. Record a fresh physical count.")
            rate = count_gain_rate(count, data, entry["balance"])
            lot = KitchenLot.objects.create(site=tx.site, item=item,
                reference=f"stock-count:{count.pk}:{item.pk}", pack_size=item.pack_size)
            balance = KitchenBalance.objects.create(lot=lot, location=count.location)
            move(tx, balance, delta, money(delta * rate), "count_adjustment",
                entry.get("sealed_packages", 0), Decimal(entry.get("open_quantity", str(delta))))
            average_pool(tx, item, count.location)
            adjustments.append({"balance": balance.pk, "quantity": str(delta),
                "sealed_delta": entry.get("sealed_packages", 0), "open_delta": entry.get("open_quantity", str(delta))})
            continue
        balance = KitchenBalance.objects.get(pk=entry["balance"])
        delta = Decimal(entry["variance"])
        if "sealed_variance" in entry:
            if KitchenMovement.objects.filter(balance=balance, pk__gt=entry["observed_movement"]).exists():
                fail("This pack balance moved after counting. Record a fresh physical count before adjustment.")
            if not delta and not entry["sealed_variance"] and not Decimal(entry["open_variance"]):
                continue
            if balance.quantity + delta < reserved(balance):
                fail("Resolve reservations before posting this shortage adjustment.")
            held = KitchenReservation.objects.filter(balance=balance).aggregate(n=Sum("sealed_packages"))["n"] or 0
            if entry["sealed_packages"] < held:
                fail("Release unopened-pack reservations before posting this count.")
            size = Decimal(entry["pack_size"])
            if (balance.lot.pack_size or balance.lot.item.pack_size) != size:
                fail("Pack contents changed since counting. Record the count again.")
            # Only an explicitly reviewed physical count may classify historical stock.
            if not balance.lot.pack_size:
                balance.lot.pack_size = size
                balance.lot.save(update_fields=["pack_size"])
            rate = balance.value / balance.quantity if balance.quantity else None
            value = ZERO
            if delta:
                if rate is None:
                    rate = count_gain_rate(count, data, balance.pk)
                value = money(delta * rate)
            move(tx, balance, delta, value, "count_adjustment", entry["sealed_variance"], Decimal(entry["open_variance"]))
            average_pool(tx, balance.lot.item, balance.location)
            adjustments.append({"balance": balance.pk, "quantity": str(delta), "sealed_delta": entry["sealed_variance"], "open_delta": entry["open_variance"]})
            continue
        if not delta:
            continue
        if balance.quantity + delta < reserved(balance):
            fail("Resolve reservations before posting this shortage adjustment.")
        if delta < 0:
            adjustments.extend(issue_allocations(tx, [(balance, -delta)], "count_adjustment"))
        else:
            rate = balance.value / balance.quantity if balance.quantity else None
            if rate is None:
                rate = count_gain_rate(count, data, balance.pk)
            move(tx, balance, delta, money(delta * rate), "count_adjustment")
            average_pool(tx, balance.lot.item, balance.location)
            adjustments.append({"balance": balance.pk, "quantity": str(delta)})
    count.adjustment = tx
    count.save(update_fields=["adjustment"])
    return {"count": count.pk, "physical": count.physical, "adjustments": adjustments}


def inventory_start_count(tx, data):
    if data.get("mode") not in ("single", "full", "items"):
        fail("Choose one product correction or a full Inventory stock take.")
    return start_count(tx, {**data, "scope": "inventory"})


def inventory_record_count(tx, data):
    count = scoped(KitchenCount, tx.site, data.get("count"))
    if count.scope != "inventory":
        fail("Use Production to count unopened packs and loose recipe stock.")
    return record_count(tx, data)


def inventory_adjust_count(tx, data):
    count = scoped(KitchenCount, tx.site, data.get("count"))
    if count.scope != "inventory":
        fail("Use Production to adjust unopened packs and loose recipe stock.")
    return adjust_count(tx, data)


def reverse_transaction(tx, data):
    original = scoped(KitchenTransaction, tx.site, data.get("transaction"))
    if not tx.reason or not data.get("no_physical_consumption"):
        fail("A posting-error reversal requires confirmation that no physical consumption occurred and a reason.")
    if original.kind not in ("post_batch", "receipt", "usage", "import_legacy", "purchase", "purchase_return"):
        fail("This source requires a specific correction, not a blanket reversal.")
    if KitchenTransaction.objects.filter(site=tx.site, kind="reverse", related=original).exists():
        fail("This transaction is already reversed.")
    movements = list(original.movements.select_related("balance__lot__item", "balance__location").order_by("-pk"))
    for movement in movements:
        if movement.quantity or movement.value:
            # Include value-only averaging on other lots and restored inputs:
            # subsequent issues must not inherit a silently rewritten cost pool.
            if KitchenMovement.objects.filter(balance=movement.balance, pk__gt=movement.pk).exclude(transaction=original).exists():
                fail("Output has downstream stock/cost dependencies. Resolve the linked transactions before correction.")
            if movement.quantity > 0 and reserved(movement.balance):
                fail("Release output reservations before reversing this batch.")
    for movement in movements:
        move(tx, movement.balance, -movement.quantity, -movement.value, "correction", -movement.sealed_delta, -movement.open_delta)
    tx.related = original
    tx.save(update_fields=["related"])
    if original.kind in ("purchase", "purchase_return"):
        from .production_purchase import reverse_purchase_invoice
        reverse_purchase_invoice(tx, original)
    return {"reversed": str(original.pk), "correction": str(tx.pk)}


HANDLERS = {"item": save_item, "delete_item": delete_item, "recipe": save_recipe, "draft_batch": draft_batch,
            "post_batch": post_batch, "confirm": confirm_order, "fulfill": fulfill_order,
            "cancel": cancel_order, "usage": transfer_or_usage, "receipt": receipt,
            "disposition": disposition, "start_count": start_count, "record_count": record_count,
            "inventory_start_count": inventory_start_count, "inventory_record_count": inventory_record_count,
            "inventory_adjust_count": inventory_adjust_count,
            "adjust_count": adjust_count, "reverse": reverse_transaction}


@transaction.atomic
def execute(site, actor, command, key, data, preview=False):
    # Commands are available to management scripts/tests as well as HTTP views.
    from . import production_cutover, production_purchase, production_products, production_repacking  # noqa: F401
    if not isinstance(data, dict) or not key or len(str(key)) > 180:
        fail("A stable operation key and command object are required.")
    if command not in HANDLERS:
        fail("Unsupported production command.")
    ProductionSite.objects.filter(pk=site.pk).update(lock_version=F("lock_version") + 1)
    site = ProductionSite.objects.select_for_update().get(pk=site.pk)
    fingerprint = hashlib.sha256(json.dumps({"command": command, "data": data}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    previous = KitchenTransaction.objects.filter(site=site, key=key).first()
    if previous:
        if previous.request_hash != fingerprint:
            fail("Operation key was already used for different content.")
        return previous.result
    if not site.enabled and command not in ("product", "product_status", "item", "delete_item", "recipe", "draft_batch", "receipt", "location", "import_legacy", "activate", "policy", "reverse"):
        fail("Review and activate the opening reconciliation before posting operations.")
    tx = KitchenTransaction.objects.create(site=site, key=key, request_hash=fingerprint, kind=command,
        source=str(data.get("source") or data.get("reference") or key), actor=actor,
        reason=str(data.get("reason", "")).strip(), business_date=business_date(site, data.get("business_date")))
    result = HANDLERS[command](tx, data)
    result = serial({**result, "transaction": tx.pk})
    effects = [{"item": m.balance.lot.item_id, "location": m.balance.location_id, "lot": m.balance.lot_id,
                "quantity": str(m.quantity), "value": str(m.value), "category": m.category,
                "sealed_delta": m.sealed_delta, "open_delta": str(m.open_delta)} for m in tx.movements.select_related("balance__lot")]
    result["effects"] = effects
    tx.result = result
    tx.save(update_fields=["result"])
    AuditLog.objects.create(restaurant=site.branch.restaurant, branch=site.branch, actor=actor,
        action=f"production.{command}", entity="KitchenTransaction", entity_id=str(tx.pk), after={"source": tx.source, "reason": tx.reason})
    if preview:
        transaction.set_rollback(True)
        return {**result, "preview": True}
    if site.enabled:
        if command == "activate":
            projected_inventory(site)
        elif effects or command in ("product", "repack"):
            item_ids = {entry["item"] for entry in effects} | set(result.get("projection_items", []))
            if command == "product":
                item_ids.add(result["item"])
            projected_inventory(site, item_ids)
    return result
