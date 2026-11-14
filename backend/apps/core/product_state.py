"""Product availability is independent of stock, prices and purchase/sale flags."""
from .models import SharedAppState
from .production_domain import fail


def products_for(site):
    value = SharedAppState.objects.filter(state_key=f"vestora-inventory-{site.store_id}").values_list("state_value", flat=True).first() or []
    return {str(row.get("id")): row for row in value if isinstance(row, dict)}


def product_enabled(product, products):
    if not product or str(product.get("status", "Active")).lower() == "inactive":
        return False
    parent_id = str(product.get("parentProductId") or "")
    parent = products.get(parent_id) if parent_id else None
    return not parent_id or bool(parent and str(parent.get("status", "Active")).lower() != "inactive")


def require_product_enabled(product, products):
    if not product_enabled(product, products):
        fail(f"{(product or {}).get('name') or 'This product'} is disabled. Enable it in Inventory before using it.")


def require_item_enabled(item):
    # Standalone prepared outputs and older non-catalogue ingredients retain
    # their established workflow; only an explicit catalogue disable blocks use.
    if item.legacy_key:
        products = products_for(item.site)
        product = products.get(str(item.legacy_key))
        if product is not None:
            require_product_enabled(product, products)
