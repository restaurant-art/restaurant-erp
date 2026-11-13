"""Meta WhatsApp OTP gate for the isolated POS Training Mode."""

import hashlib
import hmac
import json
import logging
import os
import secrets
import uuid
from datetime import timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .cloud_views import _access, _can_store, _security_controls
from .models import ActionOtpChallenge, TrainingOtpChallenge


logger = logging.getLogger(__name__)
User = get_user_model()
OTP_LIFETIME = timedelta(minutes=5)
RESEND_DELAY = timedelta(seconds=60)
MAX_ATTEMPTS = 5


def _cashier_for_request(request):
    email = str(request.data.get("email", "")).strip().lower()
    store_id = str(request.data.get("storeId", "")).strip()
    access = _access(request)
    cashier = next((entry for entry in access["staff"] if isinstance(entry, dict)
                    and str(entry.get("email", "")).strip().lower() == email
                    and str(entry.get("storeId", "")) == store_id
                    and str(entry.get("status", "Active")).lower() == "active"), None)
    if not cashier or not store_id or not _can_store(access, store_id):
        return None, None
    if not User.objects.filter(email__iexact=email, is_active=True).exists():
        return None, None
    return cashier, store_id


def _phone_digits(value):
    raw = str(value or "").strip()
    if raw.startswith("00"):
        raw = raw[2:]
    if raw.startswith("+"):
        raw = raw[1:]
    digits = "".join(character for character in raw if character.isdigit())
    if len(digits) == 10:
        digits = "91" + digits  # Existing Indian cashier numbers may omit the country code.
    return digits if 11 <= len(digits) <= 15 else ""


def _digest(challenge_id, code):
    message = f"{challenge_id}:{code}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def _meta_config():
    return {
        "token": os.getenv("META_WHATSAPP_ACCESS_TOKEN", "").strip(),
        "phone_id": os.getenv("META_WHATSAPP_PHONE_NUMBER_ID", "").strip(),
        "template": os.getenv("META_WHATSAPP_OTP_TEMPLATE_NAME", "").strip(),
        "version": os.getenv("META_WHATSAPP_API_VERSION", "").strip(),
        "language": os.getenv("META_WHATSAPP_TEMPLATE_LANGUAGE", "en_US").strip() or "en_US",
    }


def send_whatsapp_otp(phone, code, config):
    """Send an approved Meta AUTHENTICATION template with a copy-code button."""
    payload = {
        "messaging_product": "whatsapp", "recipient_type": "individual", "to": phone,
        "type": "template",
        "template": {
            "name": config["template"], "language": {"code": config["language"]},
            "components": [
                {"type": "body", "parameters": [{"type": "text", "text": code}]},
                {"type": "button", "sub_type": "url", "index": "0",
                 "parameters": [{"type": "text", "text": code}]},
            ],
        },
    }
    request = Request(
        f"https://graph.facebook.com/{config['version']}/{config['phone_id']}/messages",
        data=json.dumps(payload).encode(), method="POST",
        headers={"Authorization": f"Bearer {config['token']}", "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=10) as response:
        result = json.load(response)
    if not result.get("messages"):
        raise ValueError("Meta did not accept the OTP message")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_training_otp(request):
    cashier, store_id = _cashier_for_request(request)
    if cashier is None:
        return Response({"error": "Cashier is not available in this store"}, status=403)
    training_controls = _security_controls(store_id).get("trainingMode") or {}
    if training_controls.get("requireOtp") is False:
        return Response({"otpRequired": False, "cashier": {key: cashier.get(key) for key in ("id", "name", "email", "role", "storeId", "mobile")}})
    config = _meta_config()
    if not all(config[field] for field in ("token", "phone_id", "template", "version")):
        return Response({"error": "WhatsApp OTP is not configured. Ask an administrator to set up Meta Cloud API."}, status=503)
    account = User.objects.filter(email__iexact=cashier["email"], is_active=True).first()
    phone = _phone_digits(training_controls.get("recipientPhone") or cashier.get("mobile") or account.mobile)
    if not phone:
        return Response({"error": "This cashier needs a WhatsApp mobile number in their staff profile."}, status=400)

    now = timezone.now()
    email = str(cashier["email"]).strip().lower()
    recent = TrainingOtpChallenge.objects.filter(
        requested_by=request.user, cashier_email=email, store_id=store_id,
    ).order_by("-created_at").first()
    if recent and recent.created_at > now - RESEND_DELAY:
        return Response({"error": "Please wait one minute before requesting another code."}, status=429)
    if TrainingOtpChallenge.objects.filter(requested_by=request.user, created_at__gt=now - timedelta(hours=1)).count() >= 10:
        return Response({"error": "Too many codes requested. Try again later."}, status=429)
    if TrainingOtpChallenge.objects.filter(cashier_email=email, created_at__gt=now - timedelta(hours=1)).count() >= 15:
        return Response({"error": "Too many codes requested for this cashier. Try again later."}, status=429)

    code = f"{secrets.randbelow(1000000):06d}"
    challenge = TrainingOtpChallenge(
        requested_by=request.user, cashier_email=email, store_id=store_id,
        expires_at=now + OTP_LIFETIME,
    )
    challenge.code_digest = _digest(challenge.id, code)
    challenge.save()
    try:
        send_whatsapp_otp(phone, code, config)
    except (HTTPError, URLError, TimeoutError, ValueError, OSError):
        challenge.delete()
        logger.warning("Meta WhatsApp OTP delivery failed for training challenge", exc_info=True)
        return Response({"error": "Could not send the WhatsApp code. Check Meta setup and try again."}, status=502)

    TrainingOtpChallenge.objects.filter(
        requested_by=request.user, cashier_email=email, store_id=store_id,
        consumed_at__isnull=True,
    ).exclude(pk=challenge.pk).update(consumed_at=now)
    return Response({"challengeId": str(challenge.id), "maskedPhone": f"+{phone[:2]} ••••••{phone[-4:]}", "expiresInSeconds": 300})


def _action_settings(action):
    return {
        "grn_delete": "grnDelete",
        "pos_item_add": "posItemAdd",
        "pos_item_delete": "posItemDelete",
    }.get(action)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_action_otp(request):
    action = str(request.data.get("action", ""))
    section = _action_settings(action)
    store_id = str(request.data.get("storeId", "")).strip()
    access = _access(request)
    if not section or not store_id or not _can_store(access, store_id):
        return Response({"error": "Protected action is not available for this store."}, status=403)
    controls = _security_controls(store_id).get(section) or {}
    if not controls.get("requireOtp", action in {"pos_item_add", "pos_item_delete"}):
        return Response({"otpRequired": False})
    phone = _phone_digits(controls.get("recipientPhone"))
    if not phone:
        return Response({"error": "Set a valid OTP recipient number in Settings → OTP & access controls."}, status=400)
    config = _meta_config()
    if not all(config[field] for field in ("token", "phone_id", "template", "version")):
        return Response({"error": "WhatsApp OTP is not configured. Ask an administrator to set up Meta Cloud API."}, status=503)

    now = timezone.now()
    recent = ActionOtpChallenge.objects.filter(
        requested_by=request.user, action=action, store_id=store_id,
    ).order_by("-created_at").first()
    if recent and recent.created_at > now - RESEND_DELAY:
        return Response({"error": "Please wait one minute before requesting another code."}, status=429)
    if ActionOtpChallenge.objects.filter(requested_by=request.user, created_at__gt=now - timedelta(hours=1)).count() >= 10:
        return Response({"error": "Too many codes requested. Try again later."}, status=429)

    code = f"{secrets.randbelow(1000000):06d}"
    challenge = ActionOtpChallenge(
        requested_by=request.user, action=action, store_id=store_id, recipient_phone=phone,
        expires_at=now + OTP_LIFETIME,
    )
    challenge.code_digest = _digest(challenge.id, code)
    challenge.save()
    try:
        send_whatsapp_otp(phone, code, config)
    except (HTTPError, URLError, TimeoutError, ValueError, OSError):
        challenge.delete()
        logger.warning("Meta WhatsApp OTP delivery failed for protected action", exc_info=True)
        return Response({"error": "Could not send the WhatsApp code. Check Meta setup and try again."}, status=502)
    ActionOtpChallenge.objects.filter(
        requested_by=request.user, action=action, store_id=store_id, consumed_at__isnull=True,
    ).exclude(pk=challenge.pk).update(consumed_at=now)
    return Response({
        "challengeId": str(challenge.id), "maskedPhone": f"+{phone[:2]} ••••••{phone[-4:]}",
        "expiresInSeconds": 300,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_action_otp(request):
    action = str(request.data.get("action", ""))
    section = _action_settings(action)
    store_id = str(request.data.get("storeId", "")).strip()
    access = _access(request)
    if not section or not store_id or not _can_store(access, store_id):
        return Response({"error": "Protected action is not available for this store."}, status=403)
    if not (_security_controls(store_id).get(section) or {}).get("requireOtp", action in {"pos_item_add", "pos_item_delete"}):
        return Response({"error": "OTP is disabled for this action in settings."}, status=409)
    code = str(request.data.get("code", "")).strip()
    if len(code) != 6 or not code.isascii() or not code.isdigit():
        return Response({"error": "Enter the 6-digit WhatsApp code."}, status=400)
    try:
        challenge_id = uuid.UUID(str(request.data.get("challengeId", "")))
    except (ValueError, AttributeError):
        return Response({"error": "Code expired or unavailable. Request a new one."}, status=403)
    with transaction.atomic():
        challenge = ActionOtpChallenge.objects.select_for_update().filter(
            pk=challenge_id, requested_by=request.user, action=action, store_id=store_id,
        ).first()
        now = timezone.now()
        if not challenge or challenge.consumed_at or challenge.expires_at <= now or challenge.attempts >= MAX_ATTEMPTS:
            return Response({"error": "Code expired or unavailable. Request a new one."}, status=403)
        challenge.attempts += 1
        if not hmac.compare_digest(challenge.code_digest, _digest(challenge.id, code)):
            if challenge.attempts >= MAX_ATTEMPTS:
                challenge.consumed_at = now
            challenge.save(update_fields=("attempts", "consumed_at"))
            return Response({"error": "Incorrect code. Please try again."}, status=403)
        challenge.consumed_at = now
        challenge.save(update_fields=("attempts", "consumed_at"))
    return Response({"approvalToken": str(challenge.id), "expiresInSeconds": 300})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_training_otp(request):
    cashier, store_id = _cashier_for_request(request)
    if cashier is None:
        return Response({"error": "Cashier is not available in this store"}, status=403)
    email = str(cashier["email"]).strip().lower()
    code = str(request.data.get("code", "")).strip()
    challenge_id = str(request.data.get("challengeId", ""))
    if len(code) != 6 or not code.isascii() or not code.isdigit():
        return Response({"error": "Enter the 6-digit WhatsApp code."}, status=400)
    try:
        challenge_id = uuid.UUID(challenge_id)
    except (ValueError, AttributeError):
        return Response({"error": "Code expired or unavailable. Request a new one."}, status=403)
    with transaction.atomic():
        challenge = TrainingOtpChallenge.objects.select_for_update().filter(
            pk=challenge_id, requested_by=request.user, cashier_email=email, store_id=store_id,
        ).first()
        now = timezone.now()
        if not challenge or challenge.consumed_at or challenge.expires_at <= now or challenge.attempts >= MAX_ATTEMPTS:
            return Response({"error": "Code expired or unavailable. Request a new one."}, status=403)
        challenge.attempts += 1
        if not hmac.compare_digest(challenge.code_digest, _digest(challenge.id, code)):
            if challenge.attempts >= MAX_ATTEMPTS:
                challenge.consumed_at = now
            challenge.save(update_fields=("attempts", "consumed_at"))
            return Response({"error": "Incorrect code. Please try again."}, status=403)
        challenge.consumed_at = now
        challenge.save(update_fields=("attempts", "consumed_at"))
    return Response({"cashier": {key: cashier.get(key) for key in ("id", "name", "email", "role", "storeId")}})
