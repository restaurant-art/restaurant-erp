import hashlib
import json
import uuid
from decimal import Decimal

from django.contrib.auth import authenticate, get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import PublicOrder, SharedAppState, SyncOperation


User = get_user_model()

GLOBAL_KEYS = {
    "vestora-stores", "vestora-users", "vestora-custom-roles",
    "vestora-sales-ledger", "vestora-void-ledger", "vestora-refund-ledger",
    "vestora-kds-orders", "vestora-table-orders", "vestora-supplier-orders",
}
STORE_PREFIXES = (
    "active-settings", "attendance-employees", "attendance-logs", "attendance-records",
    "attendance-report", "attendance-settings", "finance-bank-accounts", "finance-expenses",
    "finance-journals", "finance-ledgers", "finance-receipts", "finance-vendor-payments",
    "finished-goods", "floors", "food-stock", "inventory-categories", "inventory-transactions",
    "inventory", "last-shift-close", "shifts", "shift-history", "leave-requests", "menu-items",
    "menu-setup", "offers", "payroll-attendance", "production-batches", "production-categories",
    "production-wastage", "recipes", "tables", "bill-template", "theme-config",
    "supplier-documents", "customer-details",
)
ROLE_LABELS = {
    "super_admin": "Super Admin", "owner": "Restaurant Owner",
    "restaurant_admin": "Restaurant Admin", "branch_manager": "Branch Manager",
    "manager": "Manager", "cashier": "Cashier", "waiter": "Waiter",
    "kitchen_staff": "Chef", "chef": "Chef", "inventory_manager": "Inventory Manager",
    "purchase_manager": "Purchase Manager", "hr_manager": "HR Manager",
    "accountant": "Accountant", "delivery_boy": "Delivery Boy", "customer": "Customer",
}
ROLE_TYPES = {label: value for value, label in ROLE_LABELS.items()}


def _json_error(message, status=400):
    return Response({"error": message}, status=status)


def _strip_secrets(value):
    if isinstance(value, list):
        return [_strip_secrets(item) for item in value]
    if isinstance(value, dict):
        blocked = ("password", "token", "credential", "secret", "accesskey", "access_key", "apikey", "api_key")
        return {
            key: _strip_secrets(entry)
            for key, entry in value.items()
            if not any(part in key.lower().replace("-", "_") for part in blocked)
        }
    return value


def _state_value(key, default=None):
    row = SharedAppState.objects.filter(state_key=key).first()
    return row.state_value if row else default


def _state_store(key):
    for prefix in STORE_PREFIXES:
        marker = f"vestora-{prefix}-"
        if key.startswith(marker):
            return key[len(marker):]
    return None


def _business_key(key):
    return key in GLOBAL_KEYS or _state_store(key) is not None


def _access(request):
    user = request.user
    directory = _state_value("vestora-stores", []) or []
    staff = _state_value("vestora-users", []) or []
    roles = _state_value("vestora-custom-roles", []) or []
    email = (user.email or "").lower()
    linked = next((entry for entry in staff if str(entry.get("email", "")).lower() == email and str(entry.get("status", "Active")).lower() == "active"), None)
    platform_admin = bool(user.is_superuser or user.user_type == "super_admin")
    assigned_store = str((linked or {}).get("storeId") or "")
    allowed = [
        str(store.get("id")) for store in directory
        if platform_admin
        or str(store.get("id")) == assigned_store
        or str(store.get("adminEmail", "")).lower() == email
        or (user.restaurant_id is not None and str(store.get("restaurantId", "")) == str(user.restaurant_id))
    ]
    return {
        "user": user, "directory": directory, "staff": staff, "roles": roles,
        "linked": linked, "platform_admin": platform_admin,
        "assigned_store": assigned_store, "allowed": allowed,
    }


def _can_store(access, store_id):
    return access["platform_admin"] or str(store_id) in access["allowed"]


def _can_key(access, key):
    store_id = _state_store(key)
    return _business_key(key) and (not store_id or _can_store(access, store_id))


def _scope_value(access, key, value):
    if access["platform_admin"] or _state_store(key) or not isinstance(value, list):
        return value
    return [
        item for item in value
        if _can_store(access, item.get("id") if key == "vestora-stores" else item.get("storeId", ""))
    ]


def _profile(access):
    user = access["user"]
    store_id = access["assigned_store"] or (access["allowed"][0] if access["allowed"] else "GLOBAL")
    store = next((entry for entry in access["directory"] if str(entry.get("id")) == store_id), {})
    expires = str(store.get("subscriptionExpiresAt", ""))[:10] or None
    expired = bool(not access["platform_admin"] and expires and expires < timezone.localdate().isoformat())
    return {
        "id": user.pk, "email": user.email, "restaurantId": user.restaurant_id,
        "role": user.user_type, "appRole": ROLE_LABELS.get(user.user_type, user.user_type),
        "isSuperuser": user.is_superuser, "status": "Active", "storeId": store_id,
        "allowedStoreIds": access["allowed"], "subscriptionExpiresAt": expires,
        "subscriptionExpired": expired,
    }


def _session_user(user):
    profile = _profile({
        "user": user, "directory": _state_value("vestora-stores", []) or [],
        "staff": _state_value("vestora-users", []) or [], "roles": [],
        "linked": None, "platform_admin": bool(user.is_superuser or user.user_type == "super_admin"),
        "assigned_store": "", "allowed": [],
    })
    return {
        "id": str(user.pk), "email": user.email,
        "user_metadata": {"name": user.get_full_name() or user.email},
        "app_metadata": {"vestora": {
            "role": user.user_type, "appRole": profile["appRole"],
            "storeId": profile["storeId"], "active": user.is_active,
        }},
    }


@api_view(["POST"])
@permission_classes([AllowAny])
def cloud_login(request):
    email = str(request.data.get("email", "")).strip().lower()
    password = str(request.data.get("password", ""))
    account = User.objects.filter(email__iexact=email, is_active=True).first()
    if not account:
        return _json_error("Incorrect email or password", 401)
    user = authenticate(request, username=account.username, password=password)
    if not user:
        return _json_error("Incorrect email or password", 401)
    refresh = RefreshToken.for_user(user)
    return Response({"access": str(refresh.access_token), "refresh": str(refresh), "user": _session_user(user)})


@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def cloud_password(request):
    password = str(request.data.get("password", ""))
    if len(password) < 8:
        return _json_error("Use a password of at least 8 characters")
    request.user.set_password(password)
    request.user.save(update_fields=["password"])
    return Response({"updated": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def cloud_profile(request):
    return Response(_profile(_access(request)))


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def cloud_state(request):
    access = _access(request)
    if request.method == "GET":
        key = request.query_params.get("key")
        requested_store = request.query_params.get("storeId")
        if key and not _can_key(access, key):
            return _json_error("Store access denied", 403)
        if requested_store and not _can_store(access, requested_store):
            return _json_error("Store access denied", 403)
        rows = SharedAppState.objects.all()
        if key:
            rows = rows.filter(state_key=key)
        result = []
        for row in rows:
            if not _can_key(access, row.state_key):
                continue
            row_store = _state_store(row.state_key)
            if requested_store and row_store and row_store != requested_store:
                continue
            result.append({
                "state_key": row.state_key,
                "state_value": _strip_secrets(_scope_value(access, row.state_key, row.state_value)),
                "updated_at": row.updated_at.isoformat(),
            })
        return Response(result)

    key = request.data.get("key")
    if not isinstance(key, str) or not _business_key(key):
        return _json_error("A supported business state key is required")
    if not _can_key(access, key):
        return _json_error("Store access denied", 403)
    manages_staff = access["platform_admin"] or request.user.user_type in ("owner", "restaurant_admin")
    if key in ("vestora-users", "vestora-custom-roles") and not manages_staff:
        return _json_error("Administrator permission required", 403)
    if "expectedUpdatedAt" not in request.data:
        return _json_error("Refresh this app to save shared data safely", 409)
    try:
        operation_id = uuid.UUID(str(request.data.get("mutationId")))
    except (TypeError, ValueError):
        return _json_error("Refresh this app to enable reliable store synchronization", 409)
    requested_value = _strip_secrets(request.data.get("value"))
    fingerprint = hashlib.sha256(json.dumps({
        "key": key, "value": requested_value,
        "expected": request.data.get("expectedUpdatedAt"),
    }, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    actor_id = str(request.user.pk)
    previous_operation = SyncOperation.objects.filter(actor_id=actor_id, operation_id=operation_id).first()
    if previous_operation:
        if previous_operation.request_hash != fingerprint:
            return _json_error("Mutation identifier was already used", 409)
        return Response(previous_operation.result)

    with transaction.atomic():
        row = SharedAppState.objects.select_for_update().filter(state_key=key).first()
        expected = request.data.get("expectedUpdatedAt")
        current_version = row.updated_at.isoformat() if row else None
        if current_version != expected:
            return _json_error("Data changed on another device; retry with the latest version", 409)
        value = requested_value
        if not access["platform_admin"] and key in GLOBAL_KEYS:
            if not isinstance(value, list):
                return _json_error("Expected a list of store records")
            if any(not _can_store(access, item.get("id") if key == "vestora-stores" else item.get("storeId", "")) for item in value):
                return _json_error("Cannot change records from another store", 403)
            old = row.state_value if row and isinstance(row.state_value, list) else []
            value = value + [item for item in old if not _can_store(access, item.get("id") if key == "vestora-stores" else item.get("storeId", ""))]
        if not row:
            row = SharedAppState(state_key=key)
        row.state_value = value
        row.updated_at = timezone.now()
        row.save()
        result = {
            "state_key": row.state_key,
            "state_value": _scope_value(access, key, row.state_value),
            "updated_at": row.updated_at.isoformat(),
        }
        try:
            SyncOperation.objects.create(actor_id=actor_id, operation_id=operation_id, request_hash=fingerprint, result=result)
        except IntegrityError:
            pass
    return Response(result)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cashier_login(request):
    access = _access(request)
    email = str(request.data.get("email", "")).strip().lower()
    cashier = next((entry for entry in access["staff"] if str(entry.get("email", "")).lower() == email and str(entry.get("status", "Active")).lower() == "active"), None)
    if not cashier or not _can_store(access, cashier.get("storeId", "")):
        return _json_error("Cashier is not available in this store", 403)
    account = User.objects.filter(email__iexact=email, is_active=True).first()
    if not account or not authenticate(request, username=account.username, password=str(request.data.get("password", ""))):
        return _json_error("Incorrect cashier sign-in details", 403)
    return Response(_strip_secrets(cashier))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def staff_account(request):
    access = _access(request)
    if not (access["platform_admin"] or request.user.user_type in ("owner", "restaurant_admin")):
        return _json_error("Administrator permission required", 403)
    action = str(request.data.get("action", "create"))
    email = str(request.data.get("email", "")).strip().lower()
    store_id = str(request.data.get("storeId", ""))
    if "@" not in email:
        return _json_error("Valid staff email required")
    if email == (request.user.email or "").lower():
        return _json_error("You cannot change or deactivate the account currently signed in")
    if not _can_store(access, store_id):
        return _json_error("Store access denied", 403)
    account = User.objects.filter(email__iexact=email).first()
    if action == "delete":
        if account and (account.is_superuser or account.user_type == "super_admin"):
            return _json_error("Super Admin accounts cannot be deleted", 403)
        if account:
            account.delete()
        staff = [entry for entry in access["staff"] if str(entry.get("email", "")).lower() != email and str(entry.get("id", "")) != str(request.data.get("id", ""))]
        SharedAppState.objects.update_or_create(state_key="vestora-users", defaults={"state_value": staff, "updated_at": timezone.now()})
        return Response({"deleted": True})

    name = str(request.data.get("name", "")).strip()
    role_label = str(request.data.get("role", "Cashier"))
    password = str(request.data.get("password", ""))
    if not name or role_label == "Super Admin":
        return _json_error("Valid staff name and store role required")
    if not account and len(password) < 8:
        return _json_error("Use a password of at least 8 characters")
    if account and (account.is_superuser or account.user_type == "super_admin"):
        return _json_error("Super Admin accounts cannot be reassigned", 403)
    account = account or User(username=email, email=email)
    account.email = email
    account.username = email
    account.first_name = name
    account.user_type = ROLE_TYPES.get(role_label, "cashier")
    account.is_active = str(request.data.get("status", "Active")).lower() == "active"
    if password:
        account.set_password(password)
    account.save()
    record = _strip_secrets({
        "id": request.data.get("id") or str(uuid.uuid4()), "name": name, "email": email,
        "storeId": store_id, "role": role_label, "status": request.data.get("status", "Active"),
        "authUserId": str(account.pk), "mobile": request.data.get("mobile", ""),
        "salary": request.data.get("salary", 0),
    })
    staff = list(access["staff"])
    index = next((i for i, entry in enumerate(staff) if str(entry.get("id")) == str(record["id"]) or str(entry.get("email", "")).lower() == email), None)
    if index is None:
        staff.append(record)
    else:
        staff[index] = {**staff[index], **record}
    SharedAppState.objects.update_or_create(state_key="vestora-users", defaults={"state_value": staff, "updated_at": timezone.now()})
    return Response({"authUserId": str(account.pk), "staff": record})


def _public_order_dict(order):
    return {
        "id": str(order.id), "order_number": order.order_number, "store_id": order.store_id,
        "table_id": order.table_id, "table_name": order.table_name, "floor": order.floor,
        "customer_name": order.customer_name, "customer_note": order.customer_note,
        "guest_count": order.guest_count, "items": order.items, "item_count": order.item_count,
        "subtotal": float(order.subtotal), "status": order.status,
        "created_at": order.created_at.isoformat(), "updated_at": order.updated_at.isoformat(),
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def public_menu(request):
    store_id = request.query_params.get("storeId", "")
    table_id = request.query_params.get("tableId", "")
    if not store_id:
        return _json_error("Store is required")
    items = _state_value(f"vestora-menu-items-{store_id}", []) or []
    tables = _state_value(f"vestora-tables-{store_id}", []) or []
    table = next((entry for entry in tables if str(entry.get("id")) == table_id), None) if table_id else None
    clean_table = lambda entry: {key: entry.get(key) for key in ("id", "name", "floor", "seats")}
    return Response({
        "table": clean_table(table) if table else None,
        "tables": [clean_table(entry) for entry in tables if entry.get("status") != "Cleaning"],
        "items": [{
            "id": item.get("id"), "name": item.get("name"), "category": item.get("category"),
            "price": float(item.get("price") or 0), "tax": float(item.get("tax") or 0), "status": "Active",
        } for item in items if item.get("status", "Active") == "Active"],
    })


@api_view(["POST"])
@permission_classes([AllowAny])
def public_order_create(request):
    store_id = request.query_params.get("storeId", "") or str(request.data.get("storeId", ""))
    table_id = request.query_params.get("tableId", "") or str(request.data.get("tableId", ""))
    if not store_id:
        return _json_error("Store is required")
    items = _state_value(f"vestora-menu-items-{store_id}", []) or []
    tables = _state_value(f"vestora-tables-{store_id}", []) or []
    table = next((entry for entry in tables if str(entry.get("id")) == table_id and entry.get("status") != "Cleaning"), None)
    if not table:
        return _json_error("This table is not available for ordering", 404)
    requested = request.data.get("items")
    if not isinstance(requested, list) or not requested:
        return _json_error("Choose at least one item")
    catalog = {str(item.get("id")): item for item in items}
    validated = []
    for entry in requested:
        source = catalog.get(str(entry.get("id")))
        if not source or source.get("status", "Active") != "Active":
            continue
        qty = max(1, min(50, int(entry.get("qty") or 1)))
        validated.append({
            "id": source.get("id"), "name": source.get("name"),
            "price": float(source.get("price") or 0), "qty": qty,
            "notes": str(entry.get("notes", ""))[:240],
        })
    if not validated:
        return _json_error("The selected items are no longer available")
    order_number = f"QR-{str(int(timezone.now().timestamp() * 1000))[-8:]}"
    subtotal = sum(Decimal(str(item["price"])) * item["qty"] for item in validated)
    order = PublicOrder.objects.create(
        order_number=order_number, store_id=store_id, table_id=str(table.get("id")),
        table_name=str(table.get("name", "")), floor=str(table.get("floor", "Main")),
        customer_name=(str(request.data.get("customerName", "Guest")).strip() or "Guest")[:60],
        customer_note=str(request.data.get("customerNote", "")).strip()[:240],
        guest_count=max(1, min(int(table.get("seats") or 1), int(request.data.get("guestCount") or 1))),
        items=validated, item_count=sum(item["qty"] for item in validated), subtotal=subtotal,
    )
    return Response({"orderNumber": order.order_number, "status": order.status}, status=201)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def public_orders(request, order_id=None):
    access = _access(request)
    if order_id:
        order = PublicOrder.objects.filter(pk=order_id).first()
        if not order:
            return _json_error("Record not found", 404)
        if not _can_store(access, order.store_id):
            return _json_error("Store access denied", 403)
        if request.method == "PATCH":
            if set(request.data.keys()) - {"status"}:
                return _json_error("Only order status may be updated")
            order.status = str(request.data.get("status", order.status))
            order.save(update_fields=["status", "updated_at"])
        return Response(_public_order_dict(order))
    if request.method != "GET":
        return _json_error("Method not supported", 405)
    queryset = PublicOrder.objects.all()
    if not access["platform_admin"]:
        queryset = queryset.filter(store_id__in=access["allowed"])
    if request.query_params.get("storeId"):
        queryset = queryset.filter(store_id=request.query_params["storeId"])
    if request.query_params.get("open") == "1":
        queryset = queryset.filter(status__in=("New", "KOT sent", "Ready for billing"))
    return Response([_public_order_dict(order) for order in queryset[:100]])


@api_view(["GET", "POST", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def unsupported_cloud_feature(request, feature):
    return _json_error(f"{feature} is not configured on AWS yet", 501)
