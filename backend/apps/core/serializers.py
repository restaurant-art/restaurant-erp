from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

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


class RestaurantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Restaurant
        fields = "__all__"


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = "__all__"
        read_only_fields = ("restaurant",)


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = "__all__"
        read_only_fields = ("restaurant",)


class UserSerializer(serializers.ModelSerializer):
    effective_permissions = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "mobile",
            "restaurant",
            "branches",
            "role",
            "user_type",
            "two_factor_enabled",
            "avatar",
            "custom_permissions",
            "effective_permissions",
            "is_active",
        )
        read_only_fields = ("restaurant", "effective_permissions")


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = "__all__"


class RestaurantSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantSubscription
        fields = "__all__"


class MenuCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuCategory
        fields = "__all__"
        read_only_fields = ("restaurant",)


class MenuItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = "__all__"
        read_only_fields = ("restaurant",)


class TableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Table
        fields = "__all__"
        read_only_fields = ("restaurant",)


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = "__all__"
        read_only_fields = ("restaurant",)


class OrderItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = "__all__"
        read_only_fields = ("order",)


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = "__all__"
        read_only_fields = ("order",)


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, required=False)
    payments = PaymentSerializer(many=True, required=False)

    class Meta:
        model = Order
        fields = "__all__"
        read_only_fields = ("restaurant", "cashier")

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        payments_data = validated_data.pop("payments", [])
        request = self.context["request"]
        with transaction.atomic():
            order = Order.objects.create(
                restaurant=request.user.restaurant,
                cashier=request.user,
                **validated_data,
            )
            subtotal = Decimal("0.00")
            tax_total = Decimal("0.00")
            discount_total = Decimal("0.00")
            for item_data in items_data:
                item = OrderItem.objects.create(order=order, **item_data)
                gross = item.quantity * item.rate
                subtotal += gross
                tax_total += gross * item.tax_rate / Decimal("100.00")
                discount_total += item.discount
            for payment_data in payments_data:
                Payment.objects.create(order=order, **payment_data)
            order.subtotal = subtotal
            order.tax_total = tax_total
            order.discount_total = discount_total
            order.grand_total = (
                subtotal
                + tax_total
                + order.service_charge
                + order.packing_charge
                + order.delivery_charge
                + order.round_off
                - discount_total
            )
            order.save()
        return order


class InventoryItemSerializer(serializers.ModelSerializer):
    low_stock = serializers.SerializerMethodField()

    class Meta:
        model = InventoryItem
        fields = "__all__"
        read_only_fields = ("restaurant",)

    def get_low_stock(self, obj):
        return obj.current_stock <= obj.reorder_level


class StockMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockMovement
        fields = "__all__"
        read_only_fields = ("restaurant",)


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = "__all__"
        read_only_fields = ("restaurant",)


class PurchaseOrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseOrder
        fields = "__all__"
        read_only_fields = ("restaurant",)


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = "__all__"
        read_only_fields = ("restaurant",)


class EmployeeProfileSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    user_mobile = serializers.CharField(source="user.mobile", read_only=True)
    face_enrolled = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeProfile
        fields = "__all__"
        read_only_fields = ("restaurant",)

    def get_user_name(self, obj):
        full_name = obj.user.get_full_name().strip()
        return full_name or obj.user.username or obj.user.email

    def get_face_enrolled(self, obj):
        return bool(obj.face_consent and obj.face_descriptor)


class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source="employee.employee_code", read_only=True)
    total_hours = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = "__all__"
        read_only_fields = ("restaurant",)

    def get_employee_name(self, obj):
        full_name = obj.employee.user.get_full_name().strip()
        return full_name or obj.employee.user.username or obj.employee.user.email

    def get_total_hours(self, obj):
        if not obj.check_out:
            return None
        seconds = (obj.check_out - obj.check_in).total_seconds()
        return round(seconds / 3600, 2)


class SupportTicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportTicket
        fields = "__all__"


class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = "__all__"


class IntegrationSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntegrationSetting
        fields = "__all__"
        read_only_fields = ("restaurant",)


class PrinterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Printer
        fields = "__all__"
        read_only_fields = ("restaurant",)


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = "__all__"
        read_only_fields = ("restaurant", "actor")


class DeviceLoginSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceLogin
        fields = "__all__"


class ReportExportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportExport
        fields = "__all__"
        read_only_fields = ("restaurant", "requested_by")
