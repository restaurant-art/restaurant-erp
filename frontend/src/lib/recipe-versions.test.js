import test from "node:test";
import assert from "node:assert/strict";
import { createNextRecipeVersion, listRecipeVersions, removeRecipeVersion } from "./recipe-versions.js";

const recipe = {
  id: "REC-1",
  name: "Biryani",
  version: 2,
  ingredients: [{ name: "Rice", qty: 250, unit: "g" }],
  versions: [
    { id: "REC-1", name: "Biryani", version: 1, ingredients: [{ name: "Rice", qty: 200, unit: "g" }] },
  ],
};

test("lists every recipe version newest first", () => {
  assert.deepEqual(listRecipeVersions(recipe).map((snapshot) => snapshot.version), [2, 1]);
});

test("editing any snapshot creates a new latest version without losing history", () => {
  const editedOldVersion = { ...recipe.versions[0], ingredients: [{ name: "Rice", qty: 225, unit: "g" }] };
  const saved = createNextRecipeVersion(recipe, editedOldVersion);
  assert.equal(saved.version, 3);
  assert.equal(saved.ingredients[0].qty, 225);
  assert.deepEqual(saved.versions.map((snapshot) => snapshot.version), [2, 1]);
});

test("deleting the latest version promotes the previous version", () => {
  const promoted = removeRecipeVersion(recipe, 2);
  assert.equal(promoted.version, 1);
  assert.deepEqual(promoted.versions, []);
});

test("deleting a historical version keeps the current version", () => {
  const current = removeRecipeVersion(recipe, 1);
  assert.equal(current.version, 2);
  assert.deepEqual(current.versions, []);
});

test("deleting the only version removes the recipe", () => {
  assert.equal(removeRecipeVersion({ ...recipe, version: 1, versions: [] }, 1), null);
});
