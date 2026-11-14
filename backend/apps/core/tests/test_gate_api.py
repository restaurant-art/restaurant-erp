from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import GateAudit, GateVisit, SharedAppState, User


class GateApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='admin', email='admin@test.local', user_type='restaurant_admin')
        self.guard = User.objects.create_user(username='guard', email='guard@test.local', user_type='cashier')
        SharedAppState.objects.create(state_key='vestora-stores', state_value=[{'id': 'A'}, {'id': 'B'}])
        SharedAppState.objects.create(state_key='vestora-users', state_value=[{'email': self.admin.email, 'storeId': 'A'}, {'email': self.guard.email, 'storeId': 'A', 'role': 'Guard'}])
        SharedAppState.objects.create(state_key='vestora-custom-roles', state_value=[{'name': 'Guard', 'storeId': 'A', 'modules': ['gate'], 'permissions': ['access:gate:view', 'access:gate:entry', 'access:gate:exit']}])
        self.client = APIClient()
        self.client.force_authenticate(self.guard)

    def create_visit(self):
        return self.client.post('/api/gate/visits/', {'store_id': 'A', 'vehicle_number': 'kl 01 ab 1234', 'vehicle_type': 'Truck', 'driver_name': 'Driver', 'purpose': 'Purchase Delivery', 'bills': [{'number': 'I1', 'amount': '100'}, {'number': 'I2', 'amount': '200'}]}, format='json')

    def action(self, visit_id, action, **data):
        return self.client.post(f'/api/gate/visits/{visit_id}/{action}/', {'store_id': 'A', **data}, format='json')

    def test_entry_duplicate_branch_isolation_and_reentry(self):
        response = self.create_visit()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['vehicle_number'], 'KL01AB1234')
        self.assertEqual(len(response.data['bills']), 2)
        self.assertEqual(self.create_visit().status_code, 409)
        self.assertEqual(self.client.get('/api/gate/visits/', {'store_id': 'B'}).status_code, 403)
        pk = response.data['id']
        self.assertEqual(self.action(pk, 'request-exit', purpose='Empty Vehicle').status_code, 200)
        self.assertEqual(self.action(pk, 'confirm').status_code, 200)
        self.assertEqual(self.action(pk, 'confirm').status_code, 409)
        self.assertEqual(self.create_visit().status_code, 201)
        self.assertEqual(GateAudit.objects.filter(visit_id=pk).count(), 3)

    def test_waste_needs_manager_approval(self):
        pk = self.create_visit().data['id']
        response = self.action(pk, 'request-exit', purpose='Waste Disposal', material='Plastic', quantity='10', unit='kg', waste_type='Plastic', destination='Recycler')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.action(pk, 'confirm').status_code, 403)
        self.assertEqual(self.action(pk, 'approve').status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.action(pk, 'approve').status_code, 200)
        self.client.force_authenticate(self.guard)
        self.assertEqual(self.action(pk, 'confirm').status_code, 200)
        self.assertEqual(GateVisit.objects.get(pk=pk).status, 'EXITED')

    def test_missing_invoice_is_allowed_but_dispatch_requires_reference(self):
        response = self.client.post('/api/gate/visits/', {'store_id': 'A', 'vehicle_number': 'KL02AB1111', 'vehicle_type': 'Van', 'driver_name': 'Driver', 'purpose': 'Purchase Delivery'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['bills'], [])
        pk = response.data['id']
        self.assertEqual(self.action(pk, 'request-exit', purpose='Goods Dispatch').status_code, 400)

    def test_staff_without_gate_role_cannot_list_or_create(self):
        other = User.objects.create_user(username='other', email='other@test.local')
        staff = SharedAppState.objects.get(state_key='vestora-users')
        staff.state_value.append({'email': other.email, 'storeId': 'A', 'role': 'Cashier'})
        staff.save()
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get('/api/gate/visits/', {'store_id': 'A'}).status_code, 403)
        self.assertEqual(self.create_visit().status_code, 403)
