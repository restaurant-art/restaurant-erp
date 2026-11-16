from decimal import Decimal, InvalidOperation

import phonenumbers
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import Receipt, StoreConnection
from .stores import active_store, store_tenants


def normalize_phone(value):
    if not isinstance(value, str) or len(value) > 40:
        return ""
    value = value.strip()
    if not value.startswith("+") and (len(value) != 10 or not value.isascii() or not value.isdigit()):
        return ""
    try:
        number = phonenumbers.parse(value, "IN")
    except phonenumbers.NumberParseException:
        return ""
    if number.extension or not phonenumbers.is_valid_number(number):
        return ""
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)


def safe_decimal(value, places=2):
    try:
        amount = Decimal(str(value))
        if amount.is_finite() and abs(amount) < Decimal("1000000000000"):
            return f"{amount:.{places}f}"
    except (InvalidOperation, ValueError):
        pass
    return ""


def snapshot_invoice(bill, store):
    return {
        "store": str(store.get("name") or "")[:180],
        "branch": str(store.get("branch") or "")[:160],
        "address": str(store.get("address") or "")[:240],
        "gstin": str(store.get("gst") or "")[:32],
        "invoice_number": str(bill.get("invoiceNumber") or bill.get("orderNumber") or bill["id"])[:128],
        "completed_at": bill["completedAt"],
        "total": safe_decimal(bill.get("total")),
        "subtotal": safe_decimal(bill.get("subtotal")),
        "tax": safe_decimal(bill.get("tax")),
        "cgst": safe_decimal(bill.get("cgst")),
        "sgst": safe_decimal(bill.get("sgst")),
        "discount": safe_decimal(bill.get("discount")),
        "payment": str(bill.get("payment") or "")[:40],
        "round_off": safe_decimal(bill.get("roundOff")),
        "items": [
            {
                "name": str(item.get("name") or "")[:240],
                "quantity": safe_decimal(item.get("qty"), 3).rstrip("0").rstrip("."),
                "rate": safe_decimal(item.get("price")),
            }
            for item in bill["items"] if isinstance(item, dict)
        ],
    }


def ready_to_send(connection, now):
    return bool(
        connection.status == StoreConnection.Status.CONNECTED and connection.encrypted_credentials
        and connection.waba_id and connection.phone_number_id and connection.default_template
        and (connection.credential_expires_at is None or connection.credential_expires_at > now)
    )


def enqueue_receipt(connection, *, actor, recipient, invoice, bill_id=""):
    return Receipt.objects.create(
        connection=connection, generation=connection.generation, waba_id=connection.waba_id,
        phone_number_id=connection.phone_number_id, bill_id=bill_id, recipient=recipient,
        invoice=invoice, template=connection.default_template,
        consent_recorded_at=timezone.now(), consent_recorded_by=actor,
    )


def enqueue_new_sales(before, after, access):
    """Call inside the saved ledger transaction. Workers only see committed rows."""
    if not isinstance(after, list):
        return
    known = {
        (bill.get("storeId"), bill.get("id")) for bill in (before if isinstance(before, list) else [])
        if isinstance(bill, dict) and isinstance(bill.get("id"), str) and isinstance(bill.get("storeId"), str)
    }
    candidates = []
    for bill in after:
        if not isinstance(bill, dict) or bill.get("whatsappReceiptOptIn") is not True:
            continue
        store_id, bill_id = bill.get("storeId"), bill.get("id")
        if not isinstance(store_id, str) or not isinstance(bill_id, str) or len(bill_id) > 128:
            continue
        if not bill_id.startswith("BILL-") or (store_id, bill_id) in known:
            continue
        if bill.get("trainingMode") or bill.get("isTraining") or bill.get("training"):
            continue
        completed_at = bill.get("completedAt")
        try:
            completed = isinstance(completed_at, str) and len(completed_at) <= 40 and parse_datetime(completed_at)
        except ValueError:
            continue
        if not completed or not isinstance(bill.get("items"), list) or not bill["items"] or not safe_decimal(bill.get("total")):
            continue
        if not access["platform_admin"] and store_id not in access["allowed"]:
            continue
        recipient = normalize_phone(bill.get("customerMobile"))
        if recipient:
            candidates.append((store_id, bill_id, recipient, bill))
    if not candidates:
        return

    roots = store_tenants(access["directory"])
    connections = {
        row.pk: row for row in StoreConnection.objects.select_for_update().filter(
            pk__in={entry[0] for entry in candidates}, auto_send_enabled=True,
        ).order_by("pk") if row.tenant_id == roots.get(row.pk) and ready_to_send(row, timezone.now())
    }
    if not connections:
        return
    already_queued = set(Receipt.objects.filter(
        connection_id__in=connections, bill_id__in={entry[1] for entry in candidates},
    ).values_list("connection_id", "bill_id"))
    for store_id, bill_id, recipient, bill in candidates:
        connection = connections.get(store_id)
        store = active_store(access, store_id)
        if connection and store and (store_id, bill_id) not in already_queued:
            enqueue_receipt(connection, actor=access["user"], recipient=recipient,
                            invoice=snapshot_invoice(bill, store), bill_id=bill_id)
            already_queued.add((store_id, bill_id))
