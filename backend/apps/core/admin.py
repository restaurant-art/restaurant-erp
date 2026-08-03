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
class VestoraUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("VESTORA", {"fields": ("restaurant", "branches", "role", "user_type", "mobile", "two_factor_enabled", "custom_permissions")}),
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
    InventoryItem,
    StockMovement,
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
