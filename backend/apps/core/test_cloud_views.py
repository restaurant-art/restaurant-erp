import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from .cloud_views import _session_user, _state_store
from .models import SharedAppState, User


class CloudSessionUserTests(TestCase):
    def test_login_metadata_uses_the_server_verified_store_assignment(self):
        user = User.objects.create_user(
            username="cashier@example.test",
            email="cashier@example.test",
            password="test-password",
            user_type="cashier",
        )
        SharedAppState.objects.create(
            state_key="vestora-stores",
            state_value=[{"id": "STORE-A", "name": "Test store"}],
        )
        SharedAppState.objects.create(
            state_key="vestora-users",
            state_value=[{
                "id": "staff-a",
                "email": user.email,
                "storeId": "STORE-A",
                "status": "Active",
            }],
        )

        session_user = _session_user(user)

        assignment = session_user["app_metadata"]["vestora"]
        self.assertEqual(assignment["storeId"], "STORE-A")


class InventoryProfileAccessTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="inventory-admin", email="inventory@example.test",
            user_type="restaurant_admin",
        )
        SharedAppState.objects.create(
            state_key="vestora-stores",
            state_value=[{"id": "STORE-A"}, {"id": "STORE-B"}],
        )
        SharedAppState.objects.create(
            state_key="vestora-users",
            state_value=[{"email": self.user.email, "storeId": "STORE-A", "status": "Active"}],
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_inventory_profiles_use_the_assigned_store_for_reads_and_writes(self):
        for profile in ("category", "tax"):
            with self.subTest(profile=profile):
                key = f"vestora-inventory-{profile}-profiles-STORE-A"
                self.assertEqual(_state_store(key), "STORE-A")
                value = [{"id": "profile-a", "name": "Inventory setup"}]
                saved = self.client.put("/api/cloud/state/", {
                    "key": key, "value": value, "expectedUpdatedAt": None,
                    "mutationId": str(uuid.uuid4()),
                }, format="json")
                self.assertEqual(saved.status_code, 200, saved.data)
                read = self.client.get("/api/cloud/state/", {"key": key})
                self.assertEqual(read.status_code, 200)
                self.assertEqual(read.data[0]["state_value"], value)

    def test_inventory_profiles_cannot_read_or_write_another_store(self):
        for profile in ("category", "tax"):
            with self.subTest(profile=profile):
                key = f"vestora-inventory-{profile}-profiles-STORE-B"
                self.assertEqual(self.client.get("/api/cloud/state/", {"key": key}).status_code, 403)
                denied = self.client.put("/api/cloud/state/", {
                    "key": key, "value": [], "expectedUpdatedAt": None,
                    "mutationId": str(uuid.uuid4()),
                }, format="json")
                self.assertEqual(denied.status_code, 403)
                self.assertFalse(SharedAppState.objects.filter(state_key=key).exists())

