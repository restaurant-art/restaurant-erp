from datetime import timedelta

from django.db.models import Count, F, Q, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response

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
from .permissions import HasFeaturePermission, IsTenantUser
from .serializers import (
    AnnouncementSerializer,
    AttendanceSerializer,
    AuditLogSerializer,
    BranchSerializer,
    CustomerSerializer,
    DeviceLoginSerializer,
    EmployeeProfileSerializer,
    ExpenseSerializer,
    IntegrationSettingSerializer,
    InventoryItemSerializer,
    MenuCategorySerializer,
    MenuItemSerializer,
    OrderSerializer,
    PrinterSerializer,
    PurchaseOrderSerializer,
    ReportExportSerializer,
    RestaurantSerializer,
    RestaurantSubscriptionSerializer,
    RoleSerializer,
    StockMovementSerializer,
    SubscriptionPlanSerializer,
    SupplierSerializer,
    SupportTicketSerializer,
    TableSerializer,
    UserSerializer,
)


class TenantScopedViewSet(viewsets.ModelViewSet):
    permission_classes = (IsTenantUser, HasFeaturePermission)
    tenant_field = "restaurant"
    branch_field = "branch"

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_superuser or user.user_type == User.UserType.SUPER_ADMIN:
            return queryset
        if hasattr(queryset.model, "restaurant"):
            queryset = queryset.filter(restaurant=user.restaurant)
        branch_id = self.request.query_params.get("branch")
        if branch_id and hasattr(queryset.model, "branch"):
            queryset = queryset.filter(branch_id=branch_id)
        return queryset

    def perform_create(self, serializer):
        kwargs = {}
        if "restaurant" in [field.name for field in serializer.Meta.model._meta.fields]:
            kwargs["restaurant"] = self.request.user.restaurant
        serializer.save(**kwargs)


class RestaurantViewSet(viewsets.ModelViewSet):
    queryset = Restaurant.objects.all().order_by("name")
    serializer_class = RestaurantSerializer
    permission_classes = (IsAdminUser,)
    search_fields = ("name", "owner_email", "owner_mobile", "gst_number")

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        restaurant = self.get_object()
        restaurant.status = Restaurant.Status.ACTIVE
        restaurant.save(update_fields=["status", "updated_at"])
        return Response(RestaurantSerializer(restaurant).data)


class BranchViewSet(TenantScopedViewSet):
    queryset = Branch.objects.select_related("restaurant").all()
    serializer_class = BranchSerializer
    search_fields = ("name", "code", "city")


class RoleViewSet(TenantScopedViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    search_fields = ("name",)


class UserViewSet(TenantScopedViewSet):
    queryset = User.objects.select_related("restaurant", "role").prefetch_related("branches")
    serializer_class = UserSerializer
    search_fields = ("username", "email", "mobile", "first_name", "last_name")


class SubscriptionPlanViewSet(viewsets.ModelViewSet):
    queryset = SubscriptionPlan.objects.all()
    serializer_class = SubscriptionPlanSerializer
    permission_classes = (IsTenantUser,)


class RestaurantSubscriptionViewSet(TenantScopedViewSet):
    queryset = RestaurantSubscription.objects.select_related("restaurant", "plan")
    serializer_class = RestaurantSubscriptionSerializer


class MenuCategoryViewSet(TenantScopedViewSet):
    queryset = MenuCategory.objects.select_related("restaurant", "branch", "parent")
    serializer_class = MenuCategorySerializer
    search_fields = ("name",)
    ordering_fields = ("sort_order", "name")


class MenuItemViewSet(TenantScopedViewSet):
    queryset = MenuItem.objects.select_related("restaurant", "branch", "category")
    serializer_class = MenuItemSerializer
    filterset_fields = ("category", "available", "favourite")
    search_fields = ("name", "sku", "barcode")


class TableViewSet(TenantScopedViewSet):
    queryset = Table.objects.select_related("restaurant", "branch", "assigned_waiter")
    serializer_class = TableSerializer
    filterset_fields = ("status", "floor", "branch")
    search_fields = ("name", "floor")


class CustomerViewSet(TenantScopedViewSet):
    queryset = Customer.objects.select_related("restaurant", "branch")
    serializer_class = CustomerSerializer
    search_fields = ("name", "mobile", "email")


class OrderViewSet(TenantScopedViewSet):
    queryset = Order.objects.select_related("restaurant", "branch", "table", "customer", "cashier", "waiter").prefetch_related("items", "payments")
    serializer_class = OrderSerializer
    filterset_fields = ("status", "order_type", "branch", "source")
    search_fields = ("bill_number", "customer__mobile", "customer__name")

    @action(detail=False, methods=["post"], url_path="checkout")
    def checkout(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(self.get_serializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="kds-status")
    def kds_status(self, request, pk=None):
        order = self.get_object()
        order.status = request.data.get("status", order.status)
        order.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(order).data)


class InventoryItemViewSet(TenantScopedViewSet):
    queryset = InventoryItem.objects.select_related("restaurant", "branch")
    serializer_class = InventoryItemSerializer
    search_fields = ("name", "sku")


class StockMovementViewSet(TenantScopedViewSet):
    queryset = StockMovement.objects.select_related("restaurant", "branch", "item")
    serializer_class = StockMovementSerializer
    filterset_fields = ("movement_type", "item", "branch")


class SupplierViewSet(TenantScopedViewSet):
    queryset = Supplier.objects.select_related("restaurant", "branch")
    serializer_class = SupplierSerializer
    search_fields = ("name", "mobile", "gst_number")


class PurchaseOrderViewSet(TenantScopedViewSet):
    queryset = PurchaseOrder.objects.select_related("restaurant", "branch", "supplier")
    serializer_class = PurchaseOrderSerializer
    filterset_fields = ("status", "supplier", "branch")
    search_fields = ("po_number",)


class ExpenseViewSet(TenantScopedViewSet):
    queryset = Expense.objects.select_related("restaurant", "branch")
    serializer_class = ExpenseSerializer
    filterset_fields = ("category", "expense_date", "branch")


class EmployeeProfileViewSet(TenantScopedViewSet):
    queryset = EmployeeProfile.objects.select_related("restaurant", "branch", "user")
    serializer_class = EmployeeProfileSerializer
    search_fields = ("employee_code", "designation", "user__first_name", "user__mobile")

    def _can_manage_face(self, request):
        return request.user.is_superuser or request.user.user_type in {
            User.UserType.SUPER_ADMIN,
            User.UserType.RESTAURANT_ADMIN,
            User.UserType.HR,
        }

    def _audit(self, request, action, employee, before=None, after=None):
        AuditLog.objects.create(
            restaurant=employee.restaurant,
            branch=employee.branch,
            actor=request.user,
            action=action,
            entity="employee_face",
            entity_id=str(employee.id),
            before=before or {},
            after=after or {},
            ip_address=request.META.get("REMOTE_ADDR"),
        )

    @action(detail=True, methods=["post"], url_path="enroll-face")
    def enroll_face(self, request, pk=None):
        if not self._can_manage_face(request):
            return Response({"detail": "Admin or HR manager permission required."}, status=status.HTTP_403_FORBIDDEN)
        employee = self.get_object()
        descriptor = request.data.get("face_descriptor") or request.data.get("descriptor")
        consent = bool(request.data.get("face_consent") or request.data.get("consent"))
        samples = int(request.data.get("face_samples") or request.data.get("samples") or 0)
        if not consent:
            return Response({"detail": "Employee consent is required before face enrollment."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(descriptor, list) or len(descriptor) < 64:
            return Response({"detail": "A valid face descriptor array is required."}, status=status.HTTP_400_BAD_REQUEST)
        before = {"face_enrolled": bool(employee.face_descriptor), "face_samples": employee.face_samples}
        employee.face_descriptor = descriptor
        employee.face_consent = True
        employee.face_enrolled_at = timezone.now()
        employee.face_samples = max(samples, 1)
        employee.face_store_images = bool(request.data.get("face_store_images", False))
        employee.save(update_fields=["face_descriptor", "face_consent", "face_enrolled_at", "face_samples", "face_store_images", "updated_at"])
        self._audit(request, "face_enrolled", employee, before=before, after={"face_samples": employee.face_samples})
        return Response(self.get_serializer(employee).data)

    @action(detail=True, methods=["post"], url_path="delete-face")
    def delete_face(self, request, pk=None):
        if not self._can_manage_face(request):
            return Response({"detail": "Admin or HR manager permission required."}, status=status.HTTP_403_FORBIDDEN)
        employee = self.get_object()
        before = {"face_enrolled": bool(employee.face_descriptor), "face_samples": employee.face_samples}
        employee.face_descriptor = []
        employee.face_consent = False
        employee.face_enrolled_at = None
        employee.face_samples = 0
        employee.face_store_images = False
        employee.save(update_fields=["face_descriptor", "face_consent", "face_enrolled_at", "face_samples", "face_store_images", "updated_at"])
        self._audit(request, "face_deleted", employee, before=before, after={"face_enrolled": False})
        return Response(self.get_serializer(employee).data)


class AttendanceViewSet(TenantScopedViewSet):
    queryset = Attendance.objects.select_related("restaurant", "branch", "employee")
    serializer_class = AttendanceSerializer
    filterset_fields = ("shift", "branch", "employee", "status", "source")

    def _audit(self, request, action, attendance, before=None, after=None):
        AuditLog.objects.create(
            restaurant=attendance.restaurant,
            branch=attendance.branch,
            actor=request.user,
            action=action,
            entity="attendance",
            entity_id=str(attendance.id),
            before=before or {},
            after=after or {},
            ip_address=request.META.get("REMOTE_ADDR"),
        )

    def get_queryset(self):
        queryset = super().get_queryset()
        date = self.request.query_params.get("date")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if date:
            queryset = queryset.filter(check_in__date=date)
        if date_from:
            queryset = queryset.filter(check_in__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(check_in__date__lte=date_to)
        return queryset

    @action(detail=False, methods=["post"], url_path="mark")
    def mark(self, request):
        employee_id = request.data.get("employee")
        mark_type = request.data.get("mark_type", "auto")
        now = timezone.now()
        if not employee_id:
            return Response({"detail": "employee is required."}, status=status.HTTP_400_BAD_REQUEST)

        employee = EmployeeProfile.objects.select_related("restaurant", "branch", "user").filter(pk=employee_id)
        if not (request.user.is_superuser or request.user.user_type == User.UserType.SUPER_ADMIN):
            employee = employee.filter(restaurant=request.user.restaurant)
        employee = employee.first()
        if not employee:
            return Response({"detail": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)
        if not employee.is_active:
            return Response({"detail": "Employee is inactive."}, status=status.HTTP_400_BAD_REQUEST)

        today_records = self.get_queryset().filter(employee=employee, check_in__date=timezone.localdate())
        open_record = today_records.filter(check_out__isnull=True).order_by("-check_in").first()
        source = request.data.get("source", "face")
        confidence_score = request.data.get("confidence_score")
        device_id = request.data.get("device_id", "")
        shift = request.data.get("shift", "")

        if mark_type == "out" or (mark_type == "auto" and open_record):
            if not open_record:
                return Response({"detail": "No open attendance record for punch out."}, status=status.HTTP_400_BAD_REQUEST)
            before = {"check_out": open_record.check_out.isoformat() if open_record.check_out else None}
            open_record.check_out = now
            open_record.source = source
            open_record.confidence_score = confidence_score
            open_record.device_id = device_id
            open_record.save(update_fields=["check_out", "source", "confidence_score", "device_id", "updated_at"])
            self._audit(request, "attendance_punch_out", open_record, before=before, after={"check_out": open_record.check_out.isoformat()})
            return Response(self.get_serializer(open_record).data)

        attendance = Attendance.objects.create(
            restaurant=employee.restaurant,
            branch=employee.branch,
            employee=employee,
            check_in=now,
            shift=shift,
            source=source,
            confidence_score=confidence_score,
            device_id=device_id,
            status="present",
        )
        self._audit(request, "attendance_punch_in", attendance, after={"check_in": attendance.check_in.isoformat(), "source": source})
        return Response(self.get_serializer(attendance).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="payroll-summary")
    def payroll_summary(self, request):
        today = timezone.localdate()
        month = int(request.query_params.get("month") or today.month)
        year = int(request.query_params.get("year") or today.year)
        workday_start = request.query_params.get("shift_start", "09:30")
        half_day_hours = float(request.query_params.get("half_day_hours") or 4)
        full_day_hours = float(request.query_params.get("full_day_hours") or 8)
        overtime_after = float(request.query_params.get("overtime_after") or 9)
        employees = EmployeeProfile.objects.filter(is_active=True)
        if not (request.user.is_superuser or request.user.user_type == User.UserType.SUPER_ADMIN):
            employees = employees.filter(restaurant=request.user.restaurant)
        rows = []
        for employee in employees.select_related("user"):
            records = self.get_queryset().filter(employee=employee, check_in__year=year, check_in__month=month)
            present_days = 0
            half_days = 0
            late_count = 0
            overtime_hours = 0
            for record in records:
                hours = 0
                if record.check_out:
                    hours = (record.check_out - record.check_in).total_seconds() / 3600
                if hours >= full_day_hours:
                    present_days += 1
                elif hours >= half_day_hours:
                    half_days += 1
                elif record.check_in:
                    half_days += 1
                if record.check_in.strftime("%H:%M") > workday_start:
                    late_count += 1
                overtime_hours += max(0, hours - overtime_after)
            payable_days = present_days + (half_days * 0.5)
            rows.append({
                "employee": employee.id,
                "employee_code": employee.employee_code,
                "employee_name": employee.user.get_full_name().strip() or employee.user.username,
                "present_days": present_days,
                "half_days": half_days,
                "late_count": late_count,
                "overtime_hours": round(overtime_hours, 2),
                "payable_days": payable_days,
            })
        return Response({"month": month, "year": year, "rows": rows})


class SupportTicketViewSet(viewsets.ModelViewSet):
    queryset = SupportTicket.objects.select_related("restaurant", "created_by")
    serializer_class = SupportTicketSerializer
    permission_classes = (IsTenantUser,)

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.is_superuser:
            return queryset
        return queryset.filter(Q(restaurant=self.request.user.restaurant) | Q(created_by=self.request.user))


class AnnouncementViewSet(viewsets.ModelViewSet):
    queryset = Announcement.objects.all()
    serializer_class = AnnouncementSerializer
    permission_classes = (IsTenantUser,)


class IntegrationSettingViewSet(TenantScopedViewSet):
    queryset = IntegrationSetting.objects.select_related("restaurant", "branch")
    serializer_class = IntegrationSettingSerializer
    filterset_fields = ("provider", "enabled", "branch")


class PrinterViewSet(TenantScopedViewSet):
    queryset = Printer.objects.select_related("restaurant", "branch")
    serializer_class = PrinterSerializer
    filterset_fields = ("target", "printer_type", "branch")


class AuditLogViewSet(TenantScopedViewSet):
    queryset = AuditLog.objects.select_related("restaurant", "branch", "actor")
    serializer_class = AuditLogSerializer
    filterset_fields = ("action", "entity", "branch")

    def perform_create(self, serializer):
        serializer.save(restaurant=self.request.user.restaurant, actor=self.request.user)


class DeviceLoginViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DeviceLogin.objects.select_related("user")
    serializer_class = DeviceLoginSerializer
    permission_classes = (IsTenantUser,)

    def get_queryset(self):
        if self.request.user.is_superuser:
            return super().get_queryset()
        return super().get_queryset().filter(user=self.request.user)


class ReportExportViewSet(TenantScopedViewSet):
    queryset = ReportExport.objects.select_related("restaurant", "branch", "requested_by")
    serializer_class = ReportExportSerializer

    def perform_create(self, serializer):
        serializer.save(restaurant=self.request.user.restaurant, requested_by=self.request.user)


@api_view(["GET"])
def dashboard(request):
    user = request.user
    today = timezone.localdate()
    week_start = today - timedelta(days=6)
    orders = Order.objects.all()
    expenses = Expense.objects.all()
    inventory = InventoryItem.objects.all()
    if not (user.is_superuser or user.user_type == User.UserType.SUPER_ADMIN):
        orders = orders.filter(restaurant=user.restaurant)
        expenses = expenses.filter(restaurant=user.restaurant)
        inventory = inventory.filter(restaurant=user.restaurant)
    today_orders = orders.filter(created_at__date=today)
    week_sales = (
        orders.filter(created_at__date__gte=week_start)
        .values("created_at__date")
        .annotate(total=Sum("grand_total"), count=Count("id"))
        .order_by("created_at__date")
    )
    payload = {
        "today_sales": today_orders.aggregate(total=Sum("grand_total"))["total"] or 0,
        "today_orders": today_orders.count(),
        "live_kitchen_orders": orders.filter(status__in=["pending", "preparing", "ready"]).count(),
        "dine_in_orders": today_orders.filter(order_type="dine_in").count(),
        "takeaway_orders": today_orders.filter(order_type="takeaway").count(),
        "delivery_orders": today_orders.filter(order_type="delivery").count(),
        "online_orders": today_orders.filter(order_type__in=["online", "qr"]).count(),
        "today_expenses": expenses.filter(expense_date=today).aggregate(total=Sum("amount"))["total"] or 0,
        "pending_payments": orders.filter(payments__isnull=True).count(),
        "low_stock_alerts": inventory.filter(current_stock__lte=F("reorder_level")).count(),
        "customer_count": Customer.objects.filter(restaurant=user.restaurant).count() if user.restaurant else Customer.objects.count(),
        "sales_graph": list(week_sales),
    }
    payload["profit"] = payload["today_sales"] - payload["today_expenses"]
    return Response(payload)


@api_view(["GET"])
def report_summary(request):
    user = request.user
    orders = Order.objects.all()
    if not (user.is_superuser or user.user_type == User.UserType.SUPER_ADMIN):
        orders = orders.filter(restaurant=user.restaurant)
    data = {
        "sales_by_type": list(orders.values("order_type").annotate(total=Sum("grand_total"), count=Count("id"))),
        "sales_by_payment": list(orders.values("payments__mode").annotate(total=Sum("payments__amount"))),
        "cancelled_bills": orders.filter(status="cancelled").count(),
        "refunds": orders.filter(status="refunded").aggregate(total=Sum("grand_total"))["total"] or 0,
        "void_bills": orders.filter(status="void").count(),
    }
    return Response(data)


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok", "service": "VESTORA"})
