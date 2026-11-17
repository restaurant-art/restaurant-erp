import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.cloud_views import _state_store
from apps.core.models import SharedAppState, User


class PurchaseDraftAccessTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(username="draft-admin", email="draft@example.test", user_type="restaurant_admin")
        SharedAppState.objects.create(state_key="vestora-stores", state_value=[{"id": "STORE-A"}, {"id": "STORE-B"}])
        SharedAppState.objects.create(state_key="vestora-users", state_value=[{"email": user.email, "storeId": "STORE-A", "status": "Active"}])
        self.client = APIClient()
        self.client.force_authenticate(user)

    def test_draft_can_be_saved_and_reloaded_in_assigned_store(self):
        key = "vestora-purchase-drafts-STORE-A"
        self.assertEqual(_state_store(key), "STORE-A")
        value = [{"id": "draft-1", "status": "Draft", "entry": {"invoice": "INV-1", "lines": []}}]
        saved = self.client.put("/api/cloud/state/", {"key": key, "value": value, "expectedUpdatedAt": None, "mutationId": str(uuid.uuid4())}, format="json")
        self.assertEqual(saved.status_code, 200, saved.data)
        read = self.client.get("/api/cloud/state/", {"key": key})
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read.data[0]["state_value"], value)

    def test_purchase_order_can_be_saved_and_reloaded_in_assigned_store(self):
        key = "vestora-purchase-orders-STORE-A"
        self.assertEqual(_state_store(key), "STORE-A")
        value = [{"id": "order-1", "poNumber": "PO-20261017-001", "status": "Draft", "lines": []}]
        saved = self.client.put("/api/cloud/state/", {"key": key, "value": value, "expectedUpdatedAt": None, "mutationId": str(uuid.uuid4())}, format="json")
        self.assertEqual(saved.status_code, 200, saved.data)
        read = self.client.get("/api/cloud/state/", {"key": key})
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read.data[0]["state_value"], value)

    def test_grn_register_and_print_settings_sync_in_assigned_store(self):
        for key, value in (
            ("vestora-grn-register-STORE-A", [{"id": "grn-1", "grnNo": "GRN-2026-00001", "supplierName": "Fresh Supplies"}]),
            ("vestora-grn-template-STORE-A", {"companyName": "The Market", "showLogo": True}),
        ):
            saved = self.client.put("/api/cloud/state/", {"key": key, "value": value, "expectedUpdatedAt": None, "mutationId": str(uuid.uuid4())}, format="json")
            self.assertEqual(saved.status_code, 200, saved.data)
            read = self.client.get("/api/cloud/state/", {"key": key})
            self.assertEqual(read.status_code, 200)
            self.assertEqual(read.data[0]["state_value"], value)

    def test_numeric_store_grn_key_is_accepted_by_cloud_state(self):
        admin = User.objects.create_user(username="grn-platform-admin", email="grn-admin@example.test", user_type="super_admin", is_superuser=True)
        self.client.force_authenticate(admin)
        key = "vestora-grn-register-1"
        self.assertEqual(_state_store(key), "1")
        value = [{"id": "grn-1", "grnNo": "GRN-2026-00001"}]
        saved = self.client.put("/api/cloud/state/", {"key": key, "value": value, "expectedUpdatedAt": None, "mutationId": str(uuid.uuid4())}, format="json")
        self.assertEqual(saved.status_code, 200, saved.data)
        read = self.client.get("/api/cloud/state/", {"key": key})
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read.data[0]["state_value"], value)

    def test_numeric_store_pos_draft_saves_and_reloads_for_assigned_user(self):
        user = User.objects.create_user(username="pos-draft-user", email="pos-draft@example.test", user_type="cashier")
        SharedAppState.objects.filter(state_key="vestora-stores").update(state_value=[{"id": "1"}, {"id": "2"}])
        SharedAppState.objects.filter(state_key="vestora-users").update(state_value=[{"email": user.email, "storeId": "1", "status": "Active"}])
        self.client.force_authenticate(user)
        key = "vestora-pos-drafts-1"
        value = {"cashier-1": {"active": {"items": [{"id": "rice", "qty": 1}]}, "held": []}}
        self.assertEqual(_state_store(key), "1")
        saved = self.client.put("/api/cloud/state/", {"key": key, "value": value, "expectedUpdatedAt": None, "mutationId": str(uuid.uuid4())}, format="json")
        self.assertEqual(saved.status_code, 200, saved.data)
        read = self.client.get("/api/cloud/state/", {"key": key})
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read.data[0]["state_value"], value)
        other_key = "vestora-pos-drafts-2"
        denied = self.client.put("/api/cloud/state/", {"key": other_key, "value": value, "expectedUpdatedAt": None, "mutationId": str(uuid.uuid4())}, format="json")
        self.assertEqual(denied.status_code, 403)
        self.assertFalse(SharedAppState.objects.filter(state_key=other_key).exists())

    def test_grn_data_cannot_be_read_or_written_for_an_unassigned_store(self):
        key = "vestora-grn-register-STORE-B"
        self.assertEqual(self.client.get("/api/cloud/state/", {"key": key}).status_code, 403)
        saved = self.client.put("/api/cloud/state/", {"key": key, "value": [], "expectedUpdatedAt": None, "mutationId": str(uuid.uuid4())}, format="json")
        self.assertEqual(saved.status_code, 403)
        self.assertFalse(SharedAppState.objects.filter(state_key=key).exists())

    def test_other_store_drafts_remain_inaccessible(self):
        key = "vestora-purchase-drafts-STORE-B"
        self.assertEqual(self.client.get("/api/cloud/state/", {"key": key}).status_code, 403)
        saved = self.client.put("/api/cloud/state/", {"key": key, "value": [], "expectedUpdatedAt": None, "mutationId": str(uuid.uuid4())}, format="json")
        self.assertEqual(saved.status_code, 403)
        self.assertFalse(SharedAppState.objects.filter(state_key=key).exists())
