import logging
import time
import uuid
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.core.models import SharedAppState

from .messages import message_payload
from .meta import MetaError, decrypt_token, graph
from .models import DeliveryAttempt, Receipt, StoreConnection
from .receipts import ready_to_send
from .stores import active_store, store_tenants


log = logging.getLogger(__name__)
Status = Receipt.Status
THROTTLE_CODES = {"4", "17", "130429", "131048", "131056", "80007", "80008"}
RETRY_DELAYS = (30, 120, 600, 1800)
PROGRESS = {Status.ACCEPTED: 1, Status.SENT: 2, Status.DELIVERED: 3, Status.READ: 4}


def valid_sender(connection, receipt):
    return (connection.generation == receipt.generation and connection.waba_id == receipt.waba_id
            and connection.phone_number_id == receipt.phone_number_id)


def save_status(receipt, status, *fields):
    receipt.status = status
    receipt.save(update_fields=["status", "updated_at", *fields])


def claim_delivery(receipt_id):
    with transaction.atomic():
        store_id = Receipt.objects.filter(pk=receipt_id).values_list("connection_id", flat=True).first()
        if store_id is None:
            return None
        connection = StoreConnection.objects.select_for_update().get(pk=store_id)
        receipt = Receipt.objects.select_for_update().get(pk=receipt_id)
        now = timezone.now()
        if receipt.status != Status.QUEUED or receipt.next_attempt_at > now:
            return None
        directory = SharedAppState.objects.filter(state_key="vestora-stores").values_list("state_value", flat=True).first() or []
        if (store_tenants(directory).get(store_id) != connection.tenant_id
                or active_store({"directory": directory}, store_id) is None
                or not valid_sender(connection, receipt) or not ready_to_send(connection, now)
                or (receipt.bill_id and not receipt.manual and not connection.auto_send_enabled)):
            save_status(receipt, Status.CANCELLED)
            return None
        attempt = DeliveryAttempt.objects.create(receipt=receipt, waba_id=receipt.waba_id, phone_number_id=receipt.phone_number_id)
        receipt.link_expires_at = now + timedelta(days=30)
        save_status(receipt, Status.SENDING, "link_expires_at")
        return connection, receipt, attempt


def apply_delivery_status(attempt, status, *, message_id=None, error_code=""):
    # Status callbacks may precede the response to POST /messages, or arrive
    # more than once. Serialize on the receipt, including manual retry claims.
    with transaction.atomic():
        receipt = Receipt.objects.select_for_update().get(pk=attempt.receipt_id)
        attempt.refresh_from_db()
        current = attempt.status
        if message_id and attempt.meta_message_id not in (None, message_id):
            return
        if status in PROGRESS:
            if (PROGRESS.get(current, 0) >= PROGRESS[status]
                    or (current == Status.FAILED and status in (Status.ACCEPTED, Status.SENT))):
                return
        elif status == Status.FAILED:
            if current in (Status.DELIVERED, Status.READ, Status.FAILED):
                return
        elif current != Status.SENDING:
            return
        attempt.status = status
        attempt.meta_message_id = message_id or attempt.meta_message_id
        attempt.error_code = error_code
        attempt.status_at = timezone.now()
        attempt.save(update_fields=["status", "meta_message_id", "error_code", "status_at"])
        if receipt.attempts.first().pk == attempt.pk:
            if receipt.status == Status.QUEUED and status in (Status.FAILED, Status.UNCERTAIN, Status.QUEUED):
                return  # Keep a previously scheduled retry in the queue.
            if status == Status.QUEUED:
                index = receipt.retry_count
                if index < len(RETRY_DELAYS):
                    receipt.retry_count += 1
                    receipt.next_attempt_at = timezone.now() + timedelta(seconds=RETRY_DELAYS[index])
                    save_status(receipt, status, "retry_count", "next_attempt_at")
                else:
                    attempt.status = Status.FAILED
                    attempt.save(update_fields=["status"])
                    save_status(receipt, Status.FAILED)
            else:
                save_status(receipt, status)


def dispatch_receipt(receipt_id):
    claim = claim_delivery(receipt_id)
    if claim is None:
        return False
    connection, receipt, attempt = claim
    try:
        token = decrypt_token(connection)
        payload = message_payload(receipt, attempt.pk)
        result = graph(f"{receipt.phone_number_id}/messages", token=token, payload=payload)
        messages = result.get("messages") or []
        message_id = messages[0].get("id") if messages and isinstance(messages[0], dict) else None
        if not isinstance(message_id, str) or not message_id.startswith("wamid.") or len(message_id) > 255:
            raise MetaError("Meta did not confirm a message ID.")
        apply_delivery_status(attempt, Status.ACCEPTED, message_id=message_id)
    except MetaError as error:
        if error.code == "key_unavailable" or error.http_status == 429 or (400 <= error.http_status < 500 and error.code in THROTTLE_CODES):
            status = Status.QUEUED
        elif error.code in {"configuration", "credentials", "template"} or 400 <= error.http_status < 500 and error.http_status != 408:
            status = Status.FAILED
        else:
            status = Status.UNCERTAIN
        apply_delivery_status(attempt, status, error_code=error.code)
        if error.code in {"190", "credentials"}:
            StoreConnection.objects.filter(pk=connection.pk, generation=connection.generation).update(
                status=StoreConnection.Status.RECONNECT, auto_send_enabled=False,
                action_required="reauthorize", updated_at=timezone.now(),
            )
    return True


def deliver_pending(limit=50):
    now = timezone.now()
    deadline = time.monotonic() + 8
    stalled = DeliveryAttempt.objects.filter(status=Status.SENDING, created_at__lt=now - timedelta(minutes=5))[:limit]
    for attempt in stalled:
        apply_delivery_status(attempt, Status.UNCERTAIN, error_code="worker_interrupted")
    ids = list(Receipt.objects.filter(status=Status.QUEUED, next_attempt_at__lte=now)
               .order_by("next_attempt_at").values_list("pk", flat=True)[:limit])
    processed = 0
    for receipt_id in ids:
        if time.monotonic() >= deadline:
            break
        try:
            processed += int(dispatch_receipt(receipt_id))
        except Exception as error:
            # Keep independent stores moving if a single delivery encounters an internal error.
            log.error("WhatsApp receipt %s processing failed (%s)", receipt_id, type(error).__name__)
    return processed


def record_webhook_status(waba_id, phone_id, event):
    status = event.get("status")
    message_id = event.get("id")
    if status not in {Status.SENT, Status.DELIVERED, Status.READ, Status.FAILED}:
        return
    if not isinstance(message_id, str) or not message_id.startswith("wamid.") or len(message_id) > 255:
        return
    attempts = DeliveryAttempt.objects.filter(waba_id=waba_id, phone_number_id=phone_id)
    attempt = attempts.filter(meta_message_id=message_id).first()
    if attempt is None:
        try:
            callback_id = uuid.UUID(event.get("biz_opaque_callback_data", ""))
        except (TypeError, ValueError, AttributeError):
            return
        attempt = attempts.filter(pk=callback_id, meta_message_id__isnull=True).first()
    if attempt is None:
        return
    codes = [row.get("code") for row in event.get("errors") or [] if isinstance(row, dict)]
    code = next((str(value) for value in codes if isinstance(value, int)), "")
    apply_delivery_status(attempt, status, message_id=message_id, error_code=code)
