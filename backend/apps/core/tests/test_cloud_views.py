import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import CloudState, PublicOrder, User


class CloudApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin", email="admin@example.test", password="StrongPass123!",
            user_type=User.UserType.SUPER_ADMIN, is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_email_login_returns_jwt_and_user(self):
        client = APIClient()
        response = client.post("/api/auth/token/", {"username": self.user.email, "password": "StrongPass123!"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["email"], self.user.email)

    def test_state_write_is_versioned_and_idempotent(self):
        mutation_id = str(uuid.uuid4())
        payload = {
            "key": "vestora-stores", "value": [{"id": "STORE-1", "name": "Main"}],
            "expectedUpdatedAt": None, "mutationId": mutation_id,
        }
        created = self.client.put("/api/cloud/state", payload, format="json")
        self.assertEqual(created.status_code, 200)
        replayed = self.client.put("/api/cloud/state", payload, format="json")
        self.assertEqual(replayed.status_code, 200)
        self.assertEqual(CloudState.objects.filter(state_key="vestora-stores").count(), 1)

        conflict = self.client.put("/api/cloud/state", {**payload, "value": [], "mutationId": str(uuid.uuid4())}, format="json")
        self.assertEqual(conflict.status_code, 409)

    def test_public_qr_menu_and_order_use_rds_models(self):
        CloudState.objects.create(state_key="vestora-menu-items-STORE-1", state_value=[{
            "id": "ITEM-1", "name": "Biryani", "category": "Main", "price": 240, "tax": 5, "status": "Active",
        }])
        CloudState.objects.create(state_key="vestora-tables-STORE-1", state_value=[{
            "id": "TABLE-1", "name": "T1", "floor": "Ground", "seats": 4, "status": "Available",
        }])
        self.client.force_authenticate(user=None)
        menu = self.client.get("/api/cloud/public-order/menu?storeId=STORE-1&tableId=TABLE-1")
        self.assertEqual(menu.status_code, 200)
        self.assertEqual(menu.data["items"][0]["name"], "Biryani")

        order = self.client.post("/api/cloud/public-order/orders", {
            "storeId": "STORE-1", "tableId": "TABLE-1", "customerName": "Guest",
            "items": [{"id": "ITEM-1", "qty": 2}],
        }, format="json")
        self.assertEqual(order.status_code, 201)
        self.assertEqual(PublicOrder.objects.get().subtotal, 480)
