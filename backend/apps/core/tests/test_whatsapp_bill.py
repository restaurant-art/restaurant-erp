import json
import os
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError
from uuid import uuid4

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import SharedAppState, User, WhatsAppBillDispatch
from apps.core.whatsapp_bill import _send


CONFIG = {
    "META_WHATSAPP_BILL_ENABLED": "true",
    "META_WHATSAPP_BILL_STORE_ID": "store-1",
    "META_WHATSAPP_ACCESS_TOKEN": "test-token",
    "META_WHATSAPP_PHONE_NUMBER_ID": "123456",
    "META_WHATSAPP_API_VERSION": "v23.0",
    "META_WHATSAPP_BILL_TEMPLATE_NAME": "uvpro_invoice_confirmation",
    "META_WHATSAPP_BILL_TEMPLATE_LANGUAGE": "en",
}


class WhatsAppBillTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="owner", email="owner@example.test", user_type="super_admin", is_superuser=True)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.bill = {
            "id": "BILL-1", "storeId": "store-1", "storeName": "Store", "orderNumber": "ORD-1",
            "customerMobile": "9876543210", "items": [{"name": "Rice", "qty": 1, "price": 98.6}],
            "subtotal": 98.6, "discount": 0, "tax": 4.7, "total": 98.6, "payment": "Cash",
        }
        SharedAppState.objects.create(state_key="vestora-sales-ledger", state_value=[self.bill])
        SharedAppState.objects.create(state_key="vestora-whatsapp-receipts-store-1", state_value={"enabled": True})
        self.request = {"storeId": "store-1", "billId": "BILL-1"}

    @patch.dict(os.environ, CONFIG)
    @patch("apps.core.whatsapp_bill._send", return_value="wamid.test")
    def test_saved_bill_is_sent_once_even_if_reprinted(self, send):
        first = self.client.post("/api/cloud/whatsapp-bill/", self.request, format="json")
        second = self.client.post("/api/cloud/whatsapp-bill/", self.request, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertTrue(second.data["alreadySent"])
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.args[0]["to"], "919876543210")
        self.assertEqual(WhatsAppBillDispatch.objects.get().status, "accepted")

    @patch.dict(os.environ, CONFIG)
    @patch("apps.core.whatsapp_bill._send", return_value="wamid.print-test")
    def test_print_timing_is_saved_and_sends_only_once_for_the_saved_bill(self, send):
        preference = SharedAppState.objects.get(state_key="vestora-whatsapp-receipts-store-1")
        ledger = SharedAppState.objects.get(state_key="vestora-sales-ledger")
        ledger.state_value = [{**self.bill, "customerName": "", "customerMobile": "9000012345"}]
        ledger.save(update_fields=("state_value",))
        SharedAppState.objects.create(state_key="vestora-customer-master-store-1", state_value=[
            {"name": "Other customer", "mobile": "9000067890"},
        ])
        response = self.client.put("/api/cloud/state/", {
            "key": preference.state_key,
            "value": {"enabled": True, "sendWhen": "print"},
            "expectedUpdatedAt": preference.updated_at.isoformat(),
            "mutationId": str(uuid4()),
        }, format="json")
        self.assertEqual(response.status_code, 200)
        preference.refresh_from_db()
        self.assertEqual(preference.state_value, {"enabled": True, "sendWhen": "print"})
        checkout = self.client.post("/api/cloud/whatsapp-bill/", self.request, format="json")
        self.assertEqual(checkout.status_code, 409)
        send.assert_not_called()

        print_request = {**self.request, "trigger": "print", "customerMobile": "9000067890"}
        first = self.client.post("/api/cloud/whatsapp-bill/", print_request, format="json")
        reprint = self.client.post("/api/cloud/whatsapp-bill/", print_request, format="json")
        self.assertEqual((first.status_code, reprint.status_code), (200, 200))
        self.assertTrue(reprint.data["alreadySent"])
        send.assert_called_once()
        payload = send.call_args.args[0]
        self.assertEqual(payload["to"], "919000012345")
        self.assertEqual(payload["template"]["name"], "uvpro_invoice_confirmation")
        self.assertEqual(payload["template"]["components"][0]["parameters"][1]["text"], "ORD-1")

    @patch.dict(os.environ, CONFIG)
    @patch("apps.core.whatsapp_bill._send")
    def test_unapproved_store_and_missing_bill_never_send(self, send):
        denied = self.client.post("/api/cloud/whatsapp-bill/", {"storeId": "other", "billId": "BILL-1"}, format="json")
        missing = self.client.post("/api/cloud/whatsapp-bill/", {**self.request, "billId": "missing"}, format="json")
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(missing.status_code, 404)
        self.assertFalse(send.called)

    @patch.dict(os.environ, CONFIG)
    @patch("apps.core.whatsapp_bill._send")
    def test_another_store_and_unauthenticated_user_cannot_send(self, send):
        anonymous = APIClient()
        self.assertIn(anonymous.post("/api/cloud/whatsapp-bill/", self.request, format="json").status_code, (401, 403))
        cashier = User.objects.create_user(username="other", email="other@example.test", user_type="cashier")
        self.client.force_authenticate(cashier)
        self.assertEqual(self.client.post("/api/cloud/whatsapp-bill/", self.request, format="json").status_code, 403)
        self.assertFalse(send.called)

    @patch.dict(os.environ, CONFIG)
    @patch("apps.core.whatsapp_bill._send")
    def test_training_bill_is_never_sent(self, send):
        row = SharedAppState.objects.get(state_key="vestora-sales-ledger")
        row.state_value = [{**self.bill, "training": True}]
        row.save(update_fields=("state_value",))
        self.assertEqual(self.client.post("/api/cloud/whatsapp-bill/", self.request, format="json").status_code, 404)
        self.assertFalse(send.called)

    @patch.dict(os.environ, CONFIG)
    @patch("apps.core.whatsapp_bill._send", side_effect=OSError("connection lost"))
    def test_uncertain_network_result_does_not_resend(self, send):
        self.assertEqual(self.client.post("/api/cloud/whatsapp-bill/", self.request, format="json").status_code, 502)
        self.assertEqual(self.client.post("/api/cloud/whatsapp-bill/", self.request, format="json").status_code, 409)
        self.assertEqual(send.call_count, 1)

    @patch.dict(os.environ, CONFIG)
    @patch("apps.core.whatsapp_bill._send")
    def test_rejected_request_can_be_retried(self, send):
        send.side_effect = [HTTPError("https://example.test", 400, "rejected", {}, None), "wamid.test"]
        self.assertEqual(self.client.post("/api/cloud/whatsapp-bill/", self.request, format="json").status_code, 502)
        self.assertEqual(self.client.post("/api/cloud/whatsapp-bill/", self.request, format="json").status_code, 200)
        self.assertEqual(send.call_count, 2)

    @patch.dict(os.environ, {**CONFIG, "META_WHATSAPP_BILL_ENABLED": "false"})
    @patch("apps.core.whatsapp_bill._send")
    def test_disabled_connection_never_sends(self, send):
        self.assertEqual(self.client.post("/api/cloud/whatsapp-bill/", self.request, format="json").status_code, 503)
        self.assertFalse(send.called)

    @patch.dict(os.environ, CONFIG)
    @patch("apps.core.whatsapp_bill._send")
    def test_branch_setting_disables_sending(self, send):
        SharedAppState.objects.filter(state_key="vestora-whatsapp-receipts-store-1").update(state_value={"enabled": False})
        self.assertEqual(self.client.post("/api/cloud/whatsapp-bill/", self.request, format="json").status_code, 403)
        self.assertFalse(send.called)

    @patch("apps.core.whatsapp_bill.urlopen")
    def test_meta_request_uses_configured_phone_and_template_payload(self, open_url):
        open_url.return_value.__enter__.return_value = BytesIO(b'{"messages":[{"id":"wamid.test"}]}')
        payload = {"messaging_product": "whatsapp", "to": "919876543210", "type": "template"}
        self.assertEqual(_send(payload, {"version": "v23.0", "phone_id": "123456", "token": "secret"}), "wamid.test")
        request = open_url.call_args.args[0]
        self.assertEqual(request.full_url, "https://graph.facebook.com/v23.0/123456/messages")
        self.assertEqual(json.loads(request.data), payload)
