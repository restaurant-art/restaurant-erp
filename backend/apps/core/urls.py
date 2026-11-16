from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views
from . import cloud_views
from . import barcode_views, production_views
from . import training_otp
from . import gate_views
from . import pine_cloud

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
    path("cloud/pine-labs/<str:store_id>/connection/", pine_cloud.connection),
    path("cloud/pine-labs/<str:store_id>/payment/<str:action>/", pine_cloud.payment),
    path("cloud/pine-labs/<str:store_id>/print/", pine_cloud.print_job),
    path("barcodes/<str:store_id>/catalog/", barcode_views.catalog),
    path("barcodes/<str:store_id>/generate/", barcode_views.generate),
    path("barcodes/<str:store_id>/purchases/", barcode_views.purchases),
    path("barcodes/<str:store_id>/settings/", barcode_views.preferences),
    path("barcodes/<str:store_id>/jobs/", barcode_views.jobs),
    path("barcodes/<str:store_id>/jobs/<uuid:job_id>/handoff/", barcode_views.handoff),
    path("production/<str:store_id>/", production_views.workspace),
    path("production/<str:store_id>/setup/", production_views.setup),
    path("production/<str:store_id>/command/", production_views.command),
    path("production/<str:store_id>/reports/", production_views.reports),
    path("production/<str:store_id>/sale-costs/", production_views.sale_costs),
    path('gate/visits/', gate_views.visits),
    path('gate/visits/<uuid:visit_id>/<str:action>/', gate_views.movement),
    path("", include(router.urls)),
    path("dashboard/", views.dashboard),
    path("reports/summary/", views.report_summary),
    path("health/", views.health),
    path("ready/", views.readiness),
    path("cloud/auth/login/", cloud_views.cloud_login),
    path("cloud/auth/password/", cloud_views.cloud_password),
    path("cloud/profile/", cloud_views.cloud_profile),
    path("cloud/storage-status/", cloud_views.storage_status),
    path("cloud/state/", cloud_views.cloud_state),
    path("cloud/cashier-login/", cloud_views.cashier_login),
    path("cloud/training-otp/request/", training_otp.request_training_otp),
    path("cloud/training-otp/verify/", training_otp.verify_training_otp),
    path("cloud/action-otp/request/", training_otp.request_action_otp),
    path("cloud/action-otp/verify/", training_otp.verify_action_otp),
    path("cloud/staff-account/", cloud_views.staff_account),
    path("cloud/public-orders/", cloud_views.public_orders),
    path("cloud/public-orders/<uuid:order_id>/", cloud_views.public_orders),
    path("public-order/menu/", cloud_views.public_menu),
    path("public-order/orders/", cloud_views.public_order_create),
    path("cloud/<str:feature>/", cloud_views.unsupported_cloud_feature),
]
