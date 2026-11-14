"""Block legacy balance writes after cutover, including old/offline clients."""
from decimal import Decimal, InvalidOperation
from .production_models import KitchenItem, KitchenOrder, ProductionSite

LEGACY_READ_ONLY_PREFIXES = (
    "food-stock", "production-batches", "production-wastage", "finished-goods", "recipes",
)


def legacy_read_only_keys(store_id):
    return {f"vestora-{prefix}-{store_id}" for prefix in LEGACY_READ_ONLY_PREFIXES}


def same_number(a, b):
    try:
        return Decimal(str(a)) == Decimal(str(b))
    except (InvalidOperation, ValueError):
        return a == b


def legacy_write_issue(key, previous, requested):
    from .cloud_views import _state_store
    store_id = _state_store(key)
    if store_id and key == f"vestora-inventory-{store_id}":
        old = {str(row.get("id")): row for row in (previous or []) if isinstance(row, dict)}
        new = {str(row.get("id")): row for row in (requested or []) if isinstance(row, dict)}
        if old.keys() - new.keys():
            return "Inventory products cannot be deleted. Use Disable or Enable in Product Master; stock and history are retained."
        if ProductionSite.objects.filter(store_id=store_id).exists() and any(
                old[item_id].get("status", "Active") != new[item_id].get("status", "Active") for item_id in old.keys() & new.keys()):
            return "Use the Enable or Disable action in Inventory to change product status. Refresh the product list before retrying."
    for site in ProductionSite.objects.filter(enabled=True):
        sid = site.store_id
        if key in legacy_read_only_keys(sid) and previous != requested:
            return "This branch uses the production ledger. Refresh the app; legacy stock/recipe writes are read-only after cutover."
        if key == f"vestora-inventory-{sid}":
            managed = set(KitchenItem.objects.filter(site=site).exclude(legacy_key="").values_list("legacy_key", flat=True))
            old = {str(row.get("id")): row for row in (previous or []) if isinstance(row, dict)}
            new = {str(row.get("id")): row for row in (requested or []) if isinstance(row, dict)}
            for item_id in managed:
                before, after = old.get(item_id), new.get(item_id)
                if before is None or after is None or before.get("unit") != after.get("unit") or any(not same_number(before.get(field), after.get(field)) for field in ("stock", "cost")):
                    return "Managed inventory balances must be posted through Production receipts, usage, transfers or physical closing. Refresh inventory after posting."
                if any(before.get(field) != after.get(field) for field in ("productionConsumption", "productionBaseUnit", "productionUnitFactor", "packTracking", "unopenedPacks", "looseStock", "totalBaseStock", "stockLocations")):
                    return "Save production settings through Product Master. Package balances are updated by the stock ledger."
        if key == "vestora-sales-ledger":
            old_ids = {str(row.get("id")) for row in (previous or []) if isinstance(row, dict)}
            for row in requested or []:
                if str(row.get("storeId")) != sid or str(row.get("id")) in old_ids:
                    continue
                # A previously completed offline bill may be retained as history,
                # but is never dispatched to the kitchen fulfillment service.
                from django.utils.dateparse import parse_datetime
                from django.utils import timezone
                completed = parse_datetime(str(row.get("completedAt") or row.get("createdAt") or ""))
                if completed and timezone.is_aware(completed) and completed < site.cutover_at:
                    continue
                reference = str(row.get("tableOrderId") or row.get("id"))
                if not KitchenOrder.objects.filter(site=site, reference=reference).exists():
                    return "Confirm serving components through the current POS before saving a new bill. Historic offline bills retain their original completion timestamp."
        if key == f"vestora-inventory-transactions-{sid}":
            # Financial/invoice metadata may be extended, but posted receipts
            # linked to kitchen stock remain immutable.
            old = {str(r.get("id")): r for r in previous or []}
            new = {str(r.get("id")): r for r in requested or []}
            for row_id, row in old.items():
                if row.get("productionTransaction") and new.get(row_id) != row:
                    return "Posted purchase stock has immutable history. Use a linked correction or supplier return."
    return None
