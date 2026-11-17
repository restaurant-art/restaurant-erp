import base64
import hashlib
import hmac
import json
import re
from datetime import UTC, datetime
from functools import lru_cache
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.utils import timezone


class MetaError(Exception):
    def __init__(self, message, *, code="meta_unavailable", http_status=0):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


graph_opener = build_opener(NoRedirects())


def is_meta_id(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9]{1,32}", value) is not None


def kms_key_is_configured():
    return re.fullmatch(r"arn:aws(?:-[a-z]+)?:kms:[a-z0-9-]+:[0-9]{12}:key/[a-zA-Z0-9-]+",
                        settings.META_WHATSAPP_KMS_KEY_ARN) is not None


@lru_cache(maxsize=3)
def kms_client(region):
    return boto3.client("kms", region_name=region, config=Config(connect_timeout=2, read_timeout=4, retries={"total_max_attempts": 2}))


def signup_configuration():
    try:
        origin = urlsplit(settings.META_WHATSAPP_RECEIPT_ORIGIN)
        valid_origin = origin.scheme == "https" and bool(origin.hostname) and not (
            origin.path or origin.query or origin.fragment or origin.username or origin.password
        )
    except ValueError:
        return None
    if not (is_meta_id(settings.META_WHATSAPP_APP_ID) and is_meta_id(settings.META_WHATSAPP_SIGNUP_CONFIG_ID)
            and re.fullmatch(r"v[0-9]{1,3}\.0", settings.META_WHATSAPP_GRAPH_VERSION)
            and settings.META_WHATSAPP_APP_SECRET and settings.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN
            and valid_origin and kms_key_is_configured()):
        return None
    return {
        "appId": settings.META_WHATSAPP_APP_ID,
        "configId": settings.META_WHATSAPP_SIGNUP_CONFIG_ID,
        "graphVersion": settings.META_WHATSAPP_GRAPH_VERSION,
    }


def credential_context(connection):
    return {
        "purpose": "uvpro-whatsapp-sender", "tenant": connection.tenant_id, "store": connection.store_id,
        "waba": connection.waba_id, "phone": connection.phone_number_id, "generation": str(connection.generation),
    }


def kms_request(operation, connection, **data):
    if not kms_key_is_configured():
        raise MetaError("Configure the platform's WhatsApp KMS key.", code="configuration")
    key = settings.META_WHATSAPP_KMS_KEY_ARN
    try:
        client = kms_client(key.split(":")[3])
        return getattr(client, operation)(KeyId=key, EncryptionContext=credential_context(connection), **data)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "InvalidCiphertextException":
            raise MetaError("Reconnect the store's Meta account to restore its credentials.", code="credentials") from None
        raise MetaError("The WhatsApp credential store is unavailable.", code="key_unavailable") from None
    except BotoCoreError:
        raise MetaError("The WhatsApp credential store is unavailable.", code="key_unavailable") from None


def encrypt_token(connection, token):
    plaintext = token.encode()
    if len(plaintext) > 4096:
        raise MetaError("Meta returned an authorization that exceeds the credential store limit.", code="authorization")
    response = kms_request("encrypt", connection, Plaintext=plaintext)
    return base64.b64encode(response["CiphertextBlob"]).decode()


def decrypt_token(connection):
    try:
        ciphertext = base64.b64decode(connection.encrypted_credentials, validate=True)
        if not ciphertext:
            raise ValueError
        token = kms_request("decrypt", connection, CiphertextBlob=ciphertext)["Plaintext"].decode()
        if not token:
            raise ValueError
        return token
    except ValueError:
        raise MetaError("Reconnect the store's Meta account to restore its credentials.", code="credentials") from None


def graph(path, *, token="", params=None, payload=None, app_token=False):
    version = settings.META_WHATSAPP_GRAPH_VERSION
    if not re.fullmatch(r"v[0-9]{1,3}\.0", version):
        raise MetaError("The Meta Graph API version is missing.", code="configuration")
    headers = {"Accept": "application/json"}
    query = dict(params or {})
    if token:
        headers["Authorization"] = "Bearer " + token
        if not app_token:
            query["appsecret_proof"] = hmac.new(
                settings.META_WHATSAPP_APP_SECRET.encode(), token.encode(), hashlib.sha256,
            ).hexdigest()
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload, ensure_ascii=False).encode()
    url = f"https://graph.facebook.com/{version}/{path}"
    if query:
        url += "?" + urlencode(query)
    try:
        with graph_opener.open(Request(url, headers=headers, data=data), timeout=10) as response:
            result = json.loads(response.read(1024 * 1024))
    except HTTPError as error:
        with error:
            try:
                body = json.loads(error.read(64 * 1024))
                code = body.get("error", {}).get("code")
            except (AttributeError, ValueError, OSError):
                code = None
        raise MetaError("Meta declined or could not complete the request.",
                        code=str(code) if isinstance(code, int) else f"http_{error.code}",
                        http_status=error.code) from None
    except (OSError, ValueError):
        raise MetaError("Meta's response could not be confirmed.") from None
    if not isinstance(result, dict):
        raise MetaError("Meta returned an unexpected response.")
    return result


def graph_list(path, token, *, fields, params=None):
    query = {"fields": fields, "limit": 100, **(params or {})}
    cursors = set()
    for _ in range(50):
        result = graph(path, token=token, params=query)
        data = result.get("data")
        if not isinstance(data, list):
            raise MetaError("Meta did not return the requested list.")
        yield from (item for item in data if isinstance(item, dict))
        paging = result.get("paging") or {}
        cursor = (paging.get("cursors") or {}).get("after")
        if not paging.get("next") or not cursor or cursor in cursors:
            return
        query["after"] = cursor
        cursors.add(cursor)
    raise MetaError("Meta returned too many pages. Narrow the selection in Meta.", code="pagination")


def exchange_signup_code(code, waba_id):
    grant = graph("oauth/access_token", params={
        "client_id": settings.META_WHATSAPP_APP_ID,
        "client_secret": settings.META_WHATSAPP_APP_SECRET,
        "code": code,
    })
    token = grant.get("access_token")
    if not isinstance(token, str) or not token:
        raise MetaError("Meta did not return an authorization for this store.", code="authorization")
    debug = graph("debug_token", token=f"{settings.META_WHATSAPP_APP_ID}|{settings.META_WHATSAPP_APP_SECRET}",
                  params={"input_token": token}, app_token=True).get("data") or {}
    permissions = {"whatsapp_business_management", "whatsapp_business_messaging"}
    if (debug.get("is_valid") is not True or debug.get("app_id") != settings.META_WHATSAPP_APP_ID
            or not permissions.issubset(debug.get("scopes") or [])):
        raise MetaError("Authorize WhatsApp management and messaging in Meta.", code="authorization")
    for grant_scope in debug.get("granular_scopes") or []:
        if grant_scope.get("scope") != "whatsapp_business_management":
            continue
        targets = grant_scope.get("target_ids")
        if targets and waba_id not in targets:
            raise MetaError("Meta did not grant access to the WhatsApp account selected for this store.", code="authorization")
    expiries = [debug.get(key) for key in ("expires_at", "data_access_expires_at")]
    expiries = [value for value in expiries if isinstance(value, int) and 0 < value < 253402300799]
    expiry = datetime.fromtimestamp(min(expiries), UTC) if expiries else None
    if expiry is not None and expiry <= timezone.now():
        raise MetaError("The Meta authorization has expired. Reconnect the account.", code="authorization")
    return token, expiry


def sender_details(token, waba_id, phone_id, claimed_business_id=""):
    waba = graph(waba_id, token=token, params={"fields": "id,name,owner_business_info"})
    owner = waba.get("owner_business_info") or {}
    business_id = owner.get("id")
    if (waba.get("id") != waba_id or not is_meta_id(business_id)
            or (claimed_business_id and business_id != claimed_business_id)):
        raise MetaError("Meta could not verify the business that owns this WhatsApp account.", code="business")
    phones = graph_list(f"{waba_id}/phone_numbers", token, fields="id,display_phone_number,verified_name,status,platform_type")
    phone = next((entry for entry in phones if entry.get("id") == phone_id), None)
    if not phone or not phone.get("display_phone_number"):
        raise MetaError("The selected phone number does not belong to this Meta WhatsApp account.", code="sender")
    try:
        name_status = graph(phone_id, token=token, params={"fields": "name_status"}).get("name_status", "")
    except MetaError as error:
        # Meta exposes name_status to selected apps. verified_name is Meta's
        # supported identity field for existing connected Cloud API senders.
        if error.code != "100":
            raise
        name_status = ""
    verified_name = str(phone.get("verified_name") or "").strip()
    name_ready = bool(verified_name and name_status in {"", "APPROVED", "AVAILABLE_WITHOUT_REVIEW"})
    if phone.get("platform_type") == "ON_PREMISE":
        action = "cloud_api_required"
    elif str(phone.get("status", "")).upper() != "CONNECTED":
        action = "register_number"
    elif not name_ready:
        action = "display_name_review"
    else:
        action = ""
    return {
        "meta_business_id": business_id,
        "meta_business_name": str(owner.get("name") or waba.get("name") or "")[:200],
        "registered_phone_number": str(phone["display_phone_number"])[:32],
        "approved_display_name": verified_name[:200] if name_ready else "",
        "action_required": action,
    }
