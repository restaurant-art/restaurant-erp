export function newProductionRecipe(newKey = () => crypto.randomUUID()) {
  const row = () => ({ item: "", quantity: "", unit: "", weight: "1" });
  return { key: newKey(), name: "", inputs: [row()], outputs: [row()], instructions: "", normal_loss_reference: "", expected_version: 0 };
}

const draftKey = (storeId) => `uvpro-production-recipe-draft-${encodeURIComponent(storeId)}`;

export function loadProductionRecipeDraft(storage, storeId) {
  if (!storage || !storeId) return null;
  try {
    const draft = JSON.parse(storage.getItem(draftKey(storeId)) || "null");
    if (!draft || typeof draft.key !== "string" || !draft.key || typeof draft.name !== "string"
      || ![draft.inputs, draft.outputs].every((rows) => Array.isArray(rows)
        && rows.every((row) => row && typeof row === "object" && !Array.isArray(row)))) return null;
    return draft;
  } catch { return null; }
}

export function saveProductionRecipeDraft(storage, storeId, draft) {
  if (!storage || !storeId) return false;
  try {
    if (draft) storage.setItem(draftKey(storeId), JSON.stringify(draft));
    else storage.removeItem(draftKey(storeId));
    return true;
  } catch { return false; }
}

export function productionRecipePayload(draft) {
  if (!draft.name.trim()) throw new Error("Enter a recipe name.");
  for (const [field, label] of [["inputs", "Standard ingredients"], ["outputs", "Expected good outputs"]]) {
    if (!draft[field].length) throw new Error(`Add at least one row to ${label.toLowerCase()}.`);
    const selected = new Set();
    for (const [index, row] of draft[field].entries()) {
      if (!row.item) throw new Error(`${label}, row ${index + 1}: choose a stock item.`);
      if (!Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0) throw new Error(`${label}, row ${index + 1}: enter a quantity greater than zero.`);
      if (selected.has(String(row.item))) throw new Error(`${label}: combine duplicate stock items into one row.`);
      selected.add(String(row.item));
    }
  }
  const outputs = draft.outputs.map((row, index) => {
    const weight = String(row.weight ?? "").trim() || "1";
    if (!Number.isFinite(Number(weight)) || Number(weight) < 0) throw new Error(`Expected good outputs, row ${index + 1}: enter a valid cost weight of zero or greater.`);
    return { ...row, weight };
  });
  if (!outputs.some((row) => Number(row.weight) > 0)) throw new Error("Set a positive shared cost weight for at least one output. Use 1 for a single output.");
  return { ...draft, outputs, name: draft.name.trim(), kind: "production" };
}
