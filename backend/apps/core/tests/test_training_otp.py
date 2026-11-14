import json
import os
from io import BytesIO
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import SharedAppState, TrainingOtpChallenge, User
from apps.core.training_otp import send_whatsapp_otp


META_CONFIG = {
    "META_WHATSAPP_ACCESS_TOKEN": "test-token",
    "META_WHATSAPP_PHONE_NUMBER_ID": "123456",
    "META_WHATSAPP_OTP_TEMPLATE_NAME": "training_login_code",
    "META_WHATSAPP_API_VERSION": "v23.0",
}


class TrainingOtpTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="owner", email="owner@example.test", user_type="super_admin", is_superuser=True)
        User.objects.create_user(username="cashier", email="cashier@example.test", user_type="cashier", is_active=True)
        SharedAppState.objects.create(state_key="vestora-stores", state_value=[{"id": "store-1"}])
        SharedAppState.objects.create(state_key="vestora-users", state_value=[
            {"id": "cashier-1", "name": "Trainee", "email": "cashier@example.test", "mobile": "+91 98765 43210", "storeId": "store-1", "status": "Active"},
        ])
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.body = {"email": "cashier@example.test", "storeId": "store-1"}

    @patch.dict(os.environ, META_CONFIG)
    @patch("apps.core.training_otp.send_whatsapp_otp")
    def test_request_and_single_use_verification(self, send):
        response = self.client.post("/api/cloud/training-otp/request/", self.body, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(send.call_args.args[0], "919876543210")
        self.assertNotIn("code", response.data)
        code = send.call_args.args[1]
        self.assertEqual(len(code), 6)
        challenge = TrainingOtpChallenge.objects.get()
        self.assertNotEqual(challenge.code_digest, code)
        verify = {**self.body, "challengeId": response.data["challengeId"], "code": code}
        accepted = self.client.post("/api/cloud/training-otp/verify/", verify, format="json")
        self.assertEqual(accepted.status_code, 200, accepted.data)
        self.assertEqual(accepted.data["cashier"]["id"], "cashier-1")
        self.assertEqual(self.client.post("/api/cloud/training-otp/verify/", verify, format="json").status_code, 403)

    @patch.dict(os.environ, META_CONFIG)
    @patch("apps.core.training_otp.send_whatsapp_otp")
    def test_wrong_code_expires_after_five_attempts_and_resend_is_throttled(self, send):
        response = self.client.post("/api/cloud/training-otp/request/", self.body, format="json")
        code = send.call_args.args[1]
        wrong = "000000" if code != "000000" else "111111"
        verify = {**self.body, "challengeId": response.data["challengeId"], "code": wrong}
        for _ in range(5):
            self.assertEqual(self.client.post("/api/cloud/training-otp/verify/", verify, format="json").status_code, 403)
        verify["code"] = code
        self.assertEqual(self.client.post("/api/cloud/training-otp/verify/", verify, format="json").status_code, 403)
        self.assertEqual(self.client.post("/api/cloud/training-otp/request/", self.body, format="json").status_code, 429)
        self.assertEqual(self.client.post("/api/cloud/training-otp/verify/", {**verify, "challengeId": "bad-id"}, format="json").status_code, 403)

    @patch.dict(os.environ, META_CONFIG)
    @patch("apps.core.training_otp.send_whatsapp_otp")
    def test_wrong_store_cannot_receive_or_use_code(self, send):
        self.assertEqual(self.client.post("/api/cloud/training-otp/request/", {**self.body, "storeId": "other"}, format="json").status_code, 403)
        self.assertFalse(send.called)
        response = self.client.post("/api/cloud/training-otp/request/", self.body, format="json")
        verify = {**self.body, "challengeId": response.data["challengeId"], "code": send.call_args.args[1], "storeId": "other"}
        self.assertEqual(self.client.post("/api/cloud/training-otp/verify/", verify, format="json").status_code, 403)

    @patch.dict(os.environ, {key: "" for key in META_CONFIG})
    def test_unconfigured_provider_fails_closed(self):
        response = self.client.post("/api/cloud/training-otp/request/", self.body, format="json")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(TrainingOtpChallenge.objects.exists())

    @patch.dict(os.environ, META_CONFIG)
    @patch("apps.core.training_otp.send_whatsapp_otp")
    def test_requires_authentication_and_saved_mobile(self, send):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.post("/api/cloud/training-otp/request/", self.body, format="json").status_code, 401)
        self.client.force_authenticate(self.user)
        staff = SharedAppState.objects.get(state_key="vestora-users")
        staff.state_value = [{**staff.state_value[0], "mobile": ""}]
        staff.save(update_fields=("state_value",))
        self.assertEqual(self.client.post("/api/cloud/training-otp/request/", self.body, format="json").status_code, 400)
        self.assertFalse(send.called)

    @patch.dict(os.environ, META_CONFIG)
    @patch("apps.core.training_otp.send_whatsapp_otp", side_effect=OSError("network unavailable"))
    def test_delivery_failure_does_not_leave_valid_challenge(self, _send):
        response = self.client.post("/api/cloud/training-otp/request/", self.body, format="json")
        self.assertEqual(response.status_code, 502)
        self.assertFalse(TrainingOtpChallenge.objects.exists())

    @patch("apps.core.training_otp.urlopen")
    def test_meta_payload_uses_approved_template_code_and_copy_button(self, open_url):
        open_url.return_value.__enter__.return_value = BytesIO(b'{"messages":[{"id":"wamid.test"}]}')
        send_whatsapp_otp("919876543210", "123456", {
            "token": "secret", "phone_id": "987", "template": "training_login_code", "version": "v23.0", "language": "en_US",
        })
        request = open_url.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(request.full_url, "https://graph.facebook.com/v23.0/987/messages")
        self.assertEqual(payload["template"]["components"][0]["parameters"][0]["text"], "123456")
        self.assertEqual(payload["template"]["components"][1]["parameters"][0]["text"], "123456")
        self.assertEqual(payload["template"]["components"][1]["sub_type"], "url")
