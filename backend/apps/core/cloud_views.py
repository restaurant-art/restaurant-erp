import base64
import json
import os
import re
import uuid
from decimal import Decimal

from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import CloudState, PublicOrder, User


GLOBAL_KEYS = {
    "vestora-stores", "vestora-users", "vestora-custom-roles",
    "vestora-sales-ledger", "vestora-void-ledger", "vestora-refund-ledger",
    "vestora-kds-orders", "vestora-table-orders", "vestora-supplier-orders",
}
STORE_PREFIXES = (
    "active-settings", "attendance-employees", "attendance-logs",
    "attendance-records", "attendance-report", "attendance-settings",
    "finance-bank-accounts", "finance-expenses", "finance-journals",
    "finance-ledgers", "finance-receipts", "finance-vendor-payments",
    "finished-goods", "floors", "food-stock", "inventory-categories",
    "inventory-transactions", "inventory", "last-shift-close", "shifts",
    "shift-history", "leave-requests", "menu-items", "menu-setup", "offers",
    "payroll-attendance", "production-batches", "production-categories",
    "production-wastage", "recipes", "tables", "bill-template", "theme-config",
    "supplier-documents", "customer-details",
)
SECRET_KEY_RE = re.compile(r"password|token|credential|secret|access.?key|api.?key", re.I)


def _error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"error": message}, status=code)


def _sanitize(value):
    if isinstance(value, list):
        return [_sanitize(entry) for entry in value]
    if isinstance(value, dict):
        return {key: _sanitize(entry) for key, entry in value.items() if not SECRET_KEY_RE.search(str(key))}
    return value


def _state_store(key):
    for prefix in STORE_PREFIXES:
        marker = f"vestora-{prefix}-"
        if key.startswith(marker):
            return key[len(marker):]
    return None


def _is_business_key(key):
    return key in GLOBAL_KEYS or _state_store(key) is not None


def _directory():
    row = CloudState.objects.filter(state_key="vestora-stores").first()
    return row.state_value if row and isinstance(row.state_value, list) else []


def _is_platform_admin(user):
    return bool(user.is_superuser or user.user_type == User.UserType.SUPER_ADMIN)


def _allowed_store_ids(user):
    directory = _directory()
    if _is_platform_admin(user):
        return [str(store.get("id")) for store in directory if store.get("id") is not None]
    email = user.email.lower()
    restaurant_id = str(user.restaurant_id or "")
    branch_ids = {str(value) for value in user.branches.values_list("id", flat=True)}
    branch_ids.update(str(value) for value in user.branches.values_list("code", flat=True))
    allowed = []
    for store in directory:
        store_id = str(store.get("id") or "")
        if (
            str(store.get("adminEmail") or "").lower() == email
            or (restaurant_id and str(store.get("restaurantId") or "") == restaurant_id)
            or str(store.get("branchId") or "") in branch_ids
            or str(store.get("branchCode") or "") in branch_ids
        ):
            allowed.append(store_id)
    if not allowed:
        allowed = sorted(branch_ids)
    return [value for value in allowed if value]


def _can_store(user, store_id):
    return _is_platform_admin(user) or str(store_id) in _allowed_store_ids(user)


def _can_key(user, key):
    store_id = _state_store(key)
    return _is_business_key(key) and (not store_id or _can_store(user, store_id))


def _scope_value(user, key, value):
    if _is_platform_admin(user) or _state_store(key) or not isinstance(value, list):
        return _sanitize(value)
    allowed = set(_allowed_store_ids(user))
    field = "id" if key == "vestora-stores" else "storeId"
    return _sanitize([entry for entry in value if isinstance(entry, dict) and str(entry.get(field, "")) in allowed])


def _state_payload(user, row):
    return {
        "state_key": row.state_key,
        "state_value": _scope_value(user, row.state_key, row.state_value),
        "updated_at": row.updated_at.isoformat(),
    }


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        login = str(attrs.get(self.username_field) or "").strip()
        if "@" in login:
            user = User.objects.filter(email__iexact=login).only("username").first()
            if user:
                attrs[self.username_field] = user.username
        data = super().validate(attrs)
        data["user"] = {
            "id": str(self.user.pk),
            "email": self.user.email,
            "name": self.user.get_full_name().strip() or self.user.username,
        }
        return data


class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def cloud_profile(request):
    user = request.user
    allowed = _allowed_store_ids(user)
    directory = _directory()
    assigned_store = next((str(store.get("id")) for store in directory if str(store.get("id")) in allowed), None)
    role_labels = {
        "super_admin": "Super Admin", "owner": "Restaurant Owner",
        "restaurant_admin": "Restaurant Admin", "branch_manager": "Branch Manager",
        "manager": "Manager", "cashier": "Cashier", "waiter": "Waiter",
        "kitchen_staff": "Chef", "chef": "Chef", "inventory_manager": "Inventory Manager",
        "purchase_manager": "Purchase Manager", "hr_manager": "HR Manager",
        "accountant": "Accountant", "delivery_boy": "Delivery Boy", "customer": "Customer",
    }
    expires_at = None
    if user.restaurant_id:
        subscription = getattr(user.restaurant, "subscription", None)
        if subscription:
            expires_at = subscription.current_period_ends_at or subscription.trial_ends_at
    expired = bool(expires_at and expires_at <= timezone.now())
    return Response({
        "id": str(user.pk), "email": user.email,
        "name": user.get_full_name().strip() or user.username,
        "restaurantId": user.restaurant_id, "role": user.user_type,
        "appRole": role_labels.get(user.user_type, user.user_type),
        "isSuperuser": _is_platform_admin(user), "status": "Active" if user.is_active else "Inactive",
        "storeId": assigned_store or ("GLOBAL" if _is_platform_admin(user) else (allowed[0] if allowed else "GLOBAL")),
        "allowedStoreIds": allowed,
        "subscriptionExpiresAt": expires_at.date().isoformat() if expires_at else None,
        "subscriptionExpired": expired,
    })


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def cloud_state(request):
    user = request.user
    if request.method == "GET":
        key = request.query_params.get("key")
        store_id = request.query_params.get("storeId")
        if key and not _can_key(user, key):
            return _error("Store access denied", status.HTTP_403_FORBIDDEN)
        if store_id and not _can_store(user, store_id):
            return _error("Store access denied", status.HTTP_403_FORBIDDEN)
        rows = CloudState.objects.all()
        if key:
            rows = rows.filter(state_key=key)
        result = []
        for row in rows:
            row_store = _state_store(row.state_key)
            if _can_key(user, row.state_key) and (not store_id or not row_store or row_store == store_id):
                result.append(_state_payload(user, row))
        return Response(result)

    body = request.data if isinstance(request.data, dict) else {}
    key = body.get("key")
    if not isinstance(key, str) or not _is_business_key(key):
        return _error("A supported business state key is required")
    if not _can_key(user, key):
        return _error("Store access denied", status.HTTP_403_FORBIDDEN)
    if key in {"vestora-users", "vestora-custom-roles"} and not (
        _is_platform_admin(user) or user.user_type in {User.UserType.OWNER, User.UserType.RESTAURANT_ADMIN}
    ):
        return _error("Administrator permission required", status.HTTP_403_FORBIDDEN)
    if "expectedUpdatedAt" not in body:
        return _error("Refresh this app to save shared data safely", status.HTTP_409_CONFLICT)
    try:
        mutation_id = uuid.UUID(str(body.get("mutationId")))
    except (TypeError, ValueError):
        return _error("Refresh this app to enable reliable store synchronization", status.HTTP_409_CONFLICT)
    expected = body.get("expectedUpdatedAt")
    value = _sanitize(body.get("value"))
    with transaction.atomic():
        duplicate = CloudState.objects.select_for_update().filter(last_mutation_id=mutation_id).first()
        if duplicate:
            if duplicate.state_key != key:
                return _error("Mutation ID was already used for another record", status.HTTP_409_CONFLICT)
            return Response(_state_payload(user, duplicate))
        row = CloudState.objects.select_for_update().filter(state_key=key).first()
        current_version = row.updated_at.isoformat() if row else None
        if expected != current_version:
            return _error("Data changed on another device; retry with the latest version", status.HTTP_409_CONFLICT)
        if not _is_platform_admin(user) and key in GLOBAL_KEYS:
            if not isinstance(value, list):
                return _error("Expected a list of store records")
            allowed = set(_allowed_store_ids(user))
            field = "id" if key == "vestora-stores" else "storeId"
            if any(not isinstance(entry, dict) or str(entry.get(field, "")) not in allowed for entry in value):
                return _error("Cannot change records from another store", status.HTTP_403_FORBIDDEN)
            old = row.state_value if row and isinstance(row.state_value, list) else []
            if key == "vestora-stores":
                old_scoped = [entry for entry in old if str(entry.get("id", "")) in allowed]
                if {str(entry.get("id")) for entry in value} != {str(entry.get("id")) for entry in old_scoped}:
                    return _error("Super Admin permission required to create or delete stores", status.HTTP_403_FORBIDDEN)
                protected = ("id", "parentStoreId", "restaurantId", "adminEmail", "status", "subscriptionExpiresAt")
                old_by_id = {str(entry.get("id")): entry for entry in old_scoped}
                if any(any(entry.get(field_name) != old_by_id[str(entry.get("id"))].get(field_name) for field_name in protected) for entry in value):
                    return _error("Super Admin permission required to change store access", status.HTTP_403_FORBIDDEN)
            value = value + [entry for entry in old if str(entry.get(field, "")) not in allowed]
        if row is None:
            row = CloudState(state_key=key)
        row.state_value = value
        row.last_mutation_id = mutation_id
        row.updated_by = user
        row.save()
        return Response(_state_payload(user, row))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    password = str(request.data.get("password") or "")
    if len(password) < 8:
        return _error("Use a password of at least 8 characters")
    request.user.set_password(password)
    request.user.save(update_fields=["password"])
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cashier_login(request):
    email = str(request.data.get("email") or "").strip().lower()
    candidate = User.objects.filter(email__iexact=email, is_active=True).first()
    if not candidate or candidate.user_type not in {User.UserType.CASHIER, User.UserType.MANAGER, User.UserType.OWNER, User.UserType.RESTAURANT_ADMIN}:
        return _error("Cashier is not available in this store", status.HTTP_403_FORBIDDEN)
    staff_row = CloudState.objects.filter(state_key="vestora-users").first()
    staff = staff_row.state_value if staff_row and isinstance(staff_row.state_value, list) else []
    staff_record = next((entry for entry in staff if isinstance(entry, dict) and str(entry.get("email", "")).lower() == email), None)
    if not _is_platform_admin(request.user):
        if staff_record and not _can_store(request.user, staff_record.get("storeId")):
            return _error("Cashier is not available in this store", status.HTTP_403_FORBIDDEN)
        if not staff_record and candidate.restaurant_id != request.user.restaurant_id:
            return _error("Cashier is not available in this store", status.HTTP_403_FORBIDDEN)
    authenticated = authenticate(request, username=candidate.username, password=str(request.data.get("password") or ""))
    if not authenticated:
        return _error("Incorrect cashier sign-in details", status.HTTP_403_FORBIDDEN)
    return Response({"id": str(candidate.pk), "name": candidate.get_full_name().strip() or candidate.username, "email": candidate.email, "role": candidate.user_type})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def staff_account(request):
    actor = request.user
    if not (_is_platform_admin(actor) or actor.user_type in {User.UserType.OWNER, User.UserType.RESTAURANT_ADMIN}):
        return _error("Administrator permission required", status.HTTP_403_FORBIDDEN)
    body = request.data if isinstance(request.data, dict) else {}
    action = str(body.get("action") or "create")
    email = str(body.get("email") or "").strip().lower()
    store_id = str(body.get("storeId") or "")
    if "@" not in email:
        return _error("Valid staff email required")
    if email == actor.email.lower():
        return _error("You cannot change or deactivate the account currently signed in")
    if store_id and not _can_store(actor, store_id):
        return _error("Store access denied", status.HTTP_403_FORBIDDEN)
    target = User.objects.filter(email__iexact=email).first()
    if target and _is_platform_admin(target):
        return _error("Super Admin accounts cannot be reassigned as staff users", status.HTTP_403_FORBIDDEN)
    directory_row = CloudState.objects.filter(state_key="vestora-users").first()
    directory_staff = directory_row.state_value if directory_row and isinstance(directory_row.state_value, list) else []
    directory_target = next((entry for entry in directory_staff if isinstance(entry, dict) and (
        str(entry.get("id")) == str(body.get("id")) or str(entry.get("email", "")).lower() == email
    )), None)
    if target and not _is_platform_admin(actor) and (not directory_target or not _can_store(actor, directory_target.get("storeId"))):
        return _error("This login cannot be changed by this administrator", status.HTTP_403_FORBIDDEN)
    role_map = {
        "Restaurant Admin": User.UserType.RESTAURANT_ADMIN, "Restaurant Owner": User.UserType.OWNER,
        "Cashier": User.UserType.CASHIER, "Waiter": User.UserType.WAITER,
        "Chef": User.UserType.CHEF, "Inventory Manager": User.UserType.INVENTORY,
        "Accountant": User.UserType.ACCOUNTANT, "Manager": User.UserType.MANAGER,
        "HR Manager": User.UserType.HR, "Purchase Manager": User.UserType.PURCHASE,
    }
    if action == "delete":
        if not target:
            return Response({"deleted": True})
        if not _is_platform_admin(actor) and target.user_type in {User.UserType.OWNER, User.UserType.RESTAURANT_ADMIN}:
            return _error("This login cannot be deleted by this administrator", status.HTTP_403_FORBIDDEN)
        target.delete()
        row, _ = CloudState.objects.get_or_create(state_key="vestora-users", defaults={"state_value": []})
        current = row.state_value if isinstance(row.state_value, list) else []
        row.state_value = [entry for entry in current if str(entry.get("id")) != str(body.get("id")) and str(entry.get("email", "")).lower() != email]
        row.last_mutation_id = uuid.uuid4(); row.updated_by = actor; row.save()
        return Response({"deleted": True})
    name = str(body.get("name") or "").strip()
    app_role = str(body.get("role") or "Cashier")
    if not name or app_role == "Super Admin":
        return _error("Valid staff name and store role required")
    if not _is_platform_admin(actor) and app_role in {"Restaurant Admin", "Restaurant Owner"}:
        return _error("Super Admin permission required to manage administrator logins", status.HTTP_403_FORBIDDEN)
    password = str(body.get("password") or "")
    if not target and len(password) < 8:
        return _error("Use a password of at least 8 characters")
    if action == "create" and target:
        return _error("This email is already linked to a login", status.HTTP_409_CONFLICT)
    with transaction.atomic():
        if target is None:
            target = User(username=email, email=email, restaurant=actor.restaurant)
        target.email = email
        target.username = email
        parts = name.split(maxsplit=1)
        target.first_name = parts[0]
        target.last_name = parts[1] if len(parts) > 1 else ""
        target.user_type = role_map.get(app_role, User.UserType.CASHIER)
        target.is_active = str(body.get("status") or "Active").lower() == "active"
        if password:
            if len(password) < 8:
                return _error("Use a password of at least 8 characters")
            target.set_password(password)
        target.save()
        staff = _sanitize({
            "id": str(body.get("id") or target.pk), "name": name, "email": email,
            "storeId": store_id, "role": app_role, "status": body.get("status") or "Active",
            "authUserId": str(target.pk), "mobile": body.get("mobile"), "salary": body.get("salary"),
        })
        row, _ = CloudState.objects.select_for_update().get_or_create(state_key="vestora-users", defaults={"state_value": []})
        current = row.state_value if isinstance(row.state_value, list) else []
        matches = lambda entry: str(entry.get("id")) == str(staff["id"]) or str(entry.get("email", "")).lower() == email
        row.state_value = [staff if matches(entry) else entry for entry in current] if any(matches(entry) for entry in current) else current + [staff]
        row.last_mutation_id = uuid.uuid4(); row.updated_by = actor; row.save()
    return Response({"authUserId": str(target.pk), "staff": staff})


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def public_orders(request, order_id=None):
    if order_id:
        order = PublicOrder.objects.filter(pk=order_id).first()
        if not order:
            return _error("Record not found", status.HTTP_404_NOT_FOUND)
        if not _can_store(request.user, order.store_id):
            return _error("Store access denied", status.HTTP_403_FORBIDDEN)
        if request.method != "PATCH" or set(request.data) - {"status"}:
            return _error("Only order status may be updated")
        order.status = str(request.data.get("status") or order.status)[:40]
        order.save(update_fields=["status", "updated_at"])
        return Response(_public_order_payload(order))
    rows = PublicOrder.objects.all()
    store_id = request.query_params.get("storeId")
    if store_id:
        if not _can_store(request.user, store_id):
            return _error("Store access denied", status.HTTP_403_FORBIDDEN)
        rows = rows.filter(store_id=store_id)
    elif not _is_platform_admin(request.user):
        rows = rows.filter(store_id__in=_allowed_store_ids(request.user))
    if request.query_params.get("open") == "1":
        rows = rows.filter(status__in=["New", "KOT sent", "Ready for billing"])
    return Response([_public_order_payload(order) for order in rows[:100]])


def _public_order_payload(order):
    return {
        "id": str(order.pk), "order_number": order.order_number, "store_id": order.store_id,
        "table_id": order.table_id, "table_name": order.table_name, "floor": order.floor,
        "customer_name": order.customer_name, "customer_note": order.customer_note,
        "guest_count": order.guest_count, "items": order.items, "item_count": order.item_count,
        "subtotal": float(order.subtotal), "status": order.status,
        "created_at": order.created_at.isoformat(), "updated_at": order.updated_at.isoformat(),
    }


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def public_order(request, action):
    store_id = str(request.query_params.get("storeId") or request.data.get("storeId") or "")
    table_id = str(request.query_params.get("tableId") or request.data.get("tableId") or "")
    if not store_id:
        return _error("Store is required")
    menu_row = CloudState.objects.filter(state_key=f"vestora-menu-items-{store_id}").first()
    table_row = CloudState.objects.filter(state_key=f"vestora-tables-{store_id}").first()
    items = menu_row.state_value if menu_row and isinstance(menu_row.state_value, list) else []
    tables = table_row.state_value if table_row and isinstance(table_row.state_value, list) else []
    table = next((entry for entry in tables if isinstance(entry, dict) and str(entry.get("id")) == table_id), None)
    public_tables = [{key: entry.get(key) for key in ("id", "name", "floor", "seats")} for entry in tables if isinstance(entry, dict) and entry.get("status") != "Cleaning"]
    if action == "menu" and request.method == "GET":
        public_items = [{
            "id": item.get("id"), "name": item.get("name"), "category": item.get("category"),
            "price": float(item.get("price") or 0), "tax": float(item.get("tax") or 0), "status": "Active",
        } for item in items if isinstance(item, dict) and (item.get("status") or "Active") == "Active"]
        public_table = {key: table.get(key) for key in ("id", "name", "floor", "seats")} if table else None
        return Response({"table": public_table, "tables": public_tables, "items": public_items})
    if action != "orders" or request.method != "POST":
        return _error("Method not supported", status.HTTP_405_METHOD_NOT_ALLOWED)
    if not table:
        return _error("This table is not available for ordering", status.HTTP_404_NOT_FOUND)
    requested = request.data.get("items")
    if not isinstance(requested, list) or not requested:
        return _error("Choose at least one item")
    catalog = {str(item.get("id")): item for item in items if isinstance(item, dict)}
    validated = []
    for entry in requested:
        if not isinstance(entry, dict):
            continue
        source = catalog.get(str(entry.get("id")))
        if not source or (source.get("status") or "Active") != "Active":
            continue
        try:
            quantity = max(1, min(50, int(entry.get("qty") or 1)))
        except (TypeError, ValueError):
            continue
        validated.append({"id": source.get("id"), "name": source.get("name"), "price": float(source.get("price") or 0), "qty": quantity, "notes": str(entry.get("notes") or "")[:240]})
    if not validated:
        return _error("The selected items are no longer available")
    subtotal = sum(Decimal(str(item["price"])) * item["qty"] for item in validated)
    try:
        guest_count = max(1, min(int(table.get("seats") or 1), int(request.data.get("guestCount") or 1)))
    except (TypeError, ValueError):
        guest_count = 1
    order = PublicOrder.objects.create(
        order_number=f"QR-{uuid.uuid4().hex[:10].upper()}", store_id=store_id,
        table_id=str(table.get("id")), table_name=str(table.get("name") or ""), floor=str(table.get("floor") or "Main"),
        customer_name=(str(request.data.get("customerName") or "Guest").strip() or "Guest")[:120],
        customer_note=str(request.data.get("customerNote") or "").strip()[:240],
        guest_count=guest_count,
        items=validated, item_count=sum(item["qty"] for item in validated), subtotal=subtotal,
    )
    return Response({"orderNumber": order.order_number, "status": order.status}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def qz_sign(request):
    certificate = os.getenv("QZ_CERTIFICATE", "").replace("\\n", "\n").strip()
    kms_key_id = os.getenv("QZ_KMS_KEY_ID", "").strip()
    if not certificate or not kms_key_id:
        return _error("QZ signing is not configured", status.HTTP_503_SERVICE_UNAVAILABLE)
    if request.data.get("action") == "certificate":
        return Response({"certificate": certificate})
    text = request.data.get("request")
    if request.data.get("action") != "sign" or not isinstance(text, str) or not text:
        return _error("A QZ signing request is required")
    try:
        import boto3
        result = boto3.client("kms", region_name=os.getenv("AWS_REGION", "ap-south-1")).sign(
            KeyId=kms_key_id,
            Message=text.encode(),
            MessageType="RAW",
            SigningAlgorithm="RSASSA_PKCS1_V1_5_SHA_512",
        )
        return Response({"signature": base64.b64encode(result["Signature"]).decode()})
    except Exception:
        return _error("QZ signing failed", status.HTTP_401_UNAUTHORIZED)


def _delivery_row(store_id, provider):
    key = f"aws-delivery:{store_id}:{provider}"
    row, _ = CloudState.objects.get_or_create(state_key=key, defaults={"state_value": {}})
    if not isinstance(row.state_value, dict):
        row.state_value = {}
    return row


def _save_delivery_secret(store_id, provider, credentials):
    prefix = os.getenv("AWS_DELIVERY_SECRETS_PREFIX", "").strip("/")
    if not prefix:
        raise RuntimeError("AWS Secrets Manager is not configured for delivery credentials")
    import boto3
    client = boto3.client("secretsmanager", region_name=os.getenv("AWS_REGION", "ap-south-1"))
    name = f"{prefix}/{store_id}/{provider}"
    payload = credentials if isinstance(credentials, str) else json.dumps(credentials)
    try:
        client.put_secret_value(SecretId=name, SecretString=payload)
    except client.exceptions.ResourceNotFoundException:
        client.create_secret(Name=name, SecretString=payload)


def _delete_delivery_secret(store_id, provider):
    prefix = os.getenv("AWS_DELIVERY_SECRETS_PREFIX", "").strip("/")
    if not prefix:
        raise RuntimeError("AWS Secrets Manager is not configured for delivery credentials")
    import boto3
    client = boto3.client("secretsmanager", region_name=os.getenv("AWS_REGION", "ap-south-1"))
    try:
        client.delete_secret(SecretId=f"{prefix}/{store_id}/{provider}", RecoveryWindowInDays=7)
    except client.exceptions.ResourceNotFoundException:
        pass


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def delivery(request):
    body = request.data if isinstance(request.data, dict) else {}
    action = str(body.get("action") or "")
    store_id = str(body.get("storeId") or "").strip()
    provider = str(body.get("provider") or "").lower()
    if not store_id or store_id == "GLOBAL" or not _can_store(request.user, store_id):
        return _error("This branch is outside your account access", status.HTTP_403_FORBIDDEN)
    if provider not in {"zomato", "swiggy"}:
        return _error("Choose Zomato or Swiggy")
    can_manage = _is_platform_admin(request.user) or request.user.user_type in {
        User.UserType.OWNER, User.UserType.RESTAURANT_ADMIN, User.UserType.MANAGER,
    }
    if action != "config.get" and action != "mapping.list" and not can_manage:
        return _error("Restaurant administrator permission is required", status.HTTP_403_FORBIDDEN)
    row = _delivery_row(store_id, provider)
    data = dict(row.state_value)
    connection = data.get("connection")
    if action == "config.get":
        return Response({"connection": connection})
    if action == "config.save":
        outlet_id = str(body.get("outletId") or "").strip()
        mode = str(body.get("mode") or "")
        if not outlet_id or len(outlet_id) > 160:
            return _error("Enter a valid platform outlet ID")
        if mode not in {"test", "live"}:
            return _error("Choose test or live mode")
        credentials_configured = bool(connection and connection.get("credentialsConfigured"))
        credentials = body.get("credentials")
        if credentials:
            try:
                parsed = json.loads(credentials) if isinstance(credentials, str) else credentials
                if not isinstance(parsed, dict) or not parsed:
                    raise ValueError
                _save_delivery_secret(store_id, provider, parsed)
                credentials_configured = True
            except (ValueError, json.JSONDecodeError):
                return _error("Credentials must be a non-empty JSON object")
            except Exception as error:
                return _error(str(error), status.HTTP_503_SERVICE_UNAVAILABLE)
        if body.get("clearCredentials") is True:
            try:
                _delete_delivery_secret(store_id, provider)
                credentials_configured = False
            except Exception as error:
                return _error(str(error), status.HTTP_503_SERVICE_UNAVAILABLE)
        connection = {
            "id": connection.get("id") if connection else str(uuid.uuid4()),
            "storeId": store_id, "provider": provider, "outletId": outlet_id, "mode": mode,
            "status": "test_ready" if mode == "test" else "live_pending_approval",
            "settings": {"kotPrinter": str((body.get("settings") or {}).get("kotPrinter") or "")[:160], "currency": "INR"},
            "credentialsConfigured": credentials_configured, "updatedAt": timezone.now().isoformat(),
        }
        data["connection"] = connection
        data.setdefault("mappings", []); data.setdefault("orders", []); data.setdefault("logs", []); data.setdefault("jobs", [])
        data["logs"].insert(0, {"id": str(uuid.uuid4()), "event_type": "configuration_saved", "outcome": "success", "message": "Outlet mapping saved", "created_at": timezone.now().isoformat()})
        row.state_value = data; row.updated_by = request.user; row.last_mutation_id = uuid.uuid4(); row.save()
        return Response({"connection": connection})
    if not connection:
        return _error("Save this branch's outlet mapping first", status.HTTP_409_CONFLICT)
    mappings = list(data.get("mappings") or [])
    orders = list(data.get("orders") or [])
    logs = list(data.get("logs") or [])
    jobs = list(data.get("jobs") or [])
    if action == "mapping.list":
        return Response({"mappings": mappings, "orders": orders, "logs": logs, "jobs": jobs})
    if action == "mapping.save":
        value = body.get("mapping") or {}
        required = ("providerItemId", "providerItemName", "localItemId", "localItemName")
        if any(not str(value.get(key) or "").strip() for key in required):
            return _error("Map both platform and UVPRO menu items")
        try:
            addon_mapping = json.loads(value.get("addonMapping") or "{}") if isinstance(value.get("addonMapping"), str) else (value.get("addonMapping") or {})
            mapping = {
                "id": str(value.get("id") or uuid.uuid4()), "provider_item_id": str(value["providerItemId"]),
                "provider_item_name": str(value["providerItemName"]), "local_item_id": str(value["localItemId"]),
                "local_item_name": str(value["localItemName"]), "addon_mapping": addon_mapping,
                "gst_rate": float(value.get("gstRate") or 0), "provider_price": float(value.get("providerPrice") or 0),
                "online_stock": float(value.get("onlineStock") or 0), "is_available": value.get("isAvailable") is not False,
                "kot_printer": str(value.get("kotPrinter") or connection.get("settings", {}).get("kotPrinter") or "")[:160],
                "updated_at": timezone.now().isoformat(),
            }
        except (TypeError, ValueError, json.JSONDecodeError):
            return _error("Enter valid mapping values")
        mappings = [mapping if entry.get("id") == mapping["id"] or entry.get("provider_item_id") == mapping["provider_item_id"] else entry for entry in mappings]
        if not any(entry.get("id") == mapping["id"] or entry.get("provider_item_id") == mapping["provider_item_id"] for entry in data.get("mappings", [])):
            mappings.append(mapping)
        data["mappings"] = mappings
        row.state_value = data; row.updated_by = request.user; row.last_mutation_id = uuid.uuid4(); row.save()
        return Response({"mapping": mapping})
    if action == "mapping.delete":
        mapping_id = str(body.get("mappingId") or "")
        data["mappings"] = [entry for entry in mappings if str(entry.get("id")) != mapping_id]
        row.state_value = data; row.updated_by = request.user; row.last_mutation_id = uuid.uuid4(); row.save()
        return Response({"deleted": len(data["mappings"]) != len(mappings)})
    if action == "simulate":
        if connection.get("mode") != "test":
            return _error("Switch this outlet to test mode before simulating orders", status.HTTP_409_CONFLICT)
        source = body.get("order") or {}
        external_id = str(source.get("externalOrderId") or source.get("id") or f"SIM-{timezone.now().timestamp()}")
        duplicate = next((entry for entry in orders if entry.get("external_order_id") == external_id), None)
        if duplicate:
            return Response({"duplicate": True, "order": duplicate, "message": "Duplicate order ignored; no stock was deducted"})
        order = {
            "id": str(uuid.uuid4()), "external_order_id": external_id,
            "customer_label": str(source.get("customerLabel") or "Test customer"), "status": "received",
            "prep_minutes": None, "subtotal": float(source.get("subtotal") or 0), "currency": "INR",
            "items": source.get("items") or [], "kot_data": {}, "stock_deducted": False,
            "kot_print_status": "pending", "received_at": timezone.now().isoformat(), "updated_at": timezone.now().isoformat(),
        }
        orders.insert(0, order); data["orders"] = orders
        row.state_value = data; row.updated_by = request.user; row.last_mutation_id = uuid.uuid4(); row.save()
        return Response({"duplicate": False, "order": order, "stockIssue": None, "signatureValidated": True})
    if action in {"order.change", "order.print-result"}:
        order_id = str(body.get("orderId") or "")
        order = next((entry for entry in orders if str(entry.get("id")) == order_id), None)
        if not order:
            return _error("Delivery order not found in this branch", status.HTTP_404_NOT_FOUND)
        if action == "order.change":
            order["status"] = str(body.get("status") or order.get("status"))
            order["prep_minutes"] = body.get("prepMinutes") or order.get("prep_minutes")
        else:
            order["kot_print_status"] = str(body.get("printStatus") or "failed")
        order["updated_at"] = timezone.now().isoformat(); data["orders"] = orders
        row.state_value = data; row.updated_by = request.user; row.last_mutation_id = uuid.uuid4(); row.save()
        return Response({"order": order, "providerSync": "test_acknowledged" if connection.get("mode") == "test" else "pending_approval"})
    if action == "stock.change":
        mapping = next((entry for entry in mappings if str(entry.get("id")) == str(body.get("mappingId") or "")), None)
        if not mapping:
            return _error("Menu item mapping not found for this branch", status.HTTP_404_NOT_FOUND)
        mapping["is_available"] = body.get("isAvailable") is True; data["mappings"] = mappings
        row.state_value = data; row.updated_by = request.user; row.last_mutation_id = uuid.uuid4(); row.save()
        return Response({"mapping": mapping, "providerSync": "test_acknowledged" if connection.get("mode") == "test" else "pending_approval"})
    if action == "job.retry":
        job = next((entry for entry in jobs if str(entry.get("id")) == str(body.get("jobId") or "")), None)
        if not job:
            return _error("Retry job not found in this branch", status.HTTP_404_NOT_FOUND)
        job["attempt_count"] = int(job.get("attempt_count") or 0) + 1
        job["status"] = "succeeded" if connection.get("mode") == "test" else "blocked"
        data["jobs"] = jobs; row.state_value = data; row.updated_by = request.user; row.last_mutation_id = uuid.uuid4(); row.save()
        return Response({"job": job, "message": "Retry processed"})
    return _error("Unsupported delivery action")
