import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import SharedAppState, User
from apps.core.cloud_views import _session_user


class ManualAttendanceAccessTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="manual-test", email="manual@example.test", user_type="cashier")
        SharedAppState.objects.create(state_key="vestora-stores", state_value=[{"id": "A"}])
        SharedAppState.objects.create(state_key="vestora-users", state_value=[{
            "email": self.user.email, "storeId": "A", "role": "Supervisor", "status": "Active"}])
        self.roles = SharedAppState.objects.create(state_key="vestora-custom-roles", state_value=[])
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.key = "vestora-attendance-logs-A"
        self.manual = {"id": "one", "employeeId": "staff", "source": "manual", "checkIn": "2026-10-17T09:00:00Z", "checkOut": ""}

    def save(self, rows):
        row = SharedAppState.objects.filter(state_key=self.key).first()
        return self.client.put("/api/cloud/state/", {"key": self.key, "value": rows,
            "expectedUpdatedAt": row.updated_at.isoformat() if row else None,
            "mutationId": str(uuid.uuid4())}, format="json")

    def grant(self, **overrides):
        self.roles.state_value = [{"name": "Supervisor", "storeId": "A", "status": "Active",
                                   "modules": ["attendance"], "permissions": ["attendance.manual"], **overrides}]
        self.roles.save()

    def test_manual_requires_separate_permission(self):
        self.grant(permissions=[])
        self.assertEqual(self.save([self.manual]).status_code, 403)
        self.assertFalse(SharedAppState.objects.filter(state_key=self.key).exists())
        self.grant()
        self.assertEqual(self.save([self.manual]).status_code, 200)
        self.assertEqual(self.save([{**self.manual, "checkOut": "2026-10-17T17:00:00Z"}]).status_code, 200)

    def test_inactive_or_other_store_cannot_grant(self):
        for overrides in ({"status": "Inactive"}, {"storeId": "B"}, {"modules": []}):
            self.grant(**overrides)
            self.assertEqual(self.save([self.manual]).status_code, 403)

    def test_kiosk_keeps_working_with_existing_manual_rows(self):
        SharedAppState.objects.create(state_key=self.key, state_value=[self.manual])
        face = {**self.manual, "id": "two", "source": "face"}
        self.assertEqual(self.save([self.manual, face]).status_code, 200)
        checkout = {**self.manual, "source": "face", "checkOut": "2026-10-17T17:00:00Z"}
        self.assertEqual(self.save([checkout, face]).status_code, 200)

    def test_cannot_delete_or_rewrite_manual_punch(self):
        SharedAppState.objects.create(state_key=self.key, state_value=[self.manual])
        self.assertEqual(self.save([]).status_code, 403)
        self.assertEqual(self.save([{**self.manual, "source": "face", "employeeId": "other"}]).status_code, 403)

    def test_admin_and_custom_role_profile(self):
        self.grant()
        self.assertEqual(_session_user(self.user)["app_metadata"]["vestora"]["appRole"], "Supervisor")
        self.roles.state_value = []
        self.roles.save()
        self.user.user_type = "restaurant_admin"
        self.user.save()
        self.assertEqual(self.save([self.manual]).status_code, 200)
