from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views
from . import cloud_views

router = DefaultRouter()
router.register("restaurants", views.RestaurantViewSet)
router.register("branches", views.BranchViewSet)
router.register("roles", views.RoleViewSet)
router.register("users", views.UserViewSet)
router.register("subscription-plans", views.SubscriptionPlanViewSet)
router.register("subscriptions", views.RestaurantSubscriptionViewSet)
router.register("menu-categories", views.MenuCategoryViewSet)
router.register("menu-items", views.MenuItemViewSet)
router.register("tables", views.TableViewSet)
router.register("customers", views.CustomerViewSet)
router.register("orders", views.OrderViewSet)
router.register("inventory-items", views.InventoryItemViewSet)
router.register("stock-movements", views.StockMovementViewSet)
router.register("suppliers", views.SupplierViewSet)
router.register("purchase-orders", views.PurchaseOrderViewSet)
router.register("expenses", views.ExpenseViewSet)
router.register("employees", views.EmployeeProfileViewSet)
router.register("attendance", views.AttendanceViewSet)
router.register("support-tickets", views.SupportTicketViewSet)
router.register("announcements", views.AnnouncementViewSet)
router.register("integrations", views.IntegrationSettingViewSet)
router.register("printers", views.PrinterViewSet)
router.register("audit-logs", views.AuditLogViewSet)
router.register("device-logins", views.DeviceLoginViewSet)
router.register("report-exports", views.ReportExportViewSet)

urlpatterns = [
    path("", include(router.urls)),
    path("dashboard/", views.dashboard),
    path("reports/summary/", views.report_summary),
    path("health/", views.health),
    path("cloud/auth/login/", cloud_views.cloud_login),
    path("cloud/auth/password/", cloud_views.cloud_password),
    path("cloud/profile/", cloud_views.cloud_profile),
    path("cloud/state/", cloud_views.cloud_state),
    path("cloud/cashier-login/", cloud_views.cashier_login),
    path("cloud/staff-account/", cloud_views.staff_account),
    path("cloud/public-orders/", cloud_views.public_orders),
    path("cloud/public-orders/<uuid:order_id>/", cloud_views.public_orders),
    path("public-order/menu/", cloud_views.public_menu),
    path("public-order/orders/", cloud_views.public_order_create),
    path("cloud/<str:feature>/", cloud_views.unsupported_cloud_feature),
]
