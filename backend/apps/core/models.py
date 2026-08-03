from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Restaurant(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        SUSPENDED = "suspended", "Suspended"

    name = models.CharField(max_length=180)
    legal_name = models.CharField(max_length=220, blank=True)
    slug = models.SlugField(unique=True)
    owner_name = models.CharField(max_length=160)
    owner_email = models.EmailField()
    owner_mobile = models.CharField(max_length=30)
    gst_number = models.CharField(max_length=32, blank=True)
    fssai_number = models.CharField(max_length=32, blank=True)
    address = models.TextField(blank=True)
    logo = models.ImageField(upload_to="restaurant/logos/", blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    features = models.JSONField(default=dict, blank=True)
    settings = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return self.name


class Branch(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="branches")
    name = models.CharField(max_length=160)
    code = models.CharField(max_length=32)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    city = models.CharField(max_length=90, blank=True)
    is_active = models.BooleanField(default=True)
    settings = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ("restaurant", "code")

    def __str__(self):
        return f"{self.restaurant.name} - {self.name}"


class Role(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, null=True, blank=True)
    name = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    permissions = models.JSONField(default=list, blank=True)
    is_system = models.BooleanField(default=False)

    class Meta:
        unique_together = ("restaurant", "name")

    def __str__(self):
        return self.name


class User(AbstractUser):
    class UserType(models.TextChoices):
        SUPER_ADMIN = "super_admin", "Super Admin"
        OWNER = "owner", "Restaurant Owner"
        RESTAURANT_ADMIN = "restaurant_admin", "Restaurant Admin"
        BRANCH_MANAGER = "branch_manager", "Branch Manager"
        MANAGER = "manager", "Manager"
        CASHIER = "cashier", "Cashier"
        WAITER = "waiter", "Waiter"
        KITCHEN = "kitchen_staff", "Kitchen Staff"
        CHEF = "chef", "Chef"
        INVENTORY = "inventory_manager", "Inventory Manager"
        PURCHASE = "purchase_manager", "Purchase Manager"
        HR = "hr_manager", "HR Manager"
        ACCOUNTANT = "accountant", "Accountant"
        DELIVERY = "delivery_boy", "Delivery Boy"
        CUSTOMER = "customer", "Customer"

    restaurant = models.ForeignKey(Restaurant, on_delete=models.SET_NULL, null=True, blank=True)
    branches = models.ManyToManyField(Branch, blank=True)
    role = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, blank=True)
    user_type = models.CharField(max_length=40, choices=UserType.choices, default=UserType.CASHIER)
    mobile = models.CharField(max_length=30, blank=True)
    two_factor_enabled = models.BooleanField(default=False)
    avatar = models.ImageField(upload_to="employees/photos/", blank=True, null=True)
    custom_permissions = models.JSONField(default=list, blank=True)

    @property
    def effective_permissions(self):
        role_permissions = self.role.permissions if self.role else []
        return sorted(set(role_permissions + self.custom_permissions))


class TenantModel(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, null=True, blank=True)

    class Meta:
        abstract = True


class SubscriptionPlan(TimeStampedModel):
    name = models.CharField(max_length=80, unique=True)
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    annual_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    max_branches = models.PositiveIntegerField(default=1)
    max_users = models.PositiveIntegerField(default=5)
    features = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class RestaurantSubscription(TimeStampedModel):
    class Status(models.TextChoices):
        TRIAL = "trial", "Trial"
        ACTIVE = "active", "Active"
        PAST_DUE = "past_due", "Past Due"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"

    restaurant = models.OneToOneField(Restaurant, on_delete=models.CASCADE, related_name="subscription")
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TRIAL)
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    current_period_ends_at = models.DateTimeField(null=True, blank=True)
    payment_provider = models.CharField(max_length=40, blank=True)
    provider_customer_id = models.CharField(max_length=120, blank=True)


class MenuCategory(TenantModel):
    name = models.CharField(max_length=120)
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "name")

    def __str__(self):
        return self.name


class MenuItem(TenantModel):
    name = models.CharField(max_length=180)
    sku = models.CharField(max_length=60, blank=True)
    barcode = models.CharField(max_length=80, blank=True)
    category = models.ForeignKey(MenuCategory, on_delete=models.SET_NULL, null=True, related_name="items")
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="menu/items/", blank=True, null=True)
    base_price = models.DecimalField(max_digits=10, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("5.00"))
    recipe = models.JSONField(default=list, blank=True)
    add_ons = models.JSONField(default=list, blank=True)
    modifiers = models.JSONField(default=list, blank=True)
    nutrition = models.JSONField(default=dict, blank=True)
    available = models.BooleanField(default=True)
    favourite = models.BooleanField(default=False)
    printer_group = models.CharField(max_length=80, blank=True)

    def __str__(self):
        return self.name


class Table(TenantModel):
    class Status(models.TextChoices):
        AVAILABLE = "available", "Available"
        OCCUPIED = "occupied", "Occupied"
        RESERVED = "reserved", "Reserved"
        CLEANING = "cleaning", "Cleaning"
        BILLING_PENDING = "billing_pending", "Billing Pending"

    name = models.CharField(max_length=60)
    floor = models.CharField(max_length=80, default="Main")
    seats = models.PositiveIntegerField(default=4)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.AVAILABLE)
    position = models.JSONField(default=dict, blank=True)
    assigned_waiter = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)


class Customer(TenantModel):
    name = models.CharField(max_length=160)
    mobile = models.CharField(max_length=30, db_index=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    loyalty_points = models.PositiveIntegerField(default=0)
    wallet_balance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    credit_balance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    important_dates = models.JSONField(default=dict, blank=True)
    preferences = models.JSONField(default=dict, blank=True)


class Order(TenantModel):
    class OrderType(models.TextChoices):
        DINE_IN = "dine_in", "Dine In"
        TAKEAWAY = "takeaway", "Takeaway"
        DELIVERY = "delivery", "Delivery"
        ONLINE = "online", "Online"
        QR = "qr", "QR"

    class Status(models.TextChoices):
        HOLD = "hold", "Hold"
        PENDING = "pending", "Pending"
        PREPARING = "preparing", "Preparing"
        READY = "ready", "Ready"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"
        VOID = "void", "Void"

    bill_number = models.CharField(max_length=40, unique=True)
    order_type = models.CharField(max_length=20, choices=OrderType.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    table = models.ForeignKey(Table, on_delete=models.SET_NULL, null=True, blank=True)
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True)
    cashier = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="cashier_orders")
    waiter = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="waiter_orders")
    notes = models.TextField(blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    service_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    packing_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    delivery_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    round_off = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    source = models.CharField(max_length=40, default="pos")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-created_at",)


class OrderItem(TimeStampedModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    menu_item = models.ForeignKey(MenuItem, on_delete=models.SET_NULL, null=True)
    name = models.CharField(max_length=180)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    rate = models.DecimalField(max_digits=10, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    modifiers = models.JSONField(default=list, blank=True)
    preparation_status = models.CharField(max_length=30, default="new")

    @property
    def line_total(self):
        gross = self.quantity * self.rate
        tax = gross * self.tax_rate / Decimal("100.00")
        return gross + tax - self.discount


class Payment(TimeStampedModel):
    class Mode(models.TextChoices):
        CASH = "cash", "Cash"
        UPI = "upi", "UPI"
        CARD = "card", "Card"
        WALLET = "wallet", "Wallet"
        CREDIT = "credit", "Credit"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="payments")
    mode = models.CharField(max_length=20, choices=Mode.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reference = models.CharField(max_length=120, blank=True)
    provider = models.CharField(max_length=40, blank=True)


class InventoryItem(TenantModel):
    name = models.CharField(max_length=180)
    sku = models.CharField(max_length=60, blank=True)
    unit = models.CharField(max_length=30, default="kg")
    current_stock = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    reorder_level = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    valuation_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expiry_tracking = models.BooleanField(default=False)
    batch_tracking = models.BooleanField(default=False)


class StockMovement(TenantModel):
    class MovementType(models.TextChoices):
        IN = "in", "Stock In"
        OUT = "out", "Stock Out"
        ADJUST = "adjust", "Adjustment"
        TRANSFER = "transfer", "Transfer"
        WASTAGE = "wastage", "Wastage"
        PRODUCTION = "production", "Production"

    item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name="movements")
    movement_type = models.CharField(max_length=20, choices=MovementType.choices)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)


class Supplier(TenantModel):
    name = models.CharField(max_length=180)
    mobile = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    gst_number = models.CharField(max_length=32, blank=True)
    address = models.TextField(blank=True)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)


class PurchaseOrder(TenantModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        APPROVAL = "approval", "Approval"
        ORDERED = "ordered", "Ordered"
        RECEIVED = "received", "Received"
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"

    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True)
    po_number = models.CharField(max_length=40)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    items = models.JSONField(default=list, blank=True)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    due_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)


class Expense(TenantModel):
    category = models.CharField(max_length=80)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_from = models.CharField(max_length=40, default="cash")
    expense_date = models.DateField(default=timezone.localdate)
    notes = models.TextField(blank=True)
    attachment = models.FileField(upload_to="finance/expenses/", blank=True, null=True)


class EmployeeProfile(TenantModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="employee_profile")
    employee_code = models.CharField(max_length=40)
    designation = models.CharField(max_length=100)
    salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    documents = models.JSONField(default=list, blank=True)
    joining_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    face_descriptor = models.JSONField(default=list, blank=True)
    face_consent = models.BooleanField(default=False)
    face_enrolled_at = models.DateTimeField(null=True, blank=True)
    face_samples = models.PositiveSmallIntegerField(default=0)
    face_store_images = models.BooleanField(default=False)


class Attendance(TenantModel):
    employee = models.ForeignKey(EmployeeProfile, on_delete=models.CASCADE, related_name="attendance")
    shift = models.CharField(max_length=80, blank=True)
    check_in = models.DateTimeField()
    check_out = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=40, default="manual")
    confidence_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    device_id = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=30, default="present")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ("-check_in",)


class SupportTicket(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, null=True, blank=True)
    title = models.CharField(max_length=180)
    status = models.CharField(max_length=30, default="open")
    priority = models.CharField(max_length=30, default="normal")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    description = models.TextField()


class Announcement(TimeStampedModel):
    title = models.CharField(max_length=180)
    message = models.TextField()
    audience = models.CharField(max_length=80, default="all")
    starts_at = models.DateTimeField(default=timezone.now)
    ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)


class IntegrationSetting(TenantModel):
    provider = models.CharField(max_length=80)
    enabled = models.BooleanField(default=False)
    credentials = models.JSONField(default=dict, blank=True)
    config = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ("restaurant", "branch", "provider")


class Printer(TenantModel):
    name = models.CharField(max_length=120)
    printer_type = models.CharField(max_length=40, default="thermal_80mm")
    target = models.CharField(max_length=80, default="billing")
    config = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)


class AuditLog(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, null=True, blank=True)
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True)
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=120)
    entity = models.CharField(max_length=120)
    entity_id = models.CharField(max_length=80, blank=True)
    before = models.JSONField(default=dict, blank=True)
    after = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)


class DeviceLogin(TimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="device_logins")
    device_name = models.CharField(max_length=160)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    last_seen_at = models.DateTimeField(default=timezone.now)


class ReportExport(TenantModel):
    report_type = models.CharField(max_length=80)
    filters = models.JSONField(default=dict, blank=True)
    file = models.FileField(upload_to="reports/exports/", blank=True, null=True)
    status = models.CharField(max_length=30, default="queued")
    requested_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
