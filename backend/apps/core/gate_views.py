"""Branch-scoped security gate workflow; never posts inventory or finance."""
import re
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .cloud_views import _access, _can_store
from .models import GateAudit, GateBill, GateExit, GateVisit

ENTRY_PURPOSES = ['Supplier Goods Delivery', 'Purchase Delivery', 'Stock Transfer', 'Sales Delivery Vehicle', 'Waste Collection', 'Scrap Collection', 'Supplier Return', 'Company Vehicle', 'Maintenance', 'Other']
EXIT_PURPOSES = ['Empty Vehicle', 'Goods Dispatch', 'Stock Transfer', 'Supplier Return', 'Waste Disposal', 'Scrap Sale', 'Damaged Goods Return', 'Company Vehicle', 'Maintenance', 'Other']
RESTRICTED = {'Goods Dispatch', 'Stock Transfer', 'Supplier Return', 'Waste Disposal', 'Scrap Sale', 'Damaged Goods Return'}
WASTE = {'Waste Disposal', 'Scrap Sale', 'Damaged Goods Return'}


def allowed(access, store, capability):
    user = access['user']
    if not _can_store(access, store):
        return False
    if access['platform_admin'] or user.user_type in ('owner', 'restaurant_admin'):
        return True
    if user.user_type in ('branch_manager', 'manager'):
        return True
    linked = access.get('linked') or {}
    roles = access.get('roles') or []
    role = next((r for r in roles if r.get('name') == linked.get('role') and r.get('storeId') == store and r.get('status') != 'Inactive'), None)
    if role is None:
        role = next((r for r in roles if r.get('name') == linked.get('role') and r.get('storeId') == 'GLOBAL' and r.get('status') != 'Inactive'), {})
    return 'gate' in (role.get('modules') or []) and f'access:gate:{capability}' in (role.get('permissions') or [])


class BillInput(serializers.Serializer):
    number = serializers.CharField(max_length=120)
    bill_date = serializers.DateField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=16, decimal_places=2, min_value=Decimal('0'), required=False, allow_null=True)


class EntryInput(serializers.Serializer):
    vehicle_number = serializers.CharField(max_length=40)
    vehicle_type = serializers.ChoiceField(choices=['Truck', 'Lorry', 'Pickup', 'Van', 'Car', 'Other'])
    driver_name = serializers.CharField(max_length=160)
    driver_phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    supplier_name = serializers.CharField(max_length=180, required=False, allow_blank=True)
    purpose = serializers.ChoiceField(choices=ENTRY_PURPOSES)
    material = serializers.CharField(required=False, allow_blank=True)
    quantity = serializers.DecimalField(max_digits=16, decimal_places=3, min_value=Decimal('0'), required=False, allow_null=True)
    unit = serializers.CharField(max_length=40, required=False, allow_blank=True)
    remarks = serializers.CharField(required=False, allow_blank=True)
    bills = BillInput(many=True, required=False)

    def validate_vehicle_number(self, value):
        normalized = re.sub(r'[^A-Z0-9]', '', value.upper())
        if not normalized:
            raise serializers.ValidationError('Enter a vehicle number.')
        return normalized


class ExitInput(serializers.Serializer):
    purpose = serializers.ChoiceField(choices=EXIT_PURPOSES)
    material = serializers.CharField(required=False, allow_blank=True)
    document_number = serializers.CharField(max_length=120, required=False, allow_blank=True)
    amount = serializers.DecimalField(max_digits=16, decimal_places=2, min_value=Decimal('0'), required=False, allow_null=True)
    quantity = serializers.DecimalField(max_digits=16, decimal_places=3, min_value=Decimal('0'), required=False, allow_null=True)
    unit = serializers.CharField(max_length=40, required=False, allow_blank=True)
    destination = serializers.CharField(max_length=240, required=False, allow_blank=True)
    waste_type = serializers.CharField(max_length=80, required=False, allow_blank=True)
    remarks = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        if data['purpose'] in WASTE and not all(data.get(k) for k in ('material', 'unit', 'destination', 'waste_type')):
            raise serializers.ValidationError('Waste type, material, unit and destination are required.')
        if data['purpose'] in WASTE and not data.get('quantity'):
            raise serializers.ValidationError('Enter the waste quantity.')
        if data['purpose'] == 'Scrap Sale' and data.get('amount') is None:
            raise serializers.ValidationError('Enter the scrap sale amount.')
        if data['purpose'] in {'Goods Dispatch', 'Stock Transfer', 'Supplier Return'} and not data.get('document_number'):
            raise serializers.ValidationError('Enter the bill or challan reference.')
        return data


def as_record(visit):
    outgoing = getattr(visit, 'exit', None)
    return {'id': str(visit.pk), 'gate_in_number': f'GIN-{visit.pk.hex[:12].upper()}', 'store_id': visit.store_id,
            'vehicle_number': visit.vehicle_number, 'vehicle_type': visit.vehicle_type, 'driver_name': visit.driver_name,
            'driver_phone': visit.driver_phone, 'supplier_name': visit.supplier_name, 'purpose': visit.purpose,
            'material': visit.material, 'quantity': visit.quantity, 'unit': visit.unit, 'remarks': visit.remarks,
            'entered_at': visit.entered_at, 'entered_by': visit.entered_by.get_full_name() or visit.entered_by.username,
            'status': visit.status, 'bills': list(visit.bills.values('number', 'bill_date', 'amount')),
            'exit': None if outgoing is None else {'id': str(outgoing.pk), 'gate_out_number': f'GOUT-{outgoing.pk.hex[:12].upper()}',
                'purpose': outgoing.purpose, 'material': outgoing.material, 'document_number': outgoing.document_number,
                'amount': outgoing.amount, 'quantity': outgoing.quantity, 'unit': outgoing.unit, 'destination': outgoing.destination,
                'waste_type': outgoing.waste_type, 'remarks': outgoing.remarks, 'approved_at': outgoing.approved_at,
                'approved_by': outgoing.approved_by_id, 'exited_at': outgoing.exited_at, 'exited_by': outgoing.exited_by_id}}


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def visits(request):
    store = str(request.query_params.get('store_id') or request.data.get('store_id') or '')
    access = _access(request)
    if not store or not allowed(access, store, 'view' if request.method == 'GET' else 'entry'):
        return Response({'error': 'Gate access is not allowed for this branch.'}, status=403)
    if request.method == 'GET':
        qs = GateVisit.objects.filter(store_id=store).select_related('entered_by', 'exit').prefetch_related('bills').order_by('-entered_at')
        return Response([as_record(v) for v in qs[:1000]])
    serializer = EntryInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = dict(serializer.validated_data)
    bills = data.pop('bills', [])
    try:
        with transaction.atomic():
            visit = GateVisit.objects.create(store_id=store, entered_by=request.user, **data)
            GateBill.objects.bulk_create([GateBill(visit=visit, **bill) for bill in bills])
            GateAudit.objects.create(visit=visit, actor=request.user, action='GATE_IN')
    except IntegrityError:
        return Response({'error': 'This vehicle is already inside this branch.'}, status=409)
    return Response(as_record(visit), status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def movement(request, visit_id, action):
    store = str(request.data.get('store_id') or '')
    access = _access(request)
    capability = 'approve' if action == 'approve' else 'exit'
    if not store or not allowed(access, store, capability):
        return Response({'error': 'Gate access is not allowed for this branch.'}, status=403)
    if action not in ('request-exit', 'approve', 'confirm'):
        return Response({'error': 'Unknown action.'}, status=404)
    with transaction.atomic():
        visit = GateVisit.objects.select_for_update().filter(pk=visit_id, store_id=store).first()
        if not visit:
            return Response({'error': 'Gate visit not found.'}, status=404)
        if visit.status == 'EXITED':
            return Response({'error': 'This visit has already exited.'}, status=409)
        outgoing = GateExit.objects.filter(visit=visit).first()
        if action == 'request-exit':
            if outgoing:
                return Response({'error': 'An exit request already exists for this visit.'}, status=409)
            serializer = ExitInput(data=request.data)
            serializer.is_valid(raise_exception=True)
            outgoing = GateExit.objects.create(visit=visit, requested_by=request.user, **serializer.validated_data)
            visit.status = 'PENDING_APPROVAL' if outgoing.purpose in RESTRICTED else 'INSIDE'
            visit.save(update_fields=['status', 'updated_at'])
            audit_action = 'EXIT_REQUESTED'
        elif not outgoing:
            return Response({'error': 'Create an exit request first.'}, status=400)
        elif action == 'approve':
            if outgoing.purpose not in RESTRICTED or outgoing.approved_at:
                return Response({'error': 'This exit does not need approval or is already approved.'}, status=409)
            outgoing.approved_by = request.user
            outgoing.approved_at = timezone.now()
            outgoing.save(update_fields=['approved_by', 'approved_at', 'updated_at'])
            audit_action = 'EXIT_APPROVED'
        else:
            if outgoing.purpose in RESTRICTED and not outgoing.approved_at:
                return Response({'error': 'Manager approval is required before exit.'}, status=403)
            outgoing.exited_by = request.user
            outgoing.exited_at = timezone.now()
            outgoing.save(update_fields=['exited_by', 'exited_at', 'updated_at'])
            visit.status = 'EXITED'
            visit.save(update_fields=['status', 'updated_at'])
            audit_action = 'GATE_OUT'
        GateAudit.objects.create(visit=visit, actor=request.user, action=audit_action)
    return Response(as_record(GateVisit.objects.select_related('entered_by', 'exit').get(pk=visit.pk)))
