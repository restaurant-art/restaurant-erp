"""The relational REST order API uses the same event as the browser POS/KDS."""
from .production_access import require_access
from .production_domain import fail
from .production_models import KitchenLocation, KitchenOrder, ProductionSite
from .production_service import execute


def confirm_relational_order(order, user, confirm_held=False):
    site = ProductionSite.objects.filter(branch=order.branch, enabled=True).first()
    if not site or (order.status == "hold" and not confirm_held):
        return
    require_access(user, site.store_id, site.branch, "confirm")
    location = KitchenLocation.objects.filter(site=site, pk=order.metadata.get("stock_location")).first() if order.metadata.get("stock_location") else KitchenLocation.objects.filter(site=site, name="Kitchen").first()
    if not location:
        fail("Select a valid kitchen for this order.")
    result = execute(site, user, "confirm", f"rest-confirm:{order.pk}", {"reference": f"rest:{order.pk}", "location": location.pk,
        "lines": [{"key": str(line.pk), "menu_key": str(line.menu_item_id), "quantity": str(line.quantity),
            "unit_price": str(line.rate), "tax_rate": str(line.tax_rate), "price_basis": "tax_exclusive"} for line in order.items.all()]})
    KitchenOrder.objects.filter(pk=result["order"]).update(legacy_order=order)


def status_relational_order(order, user, status, reason="", disposition=""):
    site = ProductionSite.objects.filter(branch=order.branch, enabled=True).first()
    if not site:
        return
    managed = KitchenOrder.objects.filter(legacy_order=order, site=site).first()
    if not managed and order.status == "hold" and status in ("pending", "preparing", "ready", "completed"):
        if order.created_at < site.cutover_at:
            fail("Reconcile pre-cutover held orders explicitly; historical consumption is not replayed.")
        confirm_relational_order(order, user, confirm_held=True)
        managed = KitchenOrder.objects.get(legacy_order=order, site=site)
    if not managed:
        fail("This order predates confirmation/cutover. Confirm its components explicitly; do not replay historic sales.")
    if status == "completed":
        require_access(user, site.store_id, site.branch, "fulfill")
        execute(site, user, "fulfill", f"rest-serve:{order.pk}", {"reference": managed.reference,
            "targets": {line.key: str(line.quantity - line.cancelled) for line in managed.lines.all()}})
    elif status in ("cancelled", "void"):
        require_access(user, site.store_id, site.branch, "cancel")
        execute(site, user, "cancel", f"rest-cancel:{order.pk}", {"reference": managed.reference, "reason": reason, "disposition": disposition})
    # ready/preparing and financial refunds have no inventory effect.
