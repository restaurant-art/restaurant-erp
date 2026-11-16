import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class StoreConnection(models.Model):
    class Status(models.TextChoices):
        DISCONNECTED = "disconnected", "Disconnected"
        PENDING = "pending", "Action required in Meta"
        CONNECTED = "connected", "Connected"
        RECONNECT = "reconnect", "Reconnect required"

    # These are the durable identifiers in the POS store directory. A branch's
    # tenant is the directory's root store, even if a branch name or code changes.
    store_id = models.CharField(primary_key=True, max_length=128)
    tenant_id = models.CharField(max_length=128, db_index=True)
    meta_business_id = models.CharField(max_length=32, blank=True)
    meta_business_name = models.CharField(max_length=200, blank=True)
    waba_id = models.CharField(max_length=32, blank=True)
    phone_number_id = models.CharField(max_length=32, null=True, blank=True, unique=True)
    approved_display_name = models.CharField(max_length=200, blank=True)
    registered_phone_number = models.CharField(max_length=32, blank=True)
    encrypted_credentials = models.TextField(blank=True, editable=False)
    credential_expires_at = models.DateTimeField(null=True, blank=True)
    generation = models.UUIDField(default=uuid.uuid4, editable=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DISCONNECTED)
    action_required = models.CharField(max_length=32, blank=True)
    auto_send_enabled = models.BooleanField(default=False)
    default_template = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class SignupSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    connection = models.ForeignKey(StoreConnection, on_delete=models.CASCADE)
    administrator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    generation = models.UUIDField()
    expires_at = models.DateTimeField(db_index=True)


class Receipt(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENDING = "sending", "Sending"
        ACCEPTED = "accepted", "Accepted by Meta"
        SENT = "sent", "Sent"
        DELIVERED = "delivered", "Delivered"
        READ = "read", "Read"
        FAILED = "failed", "Failed"
        UNCERTAIN = "uncertain", "Awaiting delivery confirmation"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    connection = models.ForeignKey(StoreConnection, on_delete=models.PROTECT)
    generation = models.UUIDField()
    waba_id = models.CharField(max_length=32)
    phone_number_id = models.CharField(max_length=32)
    bill_id = models.CharField(max_length=128, blank=True)  # Empty for test messages.
    recipient = models.CharField(max_length=16)
    consent_recorded_at = models.DateTimeField()
    consent_recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    invoice = models.JSONField(default=dict)
    template = models.JSONField(default=dict)
    public_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    link_expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    manual = models.BooleanField(default=False)
    retry_count = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=["connection", "bill_id"], condition=~Q(bill_id=""), name="whatsapp_one_receipt_per_bill",
        )]
        indexes = [
            models.Index(fields=["status", "next_attempt_at"], name="whatsapp_receipt_queue_idx"),
            models.Index(fields=["connection", "-created_at"], name="whatsapp_receipt_history_idx"),
        ]


class DeliveryAttempt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    receipt = models.ForeignKey(Receipt, related_name="attempts", on_delete=models.CASCADE)
    waba_id = models.CharField(max_length=32)
    phone_number_id = models.CharField(max_length=32)
    meta_message_id = models.CharField(max_length=255, null=True, unique=True)
    status = models.CharField(max_length=20, choices=Receipt.Status.choices, default=Receipt.Status.SENDING)
    error_code = models.CharField(max_length=40, blank=True)
    status_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
