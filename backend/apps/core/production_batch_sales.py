"""Attribute saved sales to the production lots issued at service."""
from collections import defaultdict
from decimal import Decimal, InvalidOperation

from django.db.models import Sum

from .models import OrderItem, SharedAppState
from .production_domain import QTY, money
from .production_models import (
    KitchenBalance, KitchenFulfillment, KitchenLot, KitchenMovement, KitchenTransaction, ProductionBatch,
)
from .production_reports import incomplete_fulfillment
from .production_service import ZERO, serial


def amount(value, default=ZERO):
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return default
    return parsed if parsed.is_finite() and ZERO <= parsed < Decimal("1e14") else default


def pos_lines(bill, refunds):
    items = bill.get("items") or []
    discounts = bill.get("lineDiscounts") or []
    if not isinstance(items, list) or not isinstance(discounts, list):
        return {}
    inclusive = bill.get("taxInclusive") is not False
    subtotal = ZERO
    lines = []
    for index, item in enumerate(items):
        if not isinstance(item, dict) or item.get("id") is None:
            return {}
        quantity = amount(item.get("qty"))
        rate = amount(item.get("price"), None)
        if not quantity or rate is None:
            return {}
        key = str(item.get("stockLineKey") or item.get("cartItemKey")
                  or f"{item['id']}::{str(item.get('name') or '').strip().lower()}")
        offer = amount(discounts[index]) if index < len(discounts) else ZERO
        tax_factor = 1 + amount(item.get("tax"), Decimal(5)) / 100
        gross = quantity * rate
        subtotal += gross
        after_offer = max(ZERO, gross - offer)
        lines.append((key, quantity, rate if inclusive else rate * tax_factor,
                      after_offer / tax_factor if inclusive else after_offer, after_offer))
    if len({line[0] for line in lines}) != len(lines):
        return {}

    total_weight = sum((line[3] for line in lines), ZERO)
    net_sales = amount(bill.get("taxableSubtotal"), None)
    if net_sales is None:
        paid = amount(bill.get("unroundedTotal", bill.get("total")), None)
        tax = amount(bill.get("tax"), None)
        if paid is not None and tax is not None:
            net_sales = max(ZERO, paid - tax)
        else:
            after_offer = sum((line[4] for line in lines), ZERO)
            final_amount = paid if paid is not None and inclusive else max(ZERO, subtotal - amount(bill.get("discount")))
            net_sales = total_weight * min(Decimal(1), final_amount / after_offer) if after_offer else ZERO
    if net_sales and not total_weight:
        return {}

    bill_total = amount(bill.get("total"))
    refund_total = ZERO
    for refund in refunds:
        refunded = amount(refund.get("amount"))
        tax = amount(refund.get("taxAmount", refund.get("tax")), None)
        refund_total += max(ZERO, refunded - tax) if tax is not None else (
            refunded * net_sales / bill_total if bill_total else ZERO)
    net_sales = max(ZERO, net_sales - refund_total)
    return {key: (quantity, rate, net_sales * weight / total_weight / quantity if total_weight else ZERO)
            for key, quantity, rate, weight, _ in lines}


def saved_pos_sales(site, references):
    if not references:
        return {}
    rows = dict(SharedAppState.objects.filter(
        state_key__in=("vestora-sales-ledger", "vestora-refund-ledger"),
    ).values_list("state_key", "state_value"))
    bills = {}
    for bill in rows.get("vestora-sales-ledger") or []:
        if not isinstance(bill, dict) or str(bill.get("storeId")) != site.store_id or bill.get("training"):
            continue
        reference = str(bill.get("stockOrderRef") or bill.get("tableOrderId") or bill.get("id"))
        if reference not in references or not bill.get("id"):
            continue
        if (str(bill.get("status") or "").lower() in {"draft", "hold", "void", "voided", "cancelled", "canceled"}
                or bill.get("paymentStatus") == "Terminal pending"):
            continue
        # Table checkout has one final bill, even with split payments.
        bills.setdefault(reference, {})[str(bill["id"])] = bill
    if not bills:
        return {}
    refunds = defaultdict(dict)
    bill_ids = {bill_id for matching in bills.values() for bill_id in matching}
    for refund in rows.get("vestora-refund-ledger") or []:
        if (isinstance(refund, dict) and str(refund.get("storeId")) == site.store_id and not refund.get("training")
                and str(refund.get("billId")) in bill_ids and refund.get("id")):
            refunds[str(refund["billId"])][str(refund["id"])] = refund
    return {reference: pos_lines(bill, refunds[bill_id].values())
            for reference, matching in bills.items() if len(matching) == 1
            for bill_id, bill in matching.items()}


def sales_by_line(site, fulfillments):
    orders = {f.line.order_id: f.line.order for f in fulfillments}
    pos = saved_pos_sales(site, {o.reference for o in orders.values() if not o.legacy_order_id})
    linked = {o.legacy_order_id: o.reference for o in orders.values()
              if o.legacy_order_id and o.legacy_order.status in ("completed", "refunded")}
    for line in OrderItem.objects.filter(order_id__in=linked, quantity__gt=0).select_related("order"):
        net_rate = max(ZERO, line.rate - line.discount / line.quantity) if line.order.status == "completed" else ZERO
        pos.setdefault(linked[line.order_id], {})[str(line.pk)] = (
            line.quantity, line.rate * (1 + line.tax_rate / 100), net_rate)
    return pos


def sales_totals(row):
    sales = None if row["sales_pending"] else money(row["net_sales"])
    cost = None if row["cost_pending"] else money(row["food_cost"])
    profit = sales - cost if sales is not None and cost is not None else None
    return {"net_sales": sales, "food_cost": cost, "gross_profit": profit,
            "margin_pct": profit * 100 / sales if profit is not None and sales else None}


def batch_sales_report(site, day):
    reversed_transactions = KitchenTransaction.objects.filter(
        site=site, kind="reverse", related_id__isnull=False,
    ).values("related_id")
    batches = list(ProductionBatch.objects.filter(site=site, status="posted", business_date=day)
                   .exclude(transaction_id__in=reversed_transactions).order_by("-pk"))
    if not batches:
        return []

    summaries, outputs = {}, {}
    for batch in batches:
        outputs_by_lot = {}
        for output in batch.actual.get("outputs", []):
            lot = output["lot"]
            output_cost = Decimal(output["cost"])
            pending = output.get("cost_incomplete", batch.actual.get("cost_incomplete")) or output_cost <= 0
            outputs_by_lot[lot] = {
                "name": output["name"], "unit": output["unit"], "produced": Decimal(output["quantity"]),
                "production_cost": None if pending else output_cost,
                "sold": ZERO, "awaiting_billing": ZERO, "remaining": ZERO,
            }
        outputs.update(outputs_by_lot)
        summaries[batch.pk] = {"id": batch.pk, "reference": batch.reference, "recipe": batch.snapshot["name"],
            "production_date": day, "outputs": list(outputs_by_lot.values()), "servings": {}}

    batch_ids = list(summaries)
    balances = KitchenBalance.objects.filter(lot__batch_id__in=batch_ids).values("lot_id", "lot__cost_incomplete")
    for row in balances.annotate(on_hand=Sum("quantity")):
        if row["lot_id"] in outputs:
            output = outputs[row["lot_id"]]
            output["remaining"] = row["on_hand"].quantize(QTY)
            if row["lot__cost_incomplete"]:
                output["production_cost"] = None

    serving_transactions = KitchenMovement.objects.filter(
        balance__lot__batch_id__in=batch_ids, transaction__site=site,
        category__in=("serving", "retail_sale"),
    ).values("transaction_id")
    related_lines = KitchenFulfillment.objects.filter(transaction_id__in=serving_transactions).values("line_id")
    fulfillments = KitchenFulfillment.objects.filter(transaction__site=site, line_id__in=related_lines)
    served = list(fulfillments.select_related("line__order__legacy_order", "transaction").order_by("line_id", "pk"))
    sales = sales_by_line(site, served) if served else {}
    lots = KitchenLot.objects.filter(site=site).select_related("item").only("batch_id", "cost_incomplete", "item__kind").in_bulk(
        {entry["lot"] for fulfillment in served for entry in fulfillment.allocations})
    unpriced = {pk for pk, lot in lots.items() if lot.cost_incomplete}
    dispositions = KitchenTransaction.objects.filter(site=site, kind="disposition",
        result__outcome="usable_return", related_id__in=fulfillments.values("transaction_id"))
    returns = {entry["movement"]: (Decimal(entry["quantity"]), Decimal(entry["value"]))
               for result in dispositions.values_list("result", flat=True) for entry in result.get("returns", [])}

    billed_so_far = defaultdict(Decimal)
    for fulfillment in served:
        line = fulfillment.line
        bill_quantity, rate, net_rate = sales.get(line.order.reference, {}).get(line.key, (ZERO, ZERO, ZERO))
        billed = min(fulfillment.quantity, max(ZERO, bill_quantity - billed_so_far[line.pk]))
        billed_so_far[line.pk] += billed
        fraction = billed / fulfillment.quantity
        cancelled = fulfillment.transaction.kind == "cancel" or (
            line.order.legacy_order_id and line.order.legacy_order.status in ("cancelled", "void"))
        group_cost, weights = defaultdict(Decimal), defaultdict(Decimal)
        shared_cost = ZERO
        # Include other production lots in the split even when only one batch's
        # production date is selected. Packaging and other direct add-ons follow the serving.
        for entry in fulfillment.allocations:
            lot = lots[entry["lot"]]
            quantity_returned, value_returned = returns.get(entry["movement"], (ZERO, ZERO))
            cost = Decimal(entry["cost"])
            if lot.batch_id is not None or lot.item.kind in ("prepared", "intermediate"):
                weights[lot.batch_id] += cost
                group_cost[lot.batch_id] += cost - value_returned
            else:
                shared_cost += cost - value_returned
            output = outputs.get(lot.pk)
            if output:
                consumed = Decimal(entry["quantity"]) - quantity_returned
                sold = (consumed * fraction).quantize(QTY)
                output["sold"] += sold
                if not cancelled:
                    output["awaiting_billing"] += consumed - sold

        if not billed:
            continue
        total_weight = sum(weights.values(), ZERO)
        cost_pending = incomplete_fulfillment(fulfillment, unpriced)
        for batch_id in weights.keys() & summaries.keys():
            name = fulfillment.snapshot["name"]
            row = summaries[batch_id]["servings"].setdefault((line.menu_key, name), {
                "name": name, "portions": ZERO, "rate_total": ZERO, "net_sales": ZERO,
                "food_cost": ZERO, "add_on_cost": ZERO, "sales_pending": False, "cost_pending": False,
            })
            if len(weights) == 1:
                share = Decimal(1)
            elif not cost_pending and total_weight:
                share = weights[batch_id] / total_weight
            else:
                row["sales_pending"] = row["cost_pending"] = True
                continue
            portions = billed * share
            row["portions"] += portions
            row["rate_total"] += rate * portions
            row["net_sales"] += net_rate * portions
            add_on_cost = shared_cost * share * fraction
            row["food_cost"] += group_cost[batch_id] * fraction + add_on_cost
            row["add_on_cost"] += add_on_cost
            row["cost_pending"] |= cost_pending

    result = []
    for batch in batches:
        row = summaries[batch.pk]
        servings = list(row["servings"].values())
        for output in row["outputs"]:
            output["other_use"] = max(ZERO, output["produced"] - output["remaining"] - output["sold"] - output["awaiting_billing"])
        pending_billing = any(output["awaiting_billing"] > 0 for output in row["outputs"])
        remaining = any(output["remaining"] > 0 for output in row["outputs"])
        sold = any(output["sold"] > 0 for output in row["outputs"])
        if pending_billing:
            status = "Awaiting billing"
        elif not remaining:
            status = "Fully sold" if sold and all(output["sold"] == output["produced"] for output in row["outputs"]) else "Closed with other use"
        else:
            status = "Partly sold" if sold else "In stock"
        totals = {field: sum((s[field] for s in servings), ZERO) for field in ("net_sales", "food_cost")}
        totals.update({field: any(s[field] for s in servings) for field in ("sales_pending", "cost_pending")})
        production_cost = None if any(o["production_cost"] is None for o in row["outputs"]) else Decimal(batch.actual["total_cost"])
        if status == "Fully sold":
            totals["cost_pending"] |= production_cost is None
            if not totals["cost_pending"]:
                totals["food_cost"] = production_cost + sum((s["add_on_cost"] for s in servings), ZERO)
        row.update(sales_totals(totals), status=status, production_cost=production_cost,
                   sales_pending=totals["sales_pending"], cost_pending=totals["cost_pending"])
        row["servings"] = [{**sales_totals(s), "name": s["name"], "portions": None if s["sales_pending"] else s["portions"],
            "average_rate": s["rate_total"] / s["portions"] if s["portions"] and not s["sales_pending"] else None,
            "net_rate": s["net_sales"] / s["portions"] if s["portions"] and not s["sales_pending"] else None,
            "cost_per_portion": s["food_cost"] / s["portions"] if s["portions"] and not s["cost_pending"] else None}
            for s in servings]
        result.append(row)
    return serial(result)
