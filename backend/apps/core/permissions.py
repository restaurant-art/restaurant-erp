from rest_framework.permissions import BasePermission


class IsTenantUser(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser or request.user.user_type == "super_admin":
            return True
        restaurant = getattr(obj, "restaurant", None)
        if restaurant is None and hasattr(obj, "order"):
            restaurant = obj.order.restaurant
        return restaurant and restaurant == request.user.restaurant


class HasFeaturePermission(BasePermission):
    def has_permission(self, request, view):
        required = getattr(view, "required_permission", None)
        if not required or request.user.is_superuser:
            return True
        return required in request.user.effective_permissions
