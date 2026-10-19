import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.db import IntegrityError
from rest_framework.test import APIClient

from apps.core.cloud_views import _state_store
from apps.core.models import Branch, Restaurant, SharedAppState, SyncOperation


class CloudStateMutationTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="sync-admin",
            email="sync@example.test",
            password="not-used-by-force-authentication",
            user_type="super_admin",
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = "/api/cloud/state/"
        self.key = "vestora-food-stock-STORE-A"

    def put(self, mutation_id, value, expected=None):
        return self.client.put(
            self.url,
            {
                "key": self.key,
                "value": value,
                "expectedUpdatedAt": expected,
                "mutationId": str(mutation_id),
            },
            format="json",
        )

    def test_replaying_a_mutation_returns_the_recorded_result_once(self):
        mutation_id = uuid.uuid4()
        value = [{"id": "rice", "available": 8, "sold": 2}]

        first = self.put(mutation_id, value)
        replay = self.put(mutation_id, value)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json(), first.json())
        self.assertEqual(SharedAppState.objects.get(state_key=self.key).state_value, value)
        self.assertEqual(SyncOperation.objects.filter(actor_id=str(self.user.pk), operation_id=mutation_id).count(), 1)

    def test_initial_insert_race_returns_retryable_conflict_and_clears_journal(self):
        mutation_id = uuid.uuid4()
        with patch.object(SharedAppState, "save", side_effect=IntegrityError("state key already exists")):
            response = self.put(mutation_id, [{"id": "rice", "available": 8}])
        self.assertEqual(response.status_code, 409)
        self.assertFalse(SyncOperation.objects.filter(operation_id=mutation_id).exists())
        self.assertEqual(self.put(mutation_id, [{"id": "rice", "available": 8}]).status_code, 200)

    def test_mutation_id_cannot_be_reused_for_different_content(self):
        mutation_id = uuid.uuid4()
        self.assertEqual(self.put(mutation_id, [{"id": "rice", "available": 8}]).status_code, 200)

        response = self.put(mutation_id, [{"id": "rice", "available": 6}])

        self.assertEqual(response.status_code, 409)
        self.assertIn("already used", response.json()["error"])
        self.assertEqual(SharedAppState.objects.get(state_key=self.key).state_value[0]["available"], 8)

    def test_conflict_does_not_leave_a_false_success_journal_entry(self):
        first_id = uuid.uuid4()
        first = self.put(first_id, [{"id": "rice", "available": 10}])
        self.assertEqual(first.status_code, 200)

        retry_id = uuid.uuid4()
        conflict = self.put(retry_id, [{"id": "rice", "available": 8}], expected=None)
        self.assertEqual(conflict.status_code, 409)
        self.assertFalse(SyncOperation.objects.filter(actor_id=str(self.user.pk), operation_id=retry_id).exists())

        saved = self.put(
            retry_id,
            [{"id": "rice", "available": 8}],
            expected=first.json()["updated_at"],
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(SharedAppState.objects.get(state_key=self.key).state_value[0]["available"], 8)


class CloudStateKeyRoutingTests(TestCase):
    def test_purchase_inventory_keys_route_to_the_real_store(self):
        for key in (
            "vestora-inventory-brands-STORE-A",
            "vestora-inventory-manufacturers-STORE-A",
            "vestora-inventory-brand-manufacturer-profiles-STORE-A",
            "vestora-inventory-departments-STORE-A",
            "vestora-inventory-subcategories-STORE-A",
            "vestora-inventory-vendors-STORE-A",
        ):
            with self.subTest(key=key):
                self.assertEqual(_state_store(key), "STORE-A")


class TenantBranchCloudAccessTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(
            name="Demo Spice House",
            slug="demo-spice-house-cloud-access",
            owner_name="Demo Owner",
            owner_email="owner@example.test",
            owner_mobile="+919000000001",
        )
        self.assigned_branch = Branch.objects.create(
            restaurant=self.restaurant,
            name="Indiranagar",
            code="BLR-01",
        )
        self.other_branch = Branch.objects.create(
            restaurant=self.restaurant,
            name="Whitefield",
            code="BLR-02",
        )
        self.user = get_user_model().objects.create_user(
            username="branch-admin@example.test",
            email="branch-admin@example.test",
            password="not-used-by-force-authentication",
            user_type="restaurant_admin",
            restaurant=self.restaurant,
        )
        self.user.branches.add(self.assigned_branch)
        SharedAppState.objects.create(
            state_key="vestora-stores",
            state_value=[
                {"id": "STORE-INDIRANAGAR", "name": "Demo Spice House", "branch": "Indiranagar", "branchCode": "BLR-01"},
                {"id": "STORE-WHITEFIELD", "name": "Demo Spice House", "branch": "Whitefield", "branchCode": "BLR-02"},
                {"id": "STORE-OTHER-TENANT", "name": "Another Restaurant", "branch": "Indiranagar", "branchCode": "BLR-01"},
            ],
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_restaurant_user_can_sync_their_assigned_branch_without_opening_sibling_stores(self):
        profile = self.client.get("/api/cloud/profile/")
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.json()["allowedStoreIds"], ["STORE-INDIRANAGAR"])

        allowed_write = self.client.put(
            "/api/cloud/state/",
            {
                "key": "vestora-inventory-STORE-INDIRANAGAR",
                "value": [{"id": "rice", "name": "Rice"}],
                "expectedUpdatedAt": None,
                "mutationId": str(uuid.uuid4()),
            },
            format="json",
        )
        denied_write = self.client.put(
            "/api/cloud/state/",
            {
                "key": "vestora-inventory-STORE-WHITEFIELD",
                "value": [{"id": "rice", "name": "Rice"}],
                "expectedUpdatedAt": None,
                "mutationId": str(uuid.uuid4()),
            },
            format="json",
        )

        self.assertEqual(allowed_write.status_code, 200)
        self.assertEqual(denied_write.status_code, 403)
