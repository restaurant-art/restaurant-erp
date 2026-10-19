"""Separate manual-punch capability from access to the employee face kiosk."""


def can_record_manual_attendance(access, store_id):
    if access["platform_admin"] or access["user"].user_type in ("owner", "restaurant_admin"):
        return True
    linked = access.get("linked") or {}
    if str(linked.get("storeId", "")) not in (store_id, "GLOBAL"):
        return False
    roles = [role for role in access.get("roles", []) if role.get("name") == linked.get("role")]
    role = next((role for role in roles if role.get("storeId") == store_id), None)
    if role is None:
        role = next((role for role in roles if role.get("storeId") == "GLOBAL"), {})
    return (role.get("status") != "Inactive" and "attendance" in (role.get("modules") or [])
            and "attendance.manual" in (role.get("permissions") or []))


def changes_manual_attendance(previous, requested):
    """Ignore unchanged legacy rows and allow a normal face checkout after manual in."""
    if not isinstance(requested, list):
        return True
    old_rows = {row.get("id"): row for row in (previous or []) if isinstance(row, dict)}
    new_rows = {row.get("id"): row for row in requested if isinstance(row, dict)}
    if len(new_rows) != len(requested):
        return True
    for row_id in old_rows.keys() | new_rows.keys():
        old, new = old_rows.get(row_id), new_rows.get(row_id)
        if old == new:
            continue
        if new and new.get("source") == "manual":
            return True
        if old and old.get("source") == "manual":
            allowed_fields = {"checkOut", "source", "confidence", "deviceId", "status"}
            face_checkout = (new and new.get("source") == "face" and not old.get("checkOut")
                             and new.get("checkOut") and
                             all(old.get(key) == new.get(key) for key in old.keys() | new.keys()
                                 if key not in allowed_fields))
            if not face_checkout:
                return True
    return False
