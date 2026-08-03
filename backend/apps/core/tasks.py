from celery import shared_task
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
    from .models import ReportExport

    export = ReportExport.objects.get(id=report_export_id)
    export.status = "ready"
    export.save(update_fields=["status", "updated_at"])
    return export.id
