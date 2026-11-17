import hashlib
import hmac
import json
import re
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, connection as database, transaction
from django.db.models import OuterRef, Subquery
from django.http import HttpResponse, HttpResponseBadRequest, HttpResponseForbidden, HttpResponseNotFound
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.core.cloud_views import _access, _can_store

from .delivery import record_webhook_status, save_status
from .messages import invoice_templates
from .meta import MetaError, decrypt_token, encrypt_token, exchange_signup_code, graph, is_meta_id, sender_details, signup_configuration
from .models import DeliveryAttempt, Receipt, SignupSession, StoreConnection
from .receipts import enqueue_receipt, normalize_phone, ready_to_send
from .stores import active_store, store_tenants


def admin_connection(request, store_id):
    access = _access(request)
    if not (access["platform_admin"] or request.user.user_type in {"owner", "restaurant_admin"}) or not _can_store(access, store_id):
        raise PermissionDenied("Store administrator access is required.")
    store = active_store(access, store_id)
    tenant_id = store_tenants(access["directory"]).get(store_id)
    if store is None or not tenant_id:
        raise NotFound("Select an active store to configure WhatsApp.")
    connection, _ = StoreConnection.objects.get_or_create(pk=store_id, defaults={"tenant_id": tenant_id})
    if connection.tenant_id != tenant_id:
        raise PermissionDenied("This store's tenant assignment changed. Contact your platform administrator.")
    return connection, store


def connection_data(connection):
    expired = connection.credential_expires_at is not None and connection.credential_expires_at <= timezone.now()
    return {
        "status": StoreConnection.Status.RECONNECT if expired else connection.status,
        "actionRequired": "reauthorize" if expired else connection.action_required,
        "businessName": connection.meta_business_name,
        "registeredNumber": connection.registered_phone_number,
        "displayName": connection.approved_display_name,
        "autoSend": connection.auto_send_enabled and not expired,
        "template": connection.default_template or None,
        "signup": signup_configuration(),
    }


def meta_failure(error):
    status = 400 if error.code in {"authorization", "business", "sender"} else 502
    if error.code == "configuration":
        status = 503
    return Response({"error": str(error), "code": error.code}, status=status)


def lock_connection(current):
    locked = StoreConnection.objects.select_for_update().get(pk=current.pk)
    if locked.generation != current.generation:
        raise ValidationError("This store's connection changed in another session. Refresh the page.")
    return locked


def input_object(request):
    if not isinstance(request.data, dict):
        raise ValidationError("Submit the settings as a JSON object.")
    return request.data


def apply_sender_details(connection, details):
    for key, value in details.items():
        setattr(connection, key, value)
    connection.status = StoreConnection.Status.PENDING if connection.action_required else StoreConnection.Status.CONNECTED
    if connection.status != StoreConnection.Status.CONNECTED:
        connection.auto_send_enabled = False


@api_view(["GET", "PATCH"])
def integration(request, store_id):
    connection, _ = admin_connection(request, store_id)
    if request.method == "GET":
        return Response(connection_data(connection))
    data = input_object(request)
    auto_send = data.get("autoSend")
    if not isinstance(auto_send, bool):
        raise ValidationError("Choose whether to send bills automatically.")
    if not auto_send and "templateName" not in data:
        with transaction.atomic():
            connection = lock_connection(connection)
            connection.auto_send_enabled = False
            connection.save(update_fields=["auto_send_enabled", "updated_at"])
        return Response(connection_data(connection))
    if connection.status != StoreConnection.Status.CONNECTED:
        raise ValidationError("Connect an eligible Meta sender first.")
    try:
        token = decrypt_token(connection)
        approved = invoice_templates(connection, token)
    except MetaError as error:
        return meta_failure(error)
    template = next((template for template in approved if template["name"] == data.get("templateName")
                     and template["language"] == data.get("templateLanguage")), None)
    if template is None:
        raise ValidationError("Choose an approved utility receipt template from this store's Meta account.")
    with transaction.atomic():
        connection = lock_connection(connection)
        if connection.status != StoreConnection.Status.CONNECTED:
            raise ValidationError("Refresh the store's Meta connection before saving.")
        connection.default_template = template
        connection.auto_send_enabled = auto_send
        connection.save(update_fields=["default_template", "auto_send_enabled", "updated_at"])
    return Response(connection_data(connection))


@api_view(["POST"])
def signup_start(request, store_id):
    connection, _ = admin_connection(request, store_id)
    if not signup_configuration():
        return Response({"error": "An administrator must configure the platform's Meta application."}, status=503)
    now = timezone.now()
    SignupSession.objects.filter(connection=connection, expires_at__lt=now).delete()
    session = SignupSession.objects.create(connection=connection, administrator=request.user,
                                           generation=connection.generation, expires_at=now + timedelta(minutes=15))
    return Response({"sessionId": str(session.pk)})


@api_view(["POST"])
def signup_complete(request, store_id):
    connection, _ = admin_connection(request, store_id)
    if not signup_configuration():
        return Response({"error": "Meta Embedded Signup is unavailable."}, status=503)
    data = input_object(request)
    code, waba_id, phone_id = (data.get(key) for key in ("code", "wabaId", "phoneId"))
    business_id = data.get("businessId") or ""
    if (not isinstance(code, str) or not 1 <= len(code) <= 4096 or not is_meta_id(waba_id) or not is_meta_id(phone_id)
            or (business_id and not is_meta_id(business_id))):
        raise ValidationError("Select a WhatsApp account and business phone number in Meta.")
    try:
        session_id = uuid.UUID(data.get("sessionId", ""))
    except (TypeError, ValueError, AttributeError):
        raise ValidationError("Start a new Meta authorization session.") from None
    with transaction.atomic():
        session = SignupSession.objects.select_for_update().filter(
            pk=session_id, connection=connection, administrator=request.user,
            generation=connection.generation, expires_at__gt=timezone.now(),
        ).first()
        if session is None:
            raise ValidationError("This authorization session expired or was used. Start again.")
        session.delete()
    try:
        token, expiry = exchange_signup_code(code, waba_id)
        details = sender_details(token, waba_id, phone_id, business_id)
        if StoreConnection.objects.filter(phone_number_id=phone_id).exclude(pk=store_id).exists():
            return Response({"error": "This WhatsApp sender is already connected to a store."}, status=409)
        if graph(f"{waba_id}/subscribed_apps", token=token, payload={}).get("success") is not True:
            raise MetaError("Meta could not subscribe this account to delivery status updates.", code="subscription")
        candidate = StoreConnection(store_id=store_id, tenant_id=connection.tenant_id,
                                    waba_id=waba_id, phone_number_id=phone_id)
        encrypted = encrypt_token(candidate, token)
        with transaction.atomic():
            connection = lock_connection(connection)
            connection.generation = candidate.generation
            connection.waba_id = waba_id
            connection.phone_number_id = phone_id
            connection.credential_expires_at = expiry
            connection.encrypted_credentials = encrypted
            connection.auto_send_enabled = False
            connection.default_template = {}
            apply_sender_details(connection, details)
            connection.save()
            cancel_queued(connection)
    except MetaError as error:
        return meta_failure(error)
    except IntegrityError:
        return Response({"error": "This WhatsApp sender is already connected to a store."}, status=409)
    return Response(connection_data(connection))


@api_view(["POST"])
def verify_sender(request, store_id):
    connection, _ = admin_connection(request, store_id)
    if not connection.phone_number_id or not connection.encrypted_credentials:
        raise ValidationError("Connect a Meta account for this store first.")
    pin = input_object(request).get("pin")
    if pin is not None and (connection.action_required != "register_number" or not isinstance(pin, str)
                            or not re.fullmatch(r"[0-9]{6}", pin)):
        raise ValidationError("Enter the six-digit registration PIN for this sender.")
    try:
        token = decrypt_token(connection)
        if pin is not None and graph(f"{connection.phone_number_id}/register", token=token,
                                    payload={"messaging_product": "whatsapp", "pin": pin}).get("success") is not True:
            raise MetaError("Meta did not confirm phone registration.", code="registration")
        details = sender_details(token, connection.waba_id, connection.phone_number_id, connection.meta_business_id)
    except MetaError as error:
        if error.code in {"credentials", "190"}:
            StoreConnection.objects.filter(pk=store_id, generation=connection.generation).update(
                status=StoreConnection.Status.RECONNECT, auto_send_enabled=False, action_required="reauthorize", updated_at=timezone.now(),
            )
        return meta_failure(error)
    with transaction.atomic():
        connection = lock_connection(connection)
        apply_sender_details(connection, details)
        connection.save()
    return Response(connection_data(connection))


def cancel_queued(connection):
    Receipt.objects.filter(connection=connection, status=Receipt.Status.QUEUED).update(
        status=Receipt.Status.CANCELLED, updated_at=timezone.now(),
    )


@api_view(["POST"])
def disconnect(request, store_id):
    connection, _ = admin_connection(request, store_id)
    with transaction.atomic():
        connection = lock_connection(connection)
        cleared = StoreConnection(store_id=store_id, tenant_id=connection.tenant_id)
        for field in ("meta_business_id", "meta_business_name", "waba_id", "phone_number_id", "approved_display_name",
                      "registered_phone_number", "encrypted_credentials", "credential_expires_at", "generation",
                      "status", "action_required", "auto_send_enabled", "default_template"):
            setattr(connection, field, getattr(cleared, field))
        connection.save()
        cancel_queued(connection)
        SignupSession.objects.filter(connection=connection).delete()
    return Response(connection_data(connection))


@api_view(["GET"])
def templates(request, store_id):
    connection, _ = admin_connection(request, store_id)
    if connection.status != StoreConnection.Status.CONNECTED:
        return Response([])
    try:
        return Response(invoice_templates(connection, decrypt_token(connection)))
    except MetaError as error:
        return meta_failure(error)


@api_view(["POST"])
def send_test(request, store_id):
    connection, store = admin_connection(request, store_id)
    data = input_object(request)
    recipient = normalize_phone(data.get("recipient"))
    if not recipient or data.get("optIn") is not True:
        raise ValidationError("Enter a valid WhatsApp number and confirm the recipient agreed to the test.")
    with transaction.atomic():
        connection = lock_connection(connection)
        now = timezone.now()
        if not ready_to_send(connection, now):
            raise ValidationError("Connect a store sender and save an approved receipt template first.")
        if Receipt.objects.filter(connection=connection, bill_id="", created_at__gte=now - timedelta(minutes=15)).count() >= 5:
            return Response({"error": "This store has reached the test message limit. Try again in 15 minutes."}, status=429)
        receipt = enqueue_receipt(connection, actor=request.user, recipient=recipient, invoice={
            "invoice_number": "TEST-" + uuid.uuid4().hex[:8].upper(),
            "store": str(store.get("name") or "Store")[:180],
            "branch": str(store.get("branch") or "")[:160],
            "completed_at": now.isoformat(), "subtotal": "0.00", "total": "0.00", "payment": "Test receipt",
            "items": [{"name": "Test message", "quantity": "1", "rate": "0.00"}],
        })
    return Response({"id": receipt.pk, "status": receipt.status}, status=202)


@api_view(["POST"])
def resend(request, store_id, receipt_id):
    connection, _ = admin_connection(request, store_id)
    with transaction.atomic():
        connection = lock_connection(connection)
        receipt = Receipt.objects.select_for_update().filter(pk=receipt_id, connection=connection).first()
        if receipt is None:
            raise NotFound()
        now = timezone.now()
        if receipt.status != Receipt.Status.FAILED:
            raise ValidationError("Resend is available after a confirmed delivery failure.")
        if not ready_to_send(connection, now) or receipt.phone_number_id != connection.phone_number_id or receipt.waba_id != connection.waba_id:
            raise ValidationError("Reconnect the original store sender and select an approved receipt template.")
        receipt.generation = connection.generation
        receipt.template = connection.default_template
        receipt.manual = True
        receipt.retry_count = 0
        receipt.next_attempt_at = now
        save_status(receipt, Receipt.Status.QUEUED, "generation", "template", "manual", "retry_count", "next_attempt_at")
    return Response({"id": receipt.pk, "status": receipt.status}, status=202)


@api_view(["GET"])
def history(request, store_id):
    connection, _ = admin_connection(request, store_id)
    try:
        page = int(request.query_params.get("page", 1))
        if not 1 <= page <= 1000000:
            raise ValueError
    except ValueError:
        raise ValidationError("Enter a valid history page.") from None
    size = 50
    offset = (page - 1) * size
    latest = DeliveryAttempt.objects.filter(receipt_id=OuterRef("pk"))
    records = list(Receipt.objects.filter(connection=connection).annotate(
        message_id=Subquery(latest.values("meta_message_id")[:1]),
        error_code=Subquery(latest.values("error_code")[:1]),
    ).order_by("-created_at", "-id")[offset:offset + size + 1])
    rows = []
    for receipt in records[:size]:
        rows.append({
            "id": receipt.pk, "invoice": receipt.invoice.get("invoice_number"), "test": not receipt.bill_id,
            "recipient": "••••" + receipt.recipient[-4:], "createdAt": receipt.created_at,
            "status": receipt.status, "metaMessageId": receipt.message_id or "", "errorCode": receipt.error_code or "",
        })
    # The predecessor's dispatch table is present only on releases that used
    # it. Read it in place, with the same authenticated store scope.
    legacy = []
    if page == 1 and "core_whatsappbilldispatch" in database.introspection.table_names():
        with database.cursor() as cursor:
            cursor.execute(
                "SELECT bill_id, status, message_id, updated_at FROM core_whatsappbilldispatch "
                "WHERE store_id = %s ORDER BY updated_at DESC LIMIT 50", [store_id],
            )
            legacy = [{"invoice": bill, "status": status, "metaMessageId": message, "createdAt": updated}
                      for bill, status, message, updated in cursor.fetchall()]
    return Response({"messages": rows, "hasNext": len(records) > size, "legacyMessages": legacy})


@api_view(["POST"])
def retired_receipt_endpoint(request):
    return Response({"error": "Install the updated POS to send receipts through your store's Meta connection."}, status=410)


@csrf_exempt
@require_http_methods(["GET", "POST"])
def webhook(request):
    if request.method == "GET":
        token = settings.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN.encode()
        challenge = request.GET.get("hub.challenge", "")
        if (token and request.GET.get("hub.mode") == "subscribe" and re.fullmatch(r"[0-9]{1,100}", challenge)
                and hmac.compare_digest(request.GET.get("hub.verify_token", "").encode(), token)):
            return HttpResponse(challenge, content_type="text/plain")
        return HttpResponseForbidden()
    secret = settings.META_WHATSAPP_APP_SECRET.encode()
    if not secret:
        return HttpResponseForbidden()
    payload = request.body
    signature = "sha256=" + hmac.new(secret, payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(request.headers.get("X-Hub-Signature-256", "").encode(), signature.encode()):
        return HttpResponseForbidden()
    try:
        event = json.loads(payload)
    except (ValueError, UnicodeError):
        return HttpResponseBadRequest()
    if not isinstance(event, dict) or event.get("object") != "whatsapp_business_account":
        return HttpResponseBadRequest()
    for entry in event.get("entry") or []:
        if not isinstance(entry, dict):
            continue
        waba_id = entry.get("id")
        if not is_meta_id(waba_id):
            continue
        for change in entry.get("changes") or []:
            if not isinstance(change, dict) or change.get("field") != "messages":
                continue
            value = change.get("value")
            metadata = value.get("metadata") if isinstance(value, dict) else None
            phone_id = metadata.get("phone_number_id") if isinstance(metadata, dict) else None
            if not is_meta_id(phone_id):
                continue
            for status in value.get("statuses") or []:
                if isinstance(status, dict):
                    record_webhook_status(waba_id, phone_id, status)
    return HttpResponse(status=200)


@require_safe
def digital_receipt(request):
    try:
        token = uuid.UUID(request.GET.get("key", ""))
    except ValueError:
        token = None
    receipt = Receipt.objects.filter(public_token=token, link_expires_at__gt=timezone.now()).first() if token else None
    response = (render(request, "whatsapp/receipt.html", {"invoice": receipt.invoice, "test": not receipt.bill_id})
                if receipt else HttpResponseNotFound("This receipt link is unavailable.", content_type="text/plain"))
    for name, value in {
        "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    }.items():
        response[name] = value
    return response
