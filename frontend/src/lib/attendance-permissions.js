export const MANUAL_ATTENDANCE_PERMISSION = "attendance.manual";

export function canRecordManualAttendance({ isAdmin, roles = [], roleName, storeId }) {
  if (isAdmin) return true;
  const candidates = roles.filter((role) => role.name === roleName);
  const role = candidates.find((entry) => entry.storeId === storeId)
    || candidates.find((entry) => entry.storeId === "GLOBAL");
  return Boolean(role && role.status !== "Inactive"
    && role.modules?.includes("attendance")
    && role.permissions?.includes(MANUAL_ATTENDANCE_PERMISSION));
}
