from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    Announcement,
    Attendance,
    AuditLog,
    Branch,
    Customer,
    DeviceLogin,
    EmployeeProfile,
    Expense,
    IntegrationSetting,
    InventoryItem,
    MenuCategory,
    MenuItem,
    Order,
    OrderItem,
    Payment,
    Printer,
    PurchaseOrder,
    ReportExport,
    Restaurant,
    RestaurantSubscription,
    Role,
    StockMovement,
    SubscriptionPlan,
    Supplier,
    SupportTicket,
    Table,
    User,
)


@admin.register(User)
class UvproUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("UVPRO", {"fields": ("restaurant", "branches", "role", "user_type", "mobile", "two_factor_enabled", "custom_permissions")}),
    )


for model in [
    Restaurant,
    Branch,
    Role,
    SubscriptionPlan,
    RestaurantSubscription,
    MenuCategory,
    MenuItem,
    Table,
    Customer,
    Order,
    OrderItem,
    Payment,
    Supplier,
    PurchaseOrder,
    Expense,
    EmployeeProfile,
    Attendance,
    SupportTicket,
    Announcement,
    IntegrationSetting,
    Printer,
    AuditLog,
    DeviceLogin,
    ReportExport,
]:
    admin.site.register(model)


@admin.register(InventoryItem)
class InventoryAdmin(admin.ModelAdmin):
    def has_change_permission(self, request, obj=None):
        from .production_models import KitchenItem
        return super().has_change_permission(request, obj) and (obj is None or not KitchenItem.objects.filter(inventory_item=obj).exists())

    def has_delete_permission(self, request, obj=None):
        return self.has_change_permission(request, obj) and super().has_delete_permission(request, obj)


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "item":
            from .production_models import KitchenItem
            kwargs["queryset"] = InventoryItem.objects.exclude(pk__in=KitchenItem.objects.values("inventory_item_id"))
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def has_change_permission(self, request, obj=None):
        from .production_models import KitchenItem
        return super().has_change_permission(request, obj) and (obj is None or not KitchenItem.objects.filter(inventory_item_id=obj.item_id).exists())

    def has_delete_permission(self, request, obj=None):
        return self.has_change_permission(request, obj) and super().has_delete_permission(request, obj)
