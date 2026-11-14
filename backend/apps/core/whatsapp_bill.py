"""Send a saved POS bill using an approved Meta WhatsApp text template."""

import json
import logging
import os
import re
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from django.db import transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .cloud_views import _access, _can_store
from .models import SharedAppState, WhatsAppBillDispatch
from .training_otp import _phone_digits
from .whatsapp_bill_format import template_payload

logger = logging.getLogger(__name__)


def _config(store_id):
    # Explicit activation is required after the matching receipt template is approved.
    if os.getenv("META_WHATSAPP_BILL_ENABLED", "").lower().strip() not in ("1", "true", "yes", "on"):
        return None
    config = {
        "store_id": os.getenv("META_WHATSAPP_BILL_STORE_ID", "").strip(),
        "token": os.getenv("META_WHATSAPP_ACCESS_TOKEN", "").strip(),
        "phone_id": os.getenv("META_WHATSAPP_PHONE_NUMBER_ID", "").strip(),
        "version": os.getenv("META_WHATSAPP_API_VERSION", "").strip(),
        "template": os.getenv("META_WHATSAPP_BILL_TEMPLATE_NAME", "").strip(),
        "language": os.getenv("META_WHATSAPP_BILL_TEMPLATE_LANGUAGE", "en").strip(),
    }
    if (config["store_id"] != store_id or not config["token"] or
            not re.fullmatch(r"\d{1,30}", config["phone_id"]) or
            not re.fullmatch(r"v\d{1,3}\.\d{1,3}", config["version"]) or
            not re.fullmatch(r"[a-z0-9_]{1,512}", config["template"]) or
            not re.fullmatch(r"[a-zA-Z_]{2,10}", config["language"])):
        return None
    return config


def _send(payload, config):
    request = Request(
        f"https://graph.facebook.com/{config['version']}/{config['phone_id']}/messages",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), method="POST",
        headers={"Authorization": f"Bearer {config['token']}", "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=15) as response:
        result = json.load(response)
    message_id = (result.get("messages") or [{}])[0].get("id")
    if not isinstance(message_id, str) or not message_id:
        raise ValueError("Meta response did not contain a message ID")
    return message_id[:255]


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_bill_receipt(request):
    store_id = str(request.data.get("storeId") or "").strip()
    bill_id = str(request.data.get("billId") or "").strip()
    if not store_id or len(store_id) > 100 or not bill_id or len(bill_id) > 120:
        return Response({"error": "A valid store and bill are required."}, status=400)
    if not _can_store(_access(request), store_id):
        return Response({"error": "Store access denied."}, status=403)
    preference = SharedAppState.objects.filter(state_key=f"vestora-whatsapp-receipts-{store_id}").first()
    if not preference or not isinstance(preference.state_value, dict) or preference.state_value.get("enabled") is not True:
        return Response({"error": "Automatic WhatsApp receipts are disabled for this store."}, status=403)
    trigger = request.data.get("trigger", "checkout")
    if trigger not in ("checkout", "print"):
        return Response({"error": "Invalid WhatsApp receipt trigger."}, status=400)
    if trigger != preference.state_value.get("sendWhen", "checkout"):
        return Response({"error": "WhatsApp receipt timing changed. Refresh the POS to use the saved setting."}, status=409)
    config = _config(store_id)
    if not config:
        return Response({"error": "WhatsApp bill receipts are not configured for this store."}, status=503)
    row = SharedAppState.objects.filter(state_key="vestora-sales-ledger").first()
    records = row.state_value if row and isinstance(row.state_value, list) else []
    bill = next((record for record in records if isinstance(record, dict)
                 and str(record.get("storeId")) == store_id and str(record.get("id")) == bill_id), None)
    if not bill or bill.get("training") or str(bill.get("id", "")).startswith("TRAIN-"):
        return Response({"error": "Saved live bill not found. Sync the bill and try again."}, status=404)
    phone = _phone_digits(bill.get("customerMobile"))
    if not phone:
        return Response({"error": "This bill has no valid customer WhatsApp number."}, status=400)
    try:
        payload = template_payload(phone, config["template"], config["language"], bill)
    except ValueError as error:
        return Response({"error": str(error)}, status=400)
    with transaction.atomic():
        delivery, created = WhatsAppBillDispatch.objects.select_for_update().get_or_create(
            store_id=store_id, bill_id=bill_id, defaults={"status": "sending"},
        )
        if not created:
            if delivery.status == "accepted":
                return Response({"status": "accepted", "alreadySent": True})
            if delivery.status in ("sending", "unknown"):
                return Response({"error": "The previous WhatsApp attempt has an uncertain result; check Meta before retrying."}, status=409)
            delivery.status = "sending"
            delivery.save(update_fields=("status", "updated_at"))
    try:
        message_id = _send(payload, config)
    except HTTPError as error:
        # A 4xx response is an explicit rejection; a 5xx or timeout may have
        # occurred after acceptance, so it must not be retried automatically.
        delivery.status = "rejected" if 400 <= error.code < 500 and error.code != 408 else "unknown"
        delivery.save(update_fields=("status", "updated_at"))
        return Response({"error": "Meta did not accept the bill receipt. Check the template and WhatsApp connection."}, status=502)
    except Exception:
        logger.warning("WhatsApp bill send outcome is uncertain for store %s", store_id)
        delivery.status = "unknown"
        delivery.save(update_fields=("status", "updated_at"))
        return Response({"error": "WhatsApp send status is uncertain. Check Meta before retrying."}, status=502)
    delivery.status = "accepted"
    delivery.message_id = message_id
    delivery.save(update_fields=("status", "message_id", "updated_at"))
    return Response({"status": "accepted", "alreadySent": False})
