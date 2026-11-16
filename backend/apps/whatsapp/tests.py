import hashlib
import hmac
import importlib
import json
import uuid
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import urlsplit

import boto3
from botocore.stub import Stubber
from django.apps import apps
from django.db import connection as database
from django.test import override_settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient, APITestCase

from apps.core.models import SharedAppState, User

from .delivery import deliver_pending
from .meta import MetaError, credential_context, decrypt_token, encrypt_token, exchange_signup_code, sender_details
from .models import DeliveryAttempt, Receipt, StoreConnection
from .receipts import normalize_phone


APP_SECRET = "synthetic-whatsapp-app-secret"
KMS_KEY = "arn:aws:kms:ap-south-1:123456789012:key/12345678-1234-4321-abcd-123456789012"
WEBHOOK = "/api/webhooks/meta/whatsapp/"
DIRECTORY = [
    {"id": "KUN", "name": "Kunnil Hypermarket", "adminEmail": "kunnil@example.test"},
    {"id": "HYD", "name": "HYDIS Hypermarket", "adminEmail": "hydis@example.test"},
    {"id": "ABC", "name": "Restaurant ABC", "adminEmail": "abc@example.test"},
    {"id": "KUN-WEST", "name": "Kunnil Hypermarket", "parentStoreId": "KUN", "branch": "West"},
]
TEMPLATE_META = {
    "name": "digital_receipt", "language": "en", "status": "APPROVED", "category": "UTILITY", "parameter_format": "POSITIONAL",
    "components": [{"type": "BODY", "text": "Thank you for visiting {{1}}. Invoice {{2}} totals {{3}}. View your receipt at {{4}}."}],
}
TEMPLATE = {"name": "digital_receipt", "language": "en", "layout": "link", "body": TEMPLATE_META["components"][0]["text"]}


@override_settings(META_WHATSAPP_APP_ID="12345", META_WHATSAPP_APP_SECRET=APP_SECRET,
                   META_WHATSAPP_SIGNUP_CONFIG_ID="67890", META_WHATSAPP_GRAPH_VERSION="v26.0",
                   META_WHATSAPP_WEBHOOK_VERIFY_TOKEN="webhook-test-verify", META_WHATSAPP_KMS_KEY_ARN=KMS_KEY,
                   META_WHATSAPP_RECEIPT_ORIGIN="https://pos.example.test")
class StoreWhatsAppTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.platform = User.objects.create_user("platform", email="platform@example.test", user_type="super_admin")
        cls.kun = User.objects.create_user("kun", email="kunnil@example.test", user_type="restaurant_admin", password="SyntheticPass123")
        cls.hyd = User.objects.create_user("hyd", email="hydis@example.test", user_type="restaurant_admin")
        cls.abc = User.objects.create_user("abc", email="abc@example.test", user_type="restaurant_admin")
        cls.cashier = User.objects.create_user("cashier", email="cashier@example.test", user_type="cashier")
        SharedAppState.objects.create(state_key="vestora-users", state_value=[
            {"email": cls.cashier.email, "storeId": "KUN", "role": "Cashier", "authUserId": str(cls.cashier.pk)},
        ])

    def setUp(self):
        self.client.force_authenticate(self.platform)
        response = self.save_state("vestora-stores", DIRECTORY)
        self.assertEqual(response.status_code, 200, response.data)

    def save_state(self, key, value, *, mutation_id=None, version=None):
        if version is None:
            previous = SharedAppState.objects.filter(pk=key).first()
            version = previous.updated_at.isoformat() if previous else None
        return self.client.put("/api/cloud/state/", {
            "key": key, "value": value, "mutationId": str(mutation_id or uuid.uuid4()), "expectedUpdatedAt": version,
        }, format="json")

    def connect(self, store_id="KUN", *, phone="101", waba="201", auto=True):
        StoreConnection.objects.filter(pk=store_id).update(
            status="connected", meta_business_id="301", waba_id=waba, phone_number_id=phone,
            approved_display_name="Connected at Meta", registered_phone_number="+1 555 0100",
            encrypted_credentials="ciphertext-placeholder", auto_send_enabled=auto, default_template=TEMPLATE,
        )
        return StoreConnection.objects.get(pk=store_id)

    def bill(self, store_id="KUN", *, opt_in=True, mobile="9876543210", **overrides):
        return {
            "id": "BILL-" + uuid.uuid4().hex, "orderNumber": "INV-10025", "storeId": store_id,
            "completedAt": timezone.now().isoformat(), "items": [{"name": "Rice <250g>", "qty": 2, "price": 35}],
            "subtotal": 70, "total": 70, "tax": 3.33, "payment": "Cash", "customerMobile": mobile,
            "customerName": "Test customer", "whatsappReceiptOptIn": opt_in, **overrides,
        }

    def save_bill(self, bill):
        ledger = SharedAppState.objects.filter(pk="vestora-sales-ledger").first()
        scoped = [entry for entry in (ledger.state_value if ledger else []) if entry.get("storeId") == bill.get("storeId")]
        return self.save_state("vestora-sales-ledger", [bill, *scoped])

    def post_status(self, waba, phone, status, message_id="wamid.test", callback_data=None, signed=True, code=None):
        info = {"id": message_id, "status": status, "biz_opaque_callback_data": str(callback_data or "")}
        if code:
            info["errors"] = [{"code": code, "message": "External free-text error"}]
        body = json.dumps({"object": "whatsapp_business_account", "entry": [{"id": waba, "changes": [
            {"field": "messages", "value": {"metadata": {"phone_number_id": phone}, "statuses": [info]}},
        ]}]}).encode()
        signature = "sha256=" + hmac.new(APP_SECRET.encode(), body, hashlib.sha256).hexdigest() if signed else "fake"
        return APIClient().post(WEBHOOK, body, content_type="application/json", HTTP_X_HUB_SIGNATURE_256=signature)

    def test_new_store_and_branch_are_disconnected_and_platform_sender_is_retired(self):
        self.assertEqual(StoreConnection.objects.count(), 4)
        branch = StoreConnection.objects.get(pk="KUN-WEST")
        self.assertEqual(branch.tenant_id, "KUN")
        self.assertEqual(branch.status, "disconnected")
        self.assertFalse(branch.auto_send_enabled)
        self.assertIsNone(branch.phone_number_id)
        with patch.dict("os.environ", {"META_WHATSAPP_BILL_ENABLED": "true", "META_WHATSAPP_PHONE_NUMBER_ID": "999"}):
            response = self.client.post("/api/cloud/whatsapp-bill/", {"storeId": "KUN"}, format="json")
        self.assertEqual(response.status_code, 410)

    @patch("apps.whatsapp.delivery.decrypt_token", side_effect=lambda row: f"token-{row.store_id}")
    @patch("apps.whatsapp.delivery.graph")
    def test_three_authenticated_stores_use_independent_senders_and_saved_recipients(self, graph, _decrypt):
        entries = [(self.kun, "KUN", "101", "201", "9876543210", "919876543210"),
                   (self.hyd, "HYD", "102", "202", "+1 (415) 555-2671", "14155552671"),
                   (self.abc, "ABC", "103", "203", "+44 7400 123456", "447400123456")]
        # Use Meta's response only in the worker. The POS API commits first.
        sent = {}

        def send(path, *, token, payload):
            sent[path] = (token, payload)
            return {"messages": [{"id": f"wamid.{path.split('/')[0]}"}]}

        graph.side_effect = send
        for user, store_id, phone, waba, mobile, _ in entries:
            self.connect(store_id, phone=phone, waba=waba)
            if store_id == "KUN":
                self.client.force_authenticate(None)
                login = self.client.post("/api/cloud/auth/login/", {"email": user.email, "password": "SyntheticPass123"}, format="json")
                self.assertEqual(login.status_code, 200, login.data)
                self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
            else:
                self.client.credentials()
                self.client.force_authenticate(user)
            response = self.save_bill(self.bill(store_id, mobile=mobile, storeName="Untrusted display name"))
            self.assertEqual(response.status_code, 200, response.data)
        graph.assert_not_called()
        self.assertEqual(Receipt.objects.filter(status="queued").count(), 3)
        deliver_pending()
        deliver_pending()
        self.assertEqual(graph.call_count, 3)
        self.assertEqual(DeliveryAttempt.objects.filter(status="accepted").count(), 3)
        for _, store_id, phone, _, _, expected in entries:
            token, payload = sent[f"{phone}/messages"]
            params = payload["template"]["components"][0]["parameters"]
            self.assertEqual(token, f"token-{store_id}")
            self.assertEqual(payload["to"], expected)
            self.assertEqual(params[0]["text"], next(store["name"] for store in DIRECTORY if store["id"] == store_id))
            self.assertEqual(params[2]["text"], "₹70.00")
            url = urlsplit(params[3]["text"])
            public = APIClient().get(f"{url.path}?{url.query}")
            self.assertContains(public, "Rice &lt;250g&gt;")
            self.assertNotContains(public, "Test customer")
            self.assertEqual(public.headers["Cache-Control"], "private, no-store")
        Receipt.objects.update(link_expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(APIClient().get(f"/receipts/whatsapp/?key={Receipt.objects.first().public_token}").status_code, 404)

    def test_billing_requires_consent_actual_completed_bill_valid_number_and_connected_store(self):
        self.connect()
        with patch.dict("os.environ", {"META_WHATSAPP_BILL_ENABLED": "true", "META_WHATSAPP_PHONE_NUMBER_ID": "999"}):
            bills = [self.bill(opt_in=False), self.bill(opt_in="true"), self.bill(mobile="0000000000"),
                     self.bill(id="TRAIN-1", training=True), self.bill(completedAt=""), self.bill(mobile=""),
                     self.bill("ABC"), self.bill("KUN-WEST")]
            result = self.save_state("vestora-sales-ledger", bills)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(SharedAppState.objects.get(pk="vestora-sales-ledger").state_value, bills)
        self.assertFalse(Receipt.objects.exists())

    def test_checkout_replay_conflict_and_later_ledger_edits_do_not_send_twice(self):
        self.connect()
        self.client.force_authenticate(self.cashier)
        shop_bill = self.bill()
        operation = uuid.uuid4()
        first = self.save_bill(shop_bill)
        before_edit = first.data["updated_at"]
        self.assertEqual(first.status_code, 200)
        edited = {**shop_bill, "customerMobile": "9123456789"}
        with patch("apps.core.cloud_views.timezone.now", return_value=parse_datetime(before_edit)):
            change = self.save_state("vestora-sales-ledger", [edited], mutation_id=operation, version=before_edit)
        replay = self.save_state("vestora-sales-ledger", [edited], mutation_id=operation, version=before_edit)
        conflict = self.save_state("vestora-sales-ledger", [edited, self.bill()], version=before_edit)
        self.assertEqual(change.status_code, 200)
        self.assertEqual(replay.data, change.data)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(Receipt.objects.count(), 1)
        receipt = Receipt.objects.get()
        self.assertEqual(receipt.recipient, "+919876543210")
        self.assertEqual(receipt.consent_recorded_by, self.cashier)

    @patch("apps.whatsapp.cloud.enqueue_new_sales", side_effect=ValueError("unavailable"))
    def test_outbox_error_does_not_interrupt_saved_bill(self, mocked):
        with self.assertLogs("apps.whatsapp.cloud", "ERROR"):
            result = self.save_bill(self.bill())
        self.assertEqual(result.status_code, 200)
        self.assertTrue(SharedAppState.objects.filter(pk="vestora-sales-ledger").exists())

    def test_store_scope_applies_to_connections_history_resend_and_ledger(self):
        self.connect("HYD")
        self.save_bill(self.bill("HYD"))
        receipt = Receipt.objects.get()
        self.client.force_authenticate(self.kun)
        for path in ("", "history/", "templates/"):
            self.assertEqual(self.client.get(f"/api/cloud/whatsapp/HYD/{path}").status_code, 403)
        self.assertEqual(self.client.post(f"/api/cloud/whatsapp/KUN/history/{receipt.pk}/resend/", {}, format="json").status_code, 404)
        self.assertEqual(self.save_bill(self.bill("HYD")).status_code, 403)
        self.assertEqual(self.client.post("/api/cloud/staff-account/", {
            "action": "update", "email": self.hyd.email, "storeId": "KUN", "name": "Other admin", "password": "Other12345",
        }, format="json").status_code, 403)
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.client.get("/api/cloud/whatsapp/KUN/").status_code, 403)
        self.client.force_authenticate(User.objects.create_user("unassigned", user_type="restaurant_admin"))
        self.assertEqual(self.client.get("/api/cloud/whatsapp/KUN-WEST/").status_code, 403)

    @patch("apps.whatsapp.delivery.decrypt_token", return_value="authorized-token")
    @patch("apps.whatsapp.delivery.graph")
    def test_throttling_failure_retry_and_ambiguous_send(self, graph, _decrypt):
        self.connect()
        self.save_bill(self.bill())
        graph.side_effect = MetaError("rate limited", code="130429", http_status=429)
        deliver_pending()
        receipt = Receipt.objects.get()
        self.assertEqual(receipt.status, "queued")
        self.assertGreater(receipt.next_attempt_at, timezone.now())
        self.assertEqual(receipt.attempts.get().error_code, "130429")
        Receipt.objects.update(next_attempt_at=timezone.now() - timedelta(seconds=1))
        graph.side_effect = MetaError("transport outcome unknown")
        deliver_pending()
        deliver_pending()
        self.assertEqual(graph.call_count, 2)
        receipt.refresh_from_db()
        self.assertEqual(receipt.status, "uncertain")
        url = f"/api/cloud/whatsapp/KUN/history/{receipt.pk}/resend/"
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 400)
        self.assertEqual(self.post_status("201", "101", "failed", callback_data=receipt.attempts.first().pk, code=131026).status_code, 200)
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 202)
        graph.side_effect = None
        graph.return_value = {"messages": [{"id": "wamid.retry"}]}
        deliver_pending()
        receipt.refresh_from_db()
        self.assertEqual(receipt.status, "accepted")
        self.assertEqual(receipt.attempts.count(), 3)
        self.assertEqual(SharedAppState.objects.get(pk="vestora-sales-ledger").state_value[0]["total"], 70)

    @patch("apps.whatsapp.delivery.decrypt_token", return_value="authorized-token")
    @patch("apps.whatsapp.delivery.graph")
    def test_signed_webhooks_match_sender_and_do_not_regress_early_delivery(self, graph, _decrypt):
        self.connect()
        self.save_bill(self.bill())

        def send(_path, *, token, payload):
            self.assertEqual(self.post_status("201", "101", "delivered", callback_data=payload["biz_opaque_callback_data"]).status_code, 200)
            return {"messages": [{"id": "wamid.test"}]}

        graph.side_effect = send
        deliver_pending()
        self.assertEqual(Receipt.objects.get().status, "delivered")
        self.assertEqual(self.post_status("201", "101", "read", signed=False).status_code, 403)
        self.post_status("202", "101", "read")  # correct phone, wrong WABA
        self.post_status("201", "102", "read")  # correct WABA, wrong phone
        self.post_status("201", "101", "sent")
        self.assertEqual(Receipt.objects.get().status, "delivered")
        self.post_status("201", "101", "read")
        self.post_status("201", "101", "failed", code=131026)
        self.assertEqual(Receipt.objects.get().status, "read")
        history = self.client.get("/api/cloud/whatsapp/KUN/history/").data["messages"][0]
        self.assertEqual(history["recipient"], "••••3210")
        self.assertEqual(history["metaMessageId"], "wamid.test")
        self.assertEqual(history["status"], "read")

    def test_meta_subscribe_verification_and_international_phone(self):
        response = APIClient().get(WEBHOOK, {"hub.mode": "subscribe", "hub.verify_token": "webhook-test-verify", "hub.challenge": "389054"})
        self.assertEqual(response.content, b"389054")
        self.assertEqual(APIClient().get(WEBHOOK, {"hub.mode": "subscribe", "hub.verify_token": "bad", "hub.challenge": "389054"}).status_code, 403)
        self.assertEqual(normalize_phone("+1 (415) 555-2671"), "+14155552671")
        self.assertEqual(normalize_phone("9876543210"), "+919876543210")
        self.assertEqual(normalize_phone("919876543210"), "")

    def test_configured_spa_preserves_the_meta_popups_opener(self):
        with (patch("config.spa.FRONTEND_DIST", Path(__file__).parent),
              patch("config.spa.Path.is_file", return_value=True),
              patch("config.spa.Path.open", return_value=BytesIO(b"UVPRO"))):
            response = APIClient().get("/")
            self.assertEqual(response.headers["Cross-Origin-Opener-Policy"], "same-origin-allow-popups")
            response.close()

    @patch("apps.whatsapp.delivery.graph")
    def test_disconnect_cancels_existing_jobs_and_preserves_billing_and_history(self, graph):
        self.connect()
        self.save_bill(self.bill())
        response = self.client.post("/api/cloud/whatsapp/KUN/disconnect/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "disconnected")
        self.assertFalse(StoreConnection.objects.get(pk="KUN").encrypted_credentials)
        self.connect(phone="150", waba="250")
        deliver_pending()
        graph.assert_not_called()
        self.assertEqual(Receipt.objects.get().status, "cancelled")
        self.assertEqual(self.client.get("/api/cloud/whatsapp/KUN/history/").data["messages"][0]["status"], "cancelled")

    @patch("apps.whatsapp.views.decrypt_token", return_value="authorized-token")
    @patch("apps.whatsapp.messages.graph_list")
    def test_template_is_utility_approved_and_retrieved_from_the_connected_waba(self, graph_list, _decrypt):
        self.connect(auto=False)
        graph_list.return_value = iter([TEMPLATE_META, {**TEMPLATE_META, "name": "promo", "category": "MARKETING"},
                                        {**TEMPLATE_META, "name": "waiting", "status": "PENDING"}])
        result = self.client.get("/api/cloud/whatsapp/KUN/templates/")
        self.assertEqual(result.data, [TEMPLATE])
        self.assertEqual(graph_list.call_args.args, ("201/message_templates", "authorized-token"))
        graph_list.return_value = iter([TEMPLATE_META])
        result = self.client.patch("/api/cloud/whatsapp/KUN/", {"templateName": "promo", "templateLanguage": "en", "autoSend": True}, format="json")
        self.assertEqual(result.status_code, 400)
        graph_list.return_value = iter([TEMPLATE_META])
        result = self.client.patch("/api/cloud/whatsapp/KUN/", {"templateName": "digital_receipt", "templateLanguage": "en", "autoSend": True}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertTrue(StoreConnection.objects.get(pk="KUN").auto_send_enabled)

    @patch("apps.whatsapp.views.graph", return_value={"success": True})
    @patch("apps.whatsapp.views.encrypt_token", return_value="kms-ciphertext")
    @patch("apps.whatsapp.views.sender_details", return_value={"meta_business_id": "301", "meta_business_name": "Kunnil's Meta account",
                                                              "registered_phone_number": "+91 90000 12345", "approved_display_name": "Kunnil", "action_required": ""})
    @patch("apps.whatsapp.views.exchange_signup_code", return_value=("authorized-meta-token", None))
    def test_signup_is_store_bound_one_use_and_saves_only_ciphertext(self, exchange, details, encrypt, subscribe):
        self.client.force_authenticate(self.kun)
        session = self.client.post("/api/cloud/whatsapp/KUN/signup/", {}, format="json").data["sessionId"]
        data = {"sessionId": session, "code": "meta-code", "businessId": "301", "wabaId": "201", "phoneId": "101"}
        self.client.force_authenticate(self.hyd)
        self.assertEqual(self.client.post("/api/cloud/whatsapp/HYD/signup/complete/", data, format="json").status_code, 400)
        exchange.assert_not_called()
        self.client.force_authenticate(self.kun)
        result = self.client.post("/api/cloud/whatsapp/KUN/signup/complete/", data, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertNotIn("authorized-meta-token", result.content.decode())
        self.assertEqual(result.data["displayName"], "Kunnil")
        stored = StoreConnection.objects.get(pk="KUN")
        self.assertEqual(stored.encrypted_credentials, "kms-ciphertext")
        self.assertFalse(stored.auto_send_enabled)
        self.assertEqual(encrypt.call_args.args[0].generation, stored.generation)
        self.assertEqual(subscribe.call_args.args[0], "201/subscribed_apps")
        self.assertEqual(self.client.post("/api/cloud/whatsapp/KUN/signup/complete/", data, format="json").status_code, 400)
        self.client.force_authenticate(self.hyd)
        data["sessionId"] = self.client.post("/api/cloud/whatsapp/HYD/signup/", {}, format="json").data["sessionId"]
        self.assertEqual(self.client.post("/api/cloud/whatsapp/HYD/signup/complete/", data, format="json").status_code, 409)

    @patch("apps.whatsapp.meta.graph")
    def test_oauth_permissions_and_phone_ownership_are_verified_server_side(self, graph):
        graph.side_effect = [{"access_token": "token"}, {"data": {"is_valid": True, "app_id": "12345",
                            "scopes": ["whatsapp_business_management", "whatsapp_business_messaging"],
                            "granular_scopes": [{"scope": "whatsapp_business_management", "target_ids": ["202"]}]}}]
        with self.assertRaises(MetaError):
            exchange_signup_code("sample-code", "201")
        graph.side_effect = [{"id": "201", "owner_business_info": {"id": "301", "name": "Actual business"}},
                             {"data": [{"id": "102", "verified_name": "Another number"}]}]
        with self.assertRaises(MetaError):
            sender_details("token", "201", "101", "301")
        graph.side_effect = [{"id": "201", "owner_business_info": {"id": "301", "name": "Actual business"}},
                             {"data": [{"id": "101", "verified_name": "Approved real name", "display_phone_number": "+91 90000 12345", "status": "CONNECTED"}]},
                             {"name_status": "APPROVED"}]
        self.assertEqual(sender_details("token", "201", "101", "301")["approved_display_name"], "Approved real name")

    def test_kms_encrypt_and_decrypt_bind_credentials_to_tenant_store_and_sender(self):
        connection = self.connect()
        kms = boto3.client("kms", region_name="ap-south-1", aws_access_key_id="local", aws_secret_access_key="local")
        context = credential_context(connection)
        self.assertEqual(context, {"purpose": "uvpro-whatsapp-sender", "tenant": "KUN", "store": "KUN", "waba": "201",
                                   "phone": "101", "generation": str(connection.generation)})
        with Stubber(kms) as stub, patch("apps.whatsapp.meta.kms_client", return_value=kms):
            stub.add_response("encrypt", {"CiphertextBlob": b"encrypted", "KeyId": KMS_KEY},
                              {"Plaintext": b"meta-token", "KeyId": KMS_KEY, "EncryptionContext": context})
            connection.encrypted_credentials = encrypt_token(connection, "meta-token")
            stub.add_response("decrypt", {"Plaintext": b"meta-token", "KeyId": KMS_KEY},
                              {"CiphertextBlob": b"encrypted", "KeyId": KMS_KEY, "EncryptionContext": context})
            self.assertEqual(decrypt_token(connection), "meta-token")
            other = self.connect("HYD", phone="102", waba="202")
            other.encrypted_credentials = connection.encrypted_credentials
            stub.add_client_error("decrypt", service_error_code="InvalidCiphertextException", expected_params={
                "CiphertextBlob": b"encrypted", "KeyId": KMS_KEY, "EncryptionContext": credential_context(other),
            })
            with self.assertRaises(MetaError):
                decrypt_token(other)
            stub.assert_no_pending_responses()

    def test_test_message_requires_consent_and_never_creates_a_sale(self):
        self.connect(auto=False)
        url = "/api/cloud/whatsapp/KUN/test/"
        self.assertEqual(self.client.post(url, {"recipient": "9876543210"}, format="json").status_code, 400)
        result = self.client.post(url, {"recipient": "9876543210", "optIn": True}, format="json")
        self.assertEqual(result.status_code, 202)
        self.assertEqual(Receipt.objects.get().bill_id, "")
        self.assertFalse(SharedAppState.objects.filter(pk="vestora-sales-ledger").exists())

    def test_migration_archives_legacy_settings_without_enabling_a_sender(self):
        legacy_value = {"enabled": True, "sendWhen": "print", "token": "legacy-configured-secret"}
        SharedAppState.objects.create(pk="vestora-whatsapp-receipts-KUN", state_value=legacy_value)
        SharedAppState.objects.create(pk="vestora-active-settings-KUN", state_value={
            "WhatsApp templates": {"billTemplate": "Old template", "sender": "+1 555 0100"},
        })
        archive = importlib.import_module("apps.whatsapp.migrations.0002_archive_legacy_settings")
        archive.archive_and_prepare(apps, SimpleNamespace(connection=database))
        backup = SharedAppState.objects.get(pk="uvpro-archive-whatsapp-settings-v1").state_value
        self.assertEqual(backup["vestora-whatsapp-receipts-KUN"], {"enabled": True, "sendWhen": "print"})
        self.assertEqual(SharedAppState.objects.get(pk="vestora-whatsapp-receipts-KUN").state_value, legacy_value)
        self.assertEqual(StoreConnection.objects.get(pk="KUN").status, "disconnected")

    def test_predecessor_message_history_respects_store_scope(self):
        try:
            predecessor = apps.get_model("core", "WhatsAppBillDispatch")
        except LookupError:
            self.assertEqual(self.client.get("/api/cloud/whatsapp/KUN/history/").data["legacyMessages"], [])
            return
        predecessor.objects.create(store_id="KUN", bill_id="OLD-KUN", status="sent", message_id="wamid.kunnil-old")
        predecessor.objects.create(store_id="HYD", bill_id="OLD-HYD", status="sent", message_id="wamid.hydis-old")
        self.client.force_authenticate(self.kun)
        legacy = self.client.get("/api/cloud/whatsapp/KUN/history/").data["legacyMessages"]
        self.assertEqual([row["invoice"] for row in legacy], ["OLD-KUN"])
