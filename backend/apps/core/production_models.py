"""Transactional kitchen subledger. Legacy records remain intact at cutover."""
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q, F
from django.utils import timezone


class ProductionSite(models.Model):
    store_id = models.CharField(max_length=100, unique=True)
    branch = models.OneToOneField("core.Branch", on_delete=models.PROTECT)
    enabled = models.BooleanField(default=False)
    cutover_at = models.DateTimeField(null=True)
    closed_through = models.DateField(null=True)
    valuation_policy = models.CharField(max_length=40, default="moving_average")
    allocation_policy = models.CharField(max_length=10, default="FEFO")
    overhead_allowed = models.BooleanField(default=False)
    lock_version = models.PositiveBigIntegerField(default=0)
    legacy_snapshot = models.JSONField(default=dict)


class KitchenLocation(models.Model):
    site = models.ForeignKey(ProductionSite, on_delete=models.PROTECT)
    name = models.CharField(max_length=100)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("site", "name"), name="kitchen_location_name")]


class KitchenItem(models.Model):
    site = models.ForeignKey(ProductionSite, on_delete=models.PROTECT)
    inventory_item = models.OneToOneField("core.InventoryItem", on_delete=models.PROTECT)
    legacy_key = models.CharField(max_length=120, blank=True)
    kind = models.CharField(max_length=20)  # raw, intermediate, prepared, resale
    base_unit = models.CharField(max_length=8)  # g, ml, piece
    measures = models.JSONField(default=dict)  # e.g. ladle: 75 ml, specific to this item
    production_consumption = models.BooleanField(default=True)  # preserve existing recipe behaviour
    pack_size = models.DecimalField(max_digits=24, decimal_places=6, null=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("site", "legacy_key"), condition=~Q(legacy_key=""), name="kitchen_legacy_item")]


class KitchenRecipe(models.Model):
    site = models.ForeignKey(ProductionSite, on_delete=models.PROTECT)
    key = models.CharField(max_length=120)
    version = models.PositiveIntegerField()
    name = models.CharField(max_length=180)
    kind = models.CharField(max_length=20)  # production, serving
    stock_method = models.CharField(max_length=30, blank=True)
    content = models.JSONField(default=dict)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(default=timezone.now)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("site", "kind", "key", "version"), name="kitchen_recipe_version")]


class KitchenTransaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    site = models.ForeignKey(ProductionSite, on_delete=models.PROTECT)
    key = models.CharField(max_length=180)
    request_hash = models.CharField(max_length=64)
    kind = models.CharField(max_length=40)
    source = models.CharField(max_length=180)
    business_date = models.DateField()
    created_at = models.DateTimeField(default=timezone.now)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reason = models.TextField(blank=True)
    related = models.ForeignKey("self", on_delete=models.PROTECT, null=True)
    result = models.JSONField(default=dict)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("site", "key"), name="kitchen_transaction_key")]
        indexes = [models.Index(fields=("site", "business_date"), name="kitchen_tx_site_date")]


class ProductionBatch(models.Model):
    site = models.ForeignKey(ProductionSite, on_delete=models.PROTECT)
    reference = models.CharField(max_length=120)
    parent_reference = models.CharField(max_length=120, blank=True)
    recipe = models.ForeignKey(KitchenRecipe, on_delete=models.PROTECT)
    snapshot = models.JSONField(default=dict)
    planned_scale = models.DecimalField(max_digits=20, decimal_places=6)
    source_location = models.ForeignKey(KitchenLocation, on_delete=models.PROTECT, related_name="input_batches")
    destination_location = models.ForeignKey(KitchenLocation, on_delete=models.PROTECT, related_name="output_batches")
    business_date = models.DateField()
    shift = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=16, default="draft")
    actual = models.JSONField(default=dict)
    transaction = models.OneToOneField(KitchenTransaction, on_delete=models.PROTECT, null=True)
    operator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(default=timezone.now)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("site", "reference"), name="kitchen_batch_reference")]


class KitchenLot(models.Model):
    site = models.ForeignKey(ProductionSite, on_delete=models.PROTECT)
    item = models.ForeignKey(KitchenItem, on_delete=models.PROTECT)
    reference = models.CharField(max_length=180)
    batch = models.ForeignKey(ProductionBatch, on_delete=models.PROTECT, null=True)
    received_at = models.DateTimeField(default=timezone.now)
    prepared_at = models.DateTimeField(null=True)
    expires_at = models.DateTimeField(null=True)
    quarantined = models.BooleanField(default=False)
    pack_size = models.DecimalField(max_digits=24, decimal_places=6, null=True)  # immutable receipt snapshot
    cost_incomplete = models.BooleanField(default=False)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("site", "reference", "item"), name="kitchen_lot_reference")]


class KitchenBalance(models.Model):
    lot = models.ForeignKey(KitchenLot, on_delete=models.PROTECT)
    location = models.ForeignKey(KitchenLocation, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    value = models.DecimalField(max_digits=24, decimal_places=8, default=0)
    sealed_packages = models.PositiveBigIntegerField(default=0)
    open_quantity = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("lot", "location"), name="kitchen_lot_location"),
            models.CheckConstraint(condition=Q(value__gte=0) | Q(quantity__lt=0), name="kitchen_negative_value_only_for_debt"),
            models.CheckConstraint(condition=Q(open_quantity__gte=0) & (
                (Q(quantity__gte=0) & Q(open_quantity__lte=F("quantity"))) |
                (Q(quantity__lt=0) & Q(open_quantity=0))), name="kitchen_open_quantity_range"),
        ]


class KitchenMovement(models.Model):
    transaction = models.ForeignKey(KitchenTransaction, on_delete=models.PROTECT, related_name="movements")
    balance = models.ForeignKey(KitchenBalance, on_delete=models.PROTECT)
    category = models.CharField(max_length=40)
    quantity = models.DecimalField(max_digits=24, decimal_places=6)
    value = models.DecimalField(max_digits=24, decimal_places=8)
    sealed_delta = models.BigIntegerField(default=0)
    open_delta = models.DecimalField(max_digits=24, decimal_places=6, default=0)
    class Meta:
        indexes = [models.Index(fields=("balance", "id"), name="kitchen_movement_cutoff")]


class KitchenOrder(models.Model):
    site = models.ForeignKey(ProductionSite, on_delete=models.PROTECT)
    reference = models.CharField(max_length=180)
    location = models.ForeignKey(KitchenLocation, on_delete=models.PROTECT)
    legacy_order = models.OneToOneField("core.Order", on_delete=models.PROTECT, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("site", "reference"), name="kitchen_order_reference")]


class KitchenOrderLine(models.Model):
    order = models.ForeignKey(KitchenOrder, on_delete=models.PROTECT, related_name="lines")
    key = models.CharField(max_length=180)
    menu_key = models.CharField(max_length=120)
    snapshot = models.JSONField(default=dict)
    quantity = models.DecimalField(max_digits=20, decimal_places=6)
    fulfilled = models.DecimalField(max_digits=20, decimal_places=6, default=0)
    cancelled = models.DecimalField(max_digits=20, decimal_places=6, default=0)
    revision = models.PositiveIntegerField(default=1)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("order", "key"), name="kitchen_order_line_key")]


class KitchenReservation(models.Model):
    line = models.ForeignKey(KitchenOrderLine, on_delete=models.PROTECT, related_name="reservations")
    balance = models.ForeignKey(KitchenBalance, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=24, decimal_places=6)
    sealed_packages = models.PositiveBigIntegerField(default=0)
    class Meta:
        constraints = [models.CheckConstraint(condition=Q(quantity__gte=0), name="kitchen_nonnegative_reservation")]


class KitchenFulfillment(models.Model):
    transaction = models.ForeignKey(KitchenTransaction, on_delete=models.PROTECT, related_name="fulfillments")
    line = models.ForeignKey(KitchenOrderLine, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=20, decimal_places=6)
    snapshot = models.JSONField(default=dict)
    allocations = models.JSONField(default=list)


class KitchenCount(models.Model):
    site = models.ForeignKey(ProductionSite, on_delete=models.PROTECT)
    location = models.ForeignKey(KitchenLocation, on_delete=models.PROTECT)
    mode = models.CharField(max_length=12, default="legacy")  # legacy, single, full
    scope = models.CharField(max_length=12, default="all")  # all, inventory, production
    cutoff = models.DateTimeField(default=timezone.now)
    cutoff_movement = models.PositiveBigIntegerField(default=0)
    expected = models.JSONField(default=list)
    physical = models.JSONField(default=list)
    adjustment = models.OneToOneField(KitchenTransaction, on_delete=models.PROTECT, null=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
