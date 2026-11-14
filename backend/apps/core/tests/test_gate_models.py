from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.core.models import GateBill, GateExit, GateVisit, User


class GateRecordTests(TestCase):
    def setUp(self):
        self.guard = User.objects.create_user(username='gate-guard')

    def visit(self, store='branch-1', vehicle='KL01AB1234', status='INSIDE'):
        return GateVisit.objects.create(store_id=store, vehicle_number=vehicle,
            vehicle_type='Truck', driver_name='Driver', purpose='Purchase Delivery',
            status=status, entered_by=self.guard)

    def test_only_one_active_visit_for_a_vehicle_in_a_store(self):
        self.visit()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.visit(status='PENDING_APPROVAL')
        self.visit(store='branch-2')

    def test_vehicle_can_reenter_after_exit(self):
        visit = self.visit()
        visit.status = 'EXITED'
        visit.save(update_fields=['status'])
        self.assertNotEqual(self.visit().pk, visit.pk)

    def test_multiple_bills_and_only_one_exit(self):
        visit = self.visit()
        GateBill.objects.create(visit=visit, number='INV-1', amount=100)
        GateBill.objects.create(visit=visit, number='INV-2', amount=200)
        self.assertEqual(visit.bills.count(), 2)
        GateExit.objects.create(visit=visit, purpose='Empty Vehicle', requested_by=self.guard)
        with self.assertRaises(IntegrityError), transaction.atomic():
            GateExit.objects.create(visit=visit, purpose='Empty Vehicle', requested_by=self.guard)
