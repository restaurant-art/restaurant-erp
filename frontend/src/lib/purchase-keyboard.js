export const purchaseEditableFields = 'input:not(:disabled):not([readonly]):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled):not([readonly]), button[role="combobox"]:not(:disabled)';
const editableFields = purchaseEditableFields;
const visibleFields = (container) => Array.from(container.querySelectorAll(editableFields))
  .filter((field) => field.getClientRects().length > 0);

export function handlePurchaseArrowNavigation(event, { rowSelector = '.purchase-line-card', gridSelector = '.purchase-line-grid' } = {}) {
  const { key, target } = event;
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent?.isComposing) return;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key) || !target.matches(editableFields)) return;
  const vertical = key === "ArrowUp" || key === "ArrowDown";
  if (target.type === "date" || target.tagName === "TEXTAREA") return;
  // Leave native select choices and the searchable item's list to their controls.
  if (vertical && (target.tagName === "SELECT" || target.getAttribute("aria-expanded") === "true")) return;
  if (!vertical && target.selectionStart !== null && target.selectionStart !== undefined) {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (start !== end) return;
    if (key === "ArrowLeft" && start > 0) return;
    if (key === "ArrowRight" && end < target.value.length) return;
  }
  const direction = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  let next;
  const row = target.closest(rowSelector);
  const grid = target.closest(gridSelector);
  if (vertical && row && grid) {
    const rows = Array.from(event.currentTarget.querySelectorAll(rowSelector));
    const nextRow = rows[rows.indexOf(row) + direction];
    const column = visibleFields(grid).indexOf(target);
    const nextGrid = nextRow?.matches(gridSelector) ? nextRow : nextRow?.querySelector(gridSelector);
    if (nextGrid) next = visibleFields(nextGrid)[column];
  } else {
    const fields = visibleFields(event.currentTarget);
    const index = fields.indexOf(target);
    if (index < 0) return;
    next = fields[index + direction];
  }
  // Arrows navigate purchase cells; they must not increment quantity or price.
  event.preventDefault();
  next?.focus();
}
