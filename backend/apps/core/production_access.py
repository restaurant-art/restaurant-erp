from rest_framework.exceptions import PermissionDenied

from .cloud_views import _can_store, _user_access
from .models import Branch

ADMIN = {"owner", "restaurant_admin"}
CAPABILITIES = {
    "product": "inventory.products",
    "product_status": "inventory.products",
    "repack": "inventory.products",
    "purchase": "production.purchase", "purchase_return": "production.purchase",
    "item": "production.recipes", "delete_item": "production.recipes", "recipe": "production.recipes", "location": "production.recipes",
    "draft_batch": "production.post", "post_batch": "production.post", "usage": "production.post",
    "receipt": "production.post", "confirm": "production.serve", "fulfill": "production.serve",
    "cancel": "production.serve", "disposition": "production.adjust", "start_count": "production.post",
    "record_count": "production.post", "adjust_count": "production.adjust", "reverse": "production.reverse",
    "inventory_start_count": "inventory.stock_count", "inventory_record_count": "inventory.stock_count",
    "inventory_adjust_count": "inventory.stock_count",
    "setup": "production.cutover", "activate": "production.cutover", "import_legacy": "production.cutover",
    "policy": "production.cutover", "quarantine": "production.adjust", "close_period": "production.adjust",
}
DEFAULTS = {
    "branch_manager": {"inventory.products", "inventory.stock_count", "production.recipes", "production.post", "production.serve", "production.adjust", "production.purchase"},
    "manager": {"production.post", "production.serve"},
    "chef": {"production.post", "production.serve"}, "kitchen_staff": {"production.post", "production.serve"},
    "cashier": {"production.serve"}, "waiter": {"production.serve"}, "inventory_manager": {"inventory.products", "inventory.stock_count", "production.post"},
    "purchase_manager": {"production.purchase"},
}


def allowed_branches(user):
    rows = Branch.objects.filter(is_active=True)
    if user.is_superuser or user.user_type == "super_admin":
        return rows
    rows = rows.filter(restaurant_id=user.restaurant_id)
    if user.user_type not in ADMIN:
        rows = rows.filter(pk__in=user.branches.values("pk"))
    return rows


def require_access(user, store_id, branch=None, action=None):
    access = _user_access(user)
    if not _can_store(access, store_id):
        raise PermissionDenied("Store access denied.")
    if branch and not allowed_branches(user).filter(pk=branch.pk).exists():
        raise PermissionDenied("This account is not assigned to this tenant and branch.")
    if not action:
        return
    if user.is_superuser or user.user_type == "super_admin" or user.user_type in ADMIN:
        return
    capability = CAPABILITIES.get(action)
    permissions = set(user.effective_permissions) | DEFAULTS.get(user.user_type, set())
    linked = access.get("linked") or {}
    roles = [role for role in access.get("roles", []) if role.get("name") == linked.get("role")
             and str(role.get("storeId")) in (str(store_id), "GLOBAL")]
    role = next((r for r in roles if str(r.get("storeId")) == str(store_id)), next(iter(roles), None))
    if role is not None:
        if action == "repack":
            grants = role.get("permissions", [])
            if (role.get("status") != "Inactive" and "inventory" in role.get("modules", []) and
                    (not any(str(p).startswith("access:") for p in grants) or "access:inventory:repacking" in grants)):
                return
            raise PermissionDenied("Bulk Repacking access is required.")
        if action in ("product", "product_status") or str(action).startswith("inventory_"):
            grants = role.get("permissions", [])
            option = "access:inventory:create" if action in ("product", "product_status") else "access:inventory:stock-count"
            if (role.get("status") != "Inactive" and "inventory" in role.get("modules", []) and
                    (not any(str(p).startswith("access:") for p in grants) or option in grants)):
                return
            raise PermissionDenied("Product Master access is required." if action in ("product", "product_status") else "Inventory stock count access is required.")
        # A store role overrides its global namesake and built-in role defaults.
        permissions = set(role.get("permissions", [])) if role.get("status") != "Inactive" and "production" in role.get("modules", []) else set()
    if capability is None or capability not in permissions:
        raise PermissionDenied(f"Permission required: {capability or action}.")
