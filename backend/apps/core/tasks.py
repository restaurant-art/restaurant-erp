import csv
import io
from collections import defaultdict
from decimal import Decimal

from celery import shared_task
from django.core.files.base import ContentFile
from django.utils import timezone

from .models import InventoryItem, Restaurant, RestaurantSubscription


@shared_task
def send_low_stock_alerts():
    alerts = []
    for item in InventoryItem.objects.filter(current_stock__lte=0):
        alerts.append({"restaurant": item.restaurant_id, "item": item.name})
    return alerts


@shared_task
def mark_expired_subscriptions():
    now = timezone.now()
    expired = RestaurantSubscription.objects.filter(
        current_period_ends_at__lt=now,
        status__in=["trial", "active", "past_due"],
    ).update(status="expired")
    Restaurant.objects.filter(subscription__status="expired").update(status="inactive")
    return expired


@shared_task
def generate_report_export(report_export_id):
    from .models import Order, ReportExport, SharedAppState
    from .production_models import ProductionSite

    export = ReportExport.objects.filter(id=report_export_id).first()
    if export is None:
        return None
    if export.status == "ready" and export.file and export.file.storage.exists(export.file.name):
        return export.id
    if export.report_type != "daily-sales":
        export.status = "failed"
        export.save(update_fields=["status", "updated_at"])
        return export.id
    try:
        filters = export.filters
        start, end = filters.get("from") or "", filters.get("to") or ""
        totals = defaultdict(lambda: [0, Decimal(0), Decimal(0), Decimal(0)])
        sites = ProductionSite.objects.filter(branch__restaurant=export.restaurant)
        orders = Order.objects.filter(restaurant=export.restaurant, status__in=("completed", "refunded"))
        if export.branch_id:
            sites = sites.filter(branch_id=export.branch_id)
            orders = orders.filter(branch_id=export.branch_id)
        if start:
            orders = orders.filter(created_at__date__gte=start)
        if end:
            orders = orders.filter(created_at__date__lte=end)
        store_ids = set(sites.values_list("store_id", flat=True))

        def add(day, total, tax, refund=False):
            if not day or (start and day < start) or (end and day > end):
                return
            row = totals[day]
            if refund:
                row[3] += Decimal(str(total))
            else:
                row[0] += 1
                row[1] += Decimal(str(total))
            row[2] += (-1 if refund else 1) * Decimal(str(tax))

        for order in orders.iterator():
            day = timezone.localtime(order.created_at).date().isoformat()
            add(day, order.grand_total, order.tax_total)
            if order.status == "refunded":
                add(day, order.grand_total, order.tax_total, refund=True)
        shared_rows = dict(SharedAppState.objects.filter(
            state_key__in=("vestora-sales-ledger", "vestora-refunds-ledger", "vestora-refund-ledger"),
        ).values_list("state_key", "state_value"))
        for bill in shared_rows.get("vestora-sales-ledger") or []:
            if isinstance(bill, dict) and str(bill.get("storeId")) in store_ids:
                day = str(bill.get("businessDate") or bill.get("completedAt") or bill.get("createdAt") or bill.get("date") or "")[:10]
                add(day, bill.get("total") or 0, bill.get("tax") or 0)
        refunds = shared_rows.get("vestora-refunds-ledger") or shared_rows.get("vestora-refund-ledger") or []
        for refund in refunds:
            if isinstance(refund, dict) and str(refund.get("storeId")) in store_ids:
                day = str(refund.get("createdAt") or refund.get("date") or "")[:10]
                add(day, refund.get("amount") or 0, refund.get("taxAmount") or refund.get("tax") or 0, refund=True)
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(["Date", "Bills", "Sales incl. GST", "Refunds incl. GST", "Net GST", "Net sales ex. GST"])
        for day, (count, sales, gst, refunds) in sorted(totals.items()):
            writer.writerow([day, count, f"{sales:.2f}", f"{refunds:.2f}", f"{gst:.2f}", f"{sales - refunds - gst:.2f}"])
        export.file.save(f"daily-sales-{export.pk}.csv", ContentFile(output.getvalue().encode("utf-8")), save=False)
        export.status = "ready"
        export.save(update_fields=["status", "file", "updated_at"])
    except Exception:
        export.status = "failed"
        export.save(update_fields=["status", "updated_at"])
        raise
    return export.id
