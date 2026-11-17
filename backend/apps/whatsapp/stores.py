from .models import StoreConnection


def store_tenants(directory):
    """Resolve POS store IDs to their root store without matching mutable names."""
    if not isinstance(directory, list):
        return {}
    parents = {}
    for store in directory:
        if not isinstance(store, dict):
            continue
        store_id = store.get("id")
        if not isinstance(store_id, str) or not store_id or store_id == "GLOBAL" or len(store_id) > 128:
            continue
        parents[store_id] = None if store_id in parents else store.get("parentStoreId") or ""
    roots = {}
    for store_id in parents:
        current = store_id
        visited = set()
        while isinstance(current, str) and current in parents and current not in visited:
            parent = parents[current]
            if parent == "":
                roots[store_id] = current
                break
            visited.add(current)
            current = parent
    return roots


def prepare_connections(directory):
    roots = store_tenants(directory)
    existing = set(StoreConnection.objects.filter(pk__in=roots).values_list("pk", flat=True))
    StoreConnection.objects.bulk_create([
        StoreConnection(store_id=store_id, tenant_id=tenant_id)
        for store_id, tenant_id in roots.items() if store_id not in existing
    ], ignore_conflicts=True)


def active_store(access, store_id):
    return next((
        entry for entry in access["directory"]
        if isinstance(entry, dict) and entry.get("id") == store_id
        and str(entry.get("status", "")).casefold() not in {"inactive", "disabled", "suspended"}
    ), None)
