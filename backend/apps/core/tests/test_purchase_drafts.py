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

    def test_other_store_drafts_remain_inaccessible(self):
        key = "vestora-purchase-drafts-STORE-B"
        self.assertEqual(self.client.get("/api/cloud/state/", {"key": key}).status_code, 403)
        saved = self.client.put("/api/cloud/state/", {"key": key, "value": [], "expectedUpdatedAt": None, "mutationId": str(uuid.uuid4())}, format="json")
        self.assertEqual(saved.status_code, 403)
        self.assertFalse(SharedAppState.objects.filter(state_key=key).exists())
