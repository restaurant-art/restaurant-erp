import test from "node:test";
import assert from "node:assert/strict";
import { newProductionRecipe, productionRecipePayload, loadProductionRecipeDraft, saveProductionRecipeDraft } from "./production-recipe-editor.js";
import { createProductionTransport } from "./production-transport.js";

const filled = () => ({ ...newProductionRecipe(() => "recipe-1"), name: " Chapathi ",
  inputs: [{ item: "1", quantity: "2", unit: "kg" }], outputs: [{ item: "2", quantity: "45", unit: "piece", weight: "1" }] });

test("a new recipe keeps its identity across edits and resubmission", () => {
  const draft = filled();
  assert.equal(productionRecipePayload(draft).key, "recipe-1");
  assert.equal(productionRecipePayload({ ...draft, instructions: "Cook" }).key, "recipe-1");
  assert.equal(productionRecipePayload(draft).name, "Chapathi");
  assert.equal(productionRecipePayload(draft).kind, "production");
  assert.equal(productionRecipePayload(draft).expected_version, 0);
});

test("invalid recipe rows explain the missing data before sending a request", () => {
  const draft = filled();
  assert.throws(() => productionRecipePayload({ ...draft, name: "  " }), /recipe name/);
  assert.throws(() => productionRecipePayload({ ...draft, inputs: [] }), /standard ingredients/);
  assert.throws(() => productionRecipePayload({ ...draft, outputs: [] }), /expected good outputs/);
  assert.throws(() => productionRecipePayload({ ...draft, inputs: [{ item: "", quantity: "2" }] }), /choose a stock item/);
  for (const quantity of ["", "0", "-1", "NaN", "Infinity"]) {
    assert.throws(() => productionRecipePayload({ ...draft, outputs: [{ item: "2", quantity }] }), /greater than zero/);
  }
  assert.throws(() => productionRecipePayload({ ...draft, inputs: [...draft.inputs, ...draft.inputs] }), /duplicate/);
});

test("a lost recipe acknowledgement can retry without creating another recipe", async () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  const posted = new Map(); let lose = true;
  const transport = createProductionTransport({ storage, newKey: () => "operation-1", send: async (store, command, data, key) => {
    if (!posted.has(key)) posted.set(key, { ...data, version: 1 });
    if (lose) { lose = false; throw new Error("Connection lost"); }
    return posted.get(key);
  } });
  const draft = filled();
  await assert.rejects(transport.execute("A", "recipe", productionRecipePayload(draft), "workspace"), /Connection lost/);
  const saved = await transport.execute("A", "recipe", productionRecipePayload(draft), "workspace");
  assert.equal(posted.size, 1);
  assert.equal(saved.key, draft.key);
  assert.equal(saved.version, 1);
  assert.equal(transport.pending("A", "workspace"), null);
});

test("saving an existing recipe sends its current version without changing its key", () => {
  const payload = productionRecipePayload({ ...filled(), expected_version: 3 });
  assert.equal(payload.key, "recipe-1");
  assert.equal(payload.expected_version, 3);
});

const draftStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};

test("recipe entries survive leaving the editor without becoming a saved production recipe", () => {
  const storage = draftStorage();
  const draft = { ...filled(), name: "Masala Rice", outputs: [{ item: "16", quantity: "", unit: "g", weight: "" }] };
  assert.equal(saveProductionRecipeDraft(storage, "branch-a", draft), true);
  const restored = loadProductionRecipeDraft(storage, "branch-a");
  assert.deepEqual(restored, draft);
  assert.equal(restored.expected_version, 0);
  assert.throws(() => productionRecipePayload(restored), /greater than zero/);
  assert.equal(loadProductionRecipeDraft(storage, "branch-b"), null);
  saveProductionRecipeDraft(storage, "branch-a", null);
  assert.equal(loadProductionRecipeDraft(storage, "branch-a"), null);
});

test("saved draft identity and expected version survive remount for safe recipe edits", () => {
  const storage = draftStorage();
  const saved = { ...filled(), id: 10, version: 3, expected_version: 3 };
  saveProductionRecipeDraft(storage, "branch-a", saved);
  const payload = productionRecipePayload(loadProductionRecipeDraft(storage, "branch-a"));
  assert.equal(payload.key, saved.key);
  assert.equal(payload.expected_version, 3);
});

test("unavailable storage and damaged drafts do not stop recipe editing", () => {
  const broken = { getItem: () => { throw new Error("Storage blocked"); }, setItem: () => { throw new Error("Storage full"); } };
  assert.equal(loadProductionRecipeDraft(broken, "branch-a"), null);
  assert.equal(saveProductionRecipeDraft(broken, "branch-a", filled()), false);
  assert.equal(loadProductionRecipeDraft(null, "branch-a"), null);
  for (const value of ["broken", "null", "{}", JSON.stringify({ ...filled(), outputs: [null] })]) {
    assert.equal(loadProductionRecipeDraft({ getItem: () => value }, "branch-a"), null);
  }
});

test("Masala Rice retains the confirmed quantities and uses cost weight 1 if left blank", () => {
  const draft = { ...newProductionRecipe(() => "masala-rice"), name: "Masala Rice",
    inputs: [{ item: "15", quantity: "1000", unit: "g" }, { item: "14", quantity: "30", unit: "g" }],
    outputs: [{ item: "16", quantity: "1500", unit: "g", weight: "" }] };
  const payload = productionRecipePayload(draft);
  assert.deepEqual(payload.inputs, draft.inputs);
  assert.deepEqual(payload.outputs, [{ item: "16", quantity: "1500", unit: "g", weight: "1" }]);
  assert.equal(draft.outputs[0].weight, "");
});

test("invalid cost weights are explained before a save request is sent", () => {
  for (const weight of ["-1", "NaN", "Infinity"]) {
    assert.throws(() => productionRecipePayload({ ...filled(), outputs: [{ item: "2", quantity: "10", unit: "g", weight }] }), /valid cost weight/);
  }
  assert.throws(() => productionRecipePayload({ ...filled(), outputs: [{ item: "2", quantity: "10", unit: "g", weight: "0" }] }), /positive shared cost weight/);
});
