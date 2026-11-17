"""Pine Labs cloud UPI checkout. Credentials stay on the server.

An upload acknowledgement is NOT payment approval. Ambiguous uploads are never
resent; a durable intent and a unique terminal lock survive process restarts.
"""
import hashlib
import json
import os
import re
import uuid
from decimal import Decimal, InvalidOperation
from urllib.request import Request, build_opener, HTTPRedirectHandler

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .cloud_views import _access, _can_store
from .models import PineCloudPayment, PineBillPrintJob, SharedAppState

HOSTS = {"uat": "https://www.plutuscloudserviceuat.in:8201", "production": "https://www.plutuscloudservice.in:8201"}


def config(store_id):
    values = {key: os.getenv("PINE_CLOUD_" + key.upper(), "").strip() for key in
              ("store_id", "merchant_id", "security_token", "client_id", "pine_store_id", "environment")}
    values["enabled"] = os.getenv("PINE_CLOUD_ENABLED", "false").lower() in ("true", "1")
    values["ready"] = bool(values["enabled"] and values["store_id"] == store_id
                           and values["environment"] in HOSTS and values["security_token"]
                           and all(re.fullmatch(r"[0-9]{1,24}", values[k]) for k in ("merchant_id", "client_id", "pine_store_id")))
    values["identity"] = hashlib.sha256("|".join(values[k] for k in
        ("environment", "merchant_id", "client_id", "pine_store_id")).encode()).hexdigest()
    return values


def access(request, store_id):
    if not store_id or len(store_id) > 100:
        raise ValidationError("A valid store is required.")
    rights = _access(request)
    if not _can_store(rights, store_id):
        raise PermissionDenied("Store access denied.")
    if not rights["platform_admin"] and request.user.user_type not in (
        "owner", "restaurant_admin", "branch_manager", "manager", "cashier"):
        raise PermissionDenied("Billing permission required.")
    linked = rights.get("linked") or {}
    roles = [r for r in rights.get("roles", []) if r.get("name") == linked.get("role")
             and str(r.get("storeId")) in (store_id, "GLOBAL")]
    role = next((r for r in roles if str(r.get("storeId")) == store_id), next(iter(roles), None))
    if not rights["platform_admin"] and role is not None and (
        role.get("status") == "Inactive" or not {"pos", "supermarket-pos"}.intersection(role.get("modules", []))):
        raise PermissionDenied("POS access is disabled for this role.")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward the merchant token to another endpoint.


def provider_call(operation, payload, cfg):
    endpoint = {"upload": "UploadBilledTransaction", "status": "GetCloudBasedTxnStatus"}[operation]
    auth = {"MerchantID": cfg["merchant_id"], "SecurityToken": cfg["security_token"],
            "ClientId": cfg["client_id"], "StoreId": cfg["pine_store_id"]}
    request = Request(HOSTS[cfg["environment"]] + "/API/CloudBasedIntegration/V1/" + endpoint,
        data=json.dumps({**payload, **auth}).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with build_opener(NoRedirect).open(request, timeout=12) as response:
        raw = response.read(262145)
    if len(raw) > 262144:
        raise ValueError("Oversized provider response")
    body = json.loads(raw)
    if not isinstance(body, dict):
        raise ValueError("Invalid provider response")
    return body


def public_payment(payment):
    return {"paymentKey": payment.payment_key, "billId": payment.bill_id, "storeId": payment.store_id,
            "method": "UPI", "amountPaise": payment.amount_paise, "status": payment.status,
            "billingRef": payment.id.hex, "providerReference": payment.provider_reference, **payment.receipt}


def valid_reference(value):
    return str(value) if re.fullmatch(r"[1-9][0-9]{0,39}", str(value)) else ""


def approved_receipt(body, payment):
    """Validate the documented UPI JSON status contract, not the CSV callback."""
    if str(body.get("ResponseCode")) != "0":
        return None
    if str(body.get("PlutusTransactionReferenceID")) != payment.provider_reference:
        raise ValueError("Payment reference mismatch")
    tags = {}
    for row in body.get("TransactionData") or []:
        key = re.sub(r"\s+", "", str(row.get("Tag", ""))).lower()
        value = str(row.get("Value", "")).strip()
        if key in tags and tags[key] != value:
            raise ValueError("Conflicting payment fields")
        tags[key] = value
    if tags.get("paymentmode", "").replace(" ", "").upper() not in ("UPI", "UPISALE"):
        raise ValueError("Unexpected payment method")
    # Amount is rupees in the JSON response; AmountInPaisa is integer paise.
    amounts = []
    for field, scale in (("amountinpaisa", 1), ("amount", 100), ("finalamount", 1)):
        if field in tags:
            value = Decimal(tags[field]) * scale
            if not value.is_finite() or value != payment.amount_paise:
                raise ValueError("Payment amount mismatch")
            amounts.append(value)
    if not amounts or tags.get("currencyminorunit", "2") != "2" or not tags.get("rrn") or not tags.get("approvalcode"):
        raise ValueError("Incomplete payment approval")
    return {"transactionReference": tags["rrn"][:80], "approvalCode": tags["approvalcode"][:80],
            "terminalId": tags.get("tid", "")[:80], "invoiceNumber": tags.get("invoicenumber", "")[:80],
            "batchNumber": tags.get("batchnumber", "")[:80], "completedAt": timezone.now().isoformat()}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def connection(request, store_id):
    access(request, store_id)
    cfg = config(store_id)
    return Response({"ready": cfg["ready"], "environment": cfg["environment"] or "uat", "methods": ["UPI"],
        "pending": PineCloudPayment.objects.filter(store_id=store_id, active_terminal__isnull=False).exists(),
        "message": "Server configuration is ready. Test the A910S in UAT before live use." if cfg["ready"] else
        "Add this branch's Pine Labs cloud credentials to the server configuration. No payment has been sent."})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def payment(request, store_id, action):
    access(request, store_id)
    data = request.data
    if not isinstance(data, dict) or data.get("training") is not False or data.get("method") != "UPI":
        raise ValidationError("Only live UPI checkout requests are accepted.")
    bill_id, key = data.get("billId", ""), data.get("paymentKey", "")
    if not isinstance(bill_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", bill_id) or bill_id.startswith("TRAIN-"):
        raise ValidationError("A valid live bill is required.")
    if not isinstance(key, str) or not re.fullmatch(re.escape(bill_id) + r":[0-9]{1,2}", key):
        raise ValidationError("Payment reference does not match this bill.")
    amount = data.get("amountPaise")
    if type(amount) is not int or not 0 < amount <= 999999999 or action not in ("pay", "recover"):
        raise ValidationError("Invalid payment amount or action.")
    cfg = config(store_id)
    if not cfg["ready"]:
        return Response({"error": "Pine Labs cloud credentials are not configured for this branch. No new payment was sent."}, status=503)
    existing = PineCloudPayment.objects.filter(store_id=store_id, payment_key=key).first()
    if existing and (existing.bill_id != bill_id or existing.amount_paise != amount or existing.config_identity != cfg["identity"]):
        return Response({"error": "Saved payment differs from this bill or terminal. Reconcile the original payment first."}, status=409)
    if not existing and action == "recover":
        return Response({"status": "not_started"})
    if not existing:
        try:
            with transaction.atomic():
                existing = PineCloudPayment.objects.create(store_id=store_id, bill_id=bill_id, payment_key=key,
                    amount_paise=amount, sequence=int(key.rsplit(":", 1)[1]) + 1,
                    config_identity=cfg["identity"], active_terminal=cfg["identity"], requested_by=request.user)
        except IntegrityError:
            return Response({"error": "This terminal already has an unfinished payment. Recover that checkout before starting another."}, status=409)
        try:
            result = provider_call("upload", {"TransactionNumber": existing.id.hex, "SequenceNumber": existing.sequence,
                "AllowedPaymentMode": "10", "Amount": amount, "UserID": str(request.user.pk),
                "AutoCancelDurationInMinutes": 5, "TxnType": 0}, cfg)
            ref = valid_reference(result.get("PlutusTransactionReferenceID"))
            if str(result.get("ResponseCode")) != "0" or not ref:
                # No blind retries, including duplicate-request/error responses.
                raise ValueError("Upload not acknowledged")
            existing.provider_reference, existing.status = ref, "pending"
        except Exception:
            existing.status = "unknown"
        existing.save(update_fields=("provider_reference", "status", "updated_at"))
        return Response(public_payment(existing))
    if existing.status == "approved" or not existing.provider_reference:
        return Response(public_payment(existing))
    try:
        result = provider_call("status", {"PlutusTransactionReferenceID": existing.provider_reference,
            "TransactionNumber": existing.id.hex, "UserID": str(existing.requested_by_id)}, cfg)
        receipt = approved_receipt(result, existing)
        if receipt:
            PineCloudPayment.objects.filter(pk=existing.pk).exclude(status="approved").update(
                status="approved", receipt=receipt, active_terminal=None, updated_at=timezone.now())
    except Exception:
        # Status transport/validation failures cannot undo an approval or create a charge.
        pass
    existing.refresh_from_db()
    return Response(public_payment(existing))


def verify_saved_bill(store_id, bill_id):
    state = SharedAppState.objects.filter(state_key="vestora-sales-ledger").first()
    bill = next((b for b in (state.state_value if state and isinstance(state.state_value, list) else [])
                 if isinstance(b, dict) and str(b.get("id")) == bill_id and str(b.get("storeId")) == store_id), None)
    if not bill or bill.get("training") or bill.get("pineLabsTransport") != "cloud":
        raise ValidationError("Sync the completed Pine Labs bill before printing.")
    tenders = bill.get("splitPayments", []) if bill.get("payment") == "Split" else [{"method": bill.get("payment"), "amount": bill.get("paidAmount")}]
    upi = [(i, t) for i, t in enumerate(tenders) if t.get("method") == "UPI"]
    if not upi:
        raise ValidationError("No UPI payment on this bill.")
    try:
        for i, tender in upi:
            amount = Decimal(str(tender.get("amount"))) * 100
            payment = PineCloudPayment.objects.filter(store_id=store_id, payment_key=f"{bill_id}:{i}", bill_id=bill_id, status="approved").first()
            if not payment or not amount.is_finite() or amount != payment.amount_paise:
                raise ValidationError("Pine Labs has not confirmed this bill's exact UPI amount.")
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError("Invalid saved payment amount.")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def print_job(request, store_id):
    access(request, store_id)
    if not isinstance(request.data, dict):
        raise ValidationError("Invalid print request.")
    bill_id = str(request.data.get("billId", ""))
    if not bill_id or len(bill_id) > 120:
        raise ValidationError("A bill is required.")
    if request.data.get("action") == "claim":
        verify_saved_bill(store_id, bill_id)
        job, created = PineBillPrintJob.objects.get_or_create(store_id=store_id, bill_id=bill_id)
        return Response({"claimed": created, "jobId": str(job.pk) if created else None, "status": job.status})
    if request.data.get("action") != "result" or request.data.get("status") not in ("submitted", "unknown"):
        raise ValidationError("Invalid print result.")
    try:
        job_id = uuid.UUID(str(request.data.get("jobId", "")))
    except ValueError:
        raise ValidationError("Invalid print job ID.")
    job = PineBillPrintJob.objects.filter(store_id=store_id, bill_id=bill_id, pk=job_id).first()
    if not job:
        raise ValidationError("Print job not found.")
    PineBillPrintJob.objects.filter(pk=job.pk, status="claimed").update(status=request.data["status"], updated_at=timezone.now())
    return Response({"recorded": True})
