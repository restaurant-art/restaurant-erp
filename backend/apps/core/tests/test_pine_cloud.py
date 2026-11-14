import json
import os
from io import StringIO
from unittest.mock import patch

from django.test import TestCase
from django.core.management import call_command, CommandError
from rest_framework.test import APIClient

from apps.core.models import PineCloudPayment, PineBillPrintJob, SharedAppState, User

CONFIG = {"PINE_CLOUD_ENABLED": "true", "PINE_CLOUD_STORE_ID": "shop-1", "PINE_CLOUD_ENVIRONMENT": "uat",
          "PINE_CLOUD_MERCHANT_ID": "123", "PINE_CLOUD_SECURITY_TOKEN": "private-test-token",
          "PINE_CLOUD_CLIENT_ID": "456", "PINE_CLOUD_PINE_STORE_ID": "789"}


def approval(amount="1500", **changes):
    tags = {"PaymentMode": "UPISALE", "AmountInPaisa": amount, "Amount": "15.00", "FinalAmount": amount,
            "RRN": "123456789012", "ApprovalCode": "000095", "CurrencyMinorUnit": "2", "CustomerVPA": "private@bank"}
    tags.update(changes)
    return {"ResponseCode": 0, "PlutusTransactionReferenceID": 991,
            "TransactionData": [{"Tag": k, "Value": v} for k, v in tags.items()]}


@patch.dict(os.environ, CONFIG)
class PineCloudTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="pine-admin", email="pine@example.test", user_type="super_admin")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.data = {"billId": "BILL-1", "paymentKey": "BILL-1:0", "method": "UPI", "amountPaise": 1500, "training": False}
        self.base = "/api/cloud/pine-labs/shop-1/"

    def call(self, action="pay", data=None):
        return self.client.post(self.base + f"payment/{action}/", data or self.data, format="json")

    def uploaded(self):
        with patch("apps.core.pine_cloud.provider_call", return_value={"ResponseCode": 0, "PlutusTransactionReferenceID": 991}):
            return self.call()

    def saved_bill(self):
        SharedAppState.objects.update_or_create(state_key="vestora-sales-ledger", defaults={"state_value": [{
            "id": "BILL-1", "storeId": "shop-1", "pineLabsTransport": "cloud", "payment": "UPI", "paidAmount": 15}]})

    def test_setup_returns_no_credentials_and_sends_nothing(self):
        with patch("apps.core.pine_cloud.provider_call") as send:
            response = self.client.get(self.base + "connection/")
        self.assertTrue(response.data["ready"])
        self.assertNotIn("private-test-token", json.dumps(response.data))
        self.assertFalse(send.called)

    def test_disabled_or_wrong_store_never_calls_provider(self):
        with patch.dict(os.environ, {"PINE_CLOUD_ENABLED": "false"}), patch("apps.core.pine_cloud.provider_call") as send:
            self.assertEqual(self.call().status_code, 503)
            self.assertFalse(send.called)
        with patch.dict(os.environ, {"PINE_CLOUD_STORE_ID": "another"}), patch("apps.core.pine_cloud.provider_call") as send:
            self.assertEqual(self.call().status_code, 503)
            self.assertFalse(send.called)

    def test_authentication_branch_and_billing_role_are_required(self):
        self.assertIn(APIClient().get(self.base + "connection/").status_code, (401, 403))
        other = User.objects.create_user(username="other", user_type="cashier")
        self.client.force_authenticate(other)
        with patch("apps.core.pine_cloud.provider_call") as send:
            self.assertEqual(self.call().status_code, 403)
            self.assertFalse(send.called)

    def test_training_bad_identity_bad_amounts_never_send(self):
        with patch("apps.core.pine_cloud.provider_call") as send:
            for change in ({"training": True}, {"training": None}, {"method": "Cash"}, {"amountPaise": True},
                           {"amountPaise": 15.2}, {"amountPaise": 0}, {"amountPaise": -1},
                           {"billId": "TRAIN-BILL-1"}, {"paymentKey": "OTHER:0"}):
                self.assertEqual(self.call(data={**self.data, **change}).status_code, 400, change)
            self.assertFalse(send.called)

    def test_journal_exists_before_upload_and_upload_is_not_payment(self):
        def upload(action, payload, cfg):
            row = PineCloudPayment.objects.get()
            self.assertEqual(row.status, "uploading")
            self.assertEqual(action, "upload")
            self.assertEqual(payload["AllowedPaymentMode"], "10")
            self.assertEqual(payload["Amount"], 1500)
            self.assertEqual(payload["TransactionNumber"], row.id.hex)
            return {"ResponseCode": 0, "PlutusTransactionReferenceID": 991}
        with patch("apps.core.pine_cloud.provider_call", side_effect=upload):
            response = self.call()
        self.assertEqual(response.data["status"], "pending")
        self.assertEqual(PineCloudPayment.objects.get().receipt, {})

    def test_status_approval_redacts_raw_response_and_repeat_never_uploads(self):
        self.uploaded()
        with patch("apps.core.pine_cloud.provider_call", return_value=approval()) as send:
            result = self.call("recover")
            again = self.call("pay")
        self.assertEqual(result.data["status"], "approved")
        self.assertEqual(again.data["status"], "approved")
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.args[0], "status")
        self.assertIn("TransactionNumber", send.call_args.args[1])
        self.assertNotIn("private@bank", json.dumps(result.data))
        self.assertNotIn("CustomerVPA", json.dumps(PineCloudPayment.objects.get().receipt))
        self.assertIsNone(PineCloudPayment.objects.get().active_terminal)

    def test_unknown_upload_is_never_resent_and_blocks_other_bills(self):
        with patch("apps.core.pine_cloud.provider_call", side_effect=TimeoutError) as send:
            self.assertEqual(self.call().data["status"], "unknown")
            self.assertEqual(self.call("recover").data["status"], "unknown")
            self.assertEqual(self.call().data["status"], "unknown")
            self.assertEqual(self.call(data={**self.data, "billId": "BILL-2", "paymentKey": "BILL-2:0"}).status_code, 409)
            self.assertEqual(send.call_count, 1)

    def test_recovery_before_start_does_not_upload(self):
        with patch("apps.core.pine_cloud.provider_call") as send:
            self.assertEqual(self.call("recover").data["status"], "not_started")
            self.assertFalse(send.called)

    def test_changed_amount_or_terminal_cannot_reuse_intent(self):
        self.uploaded()
        with patch("apps.core.pine_cloud.provider_call") as send:
            self.assertEqual(self.call(data={**self.data, "amountPaise": 2000}).status_code, 409)
            with patch.dict(os.environ, {"PINE_CLOUD_CLIENT_ID": "999"}):
                self.assertEqual(self.call("recover").status_code, 409)
            self.assertFalse(send.called)

    def test_incomplete_wrong_or_conflicting_approvals_do_not_complete(self):
        self.uploaded()
        cases = [approval("1499"), approval(Amount="1500"), approval(RRN=""), approval(ApprovalCode=""),
                 approval(PaymentMode="CARD"), approval(CurrencyMinorUnit="3"),
                 {**approval(), "PlutusTransactionReferenceID": 222}, {**approval(), "ResponseCode": 1001},
                 {"ResponseCode": 0, "PlutusTransactionReferenceID": 991}]
        conflict = approval()
        conflict["TransactionData"].append({"Tag": "AmountInPaisa", "Value": "2000"})
        cases.append(conflict)
        for body in cases:
            with patch("apps.core.pine_cloud.provider_call", return_value=body):
                self.assertEqual(self.call("recover").data["status"], "pending")
        self.assertIsNotNone(PineCloudPayment.objects.get().active_terminal)

    def test_print_claim_requires_saved_bill_and_server_approval(self):
        self.uploaded()
        claim = {"action": "claim", "billId": "BILL-1"}
        self.assertEqual(self.client.post(self.base + "print/", claim, format="json").status_code, 400)
        self.saved_bill()
        self.assertEqual(self.client.post(self.base + "print/", claim, format="json").status_code, 400)
        with patch("apps.core.pine_cloud.provider_call", return_value=approval()):
            self.call("recover")
        first = self.client.post(self.base + "print/", claim, format="json")
        second = self.client.post(self.base + "print/", claim, format="json")
        self.assertTrue(first.data["claimed"])
        self.assertFalse(second.data["claimed"])
        result = {"action": "result", "billId": "BILL-1", "jobId": first.data["jobId"], "status": "unknown"}
        self.assertEqual(self.client.post(self.base + "print/", result, format="json").status_code, 200)
        self.assertFalse(self.client.post(self.base + "print/", claim, format="json").data["claimed"])
        self.assertEqual(PineBillPrintJob.objects.count(), 1)

    def test_forged_client_receipt_does_not_allow_print(self):
        self.saved_bill()
        state = SharedAppState.objects.get(state_key="vestora-sales-ledger")
        state.state_value[0]["terminalPayments"] = {"0": {"status": "approved", "amountPaise": 1500}}
        state.save()
        self.assertEqual(self.client.post(self.base + "print/", {"action": "claim", "billId": "BILL-1"}, format="json").status_code, 400)

    def test_saved_amount_mismatch_and_training_cannot_claim_a_real_payment(self):
        self.uploaded()
        with patch("apps.core.pine_cloud.provider_call", return_value=approval()):
            self.call("recover")
        self.saved_bill()
        state = SharedAppState.objects.get(state_key="vestora-sales-ledger")
        for change in ({"paidAmount": 150}, {"paidAmount": 15, "training": True}):
            state.state_value[0].update(change)
            state.save()
            response = self.client.post(self.base + "print/", {"action": "claim", "billId": "BILL-1"}, format="json")
            self.assertEqual(response.status_code, 400)

    def test_invalid_print_result_is_a_validation_error(self):
        response = self.client.post(self.base + "print/", {"action": "result", "billId": "BILL-1", "jobId": "invalid", "status": "submitted"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_recovery_command_only_queries_status_and_checks_original_number(self):
        with patch("apps.core.pine_cloud.provider_call", side_effect=TimeoutError):
            self.call()
        payment = PineCloudPayment.objects.get()
        with patch("apps.core.management.commands.recover_pine_cloud_payment.provider_call", return_value=approval()) as send:
            call_command("recover_pine_cloud_payment", str(payment.pk), provider_reference="991", stdout=StringIO())
        self.assertEqual(send.call_args.args[0], "status")
        self.assertEqual(send.call_args.args[1]["TransactionNumber"], payment.id.hex)
        payment.refresh_from_db()
        self.assertEqual(payment.status, "approved")
        self.assertEqual(payment.provider_reference, "991")

    def test_recovery_command_refuses_wrong_amount_or_pending_status(self):
        self.uploaded()
        payment = PineCloudPayment.objects.get()
        for body in (approval("100"), {"ResponseCode": 1001}):
            with patch("apps.core.management.commands.recover_pine_cloud_payment.provider_call", return_value=body), self.assertRaises(CommandError):
                call_command("recover_pine_cloud_payment", str(payment.pk), provider_reference="991", stdout=StringIO())
        payment.refresh_from_db()
        self.assertEqual(payment.status, "pending")
