function cloneRecipeSnapshot(recipe) {
  if (!recipe) return null;
  const { versions: _versions, ...snapshot } = recipe;
  return {
    ...snapshot,
    ingredients: Array.isArray(snapshot.ingredients)
      ? snapshot.ingredients.map((ingredient) => ({ ...ingredient }))
      : [],
  };
}

export function listRecipeVersions(recipe) {
  if (!recipe) return [];
  const snapshots = [cloneRecipeSnapshot(recipe), ...(Array.isArray(recipe.versions) ? recipe.versions.map(cloneRecipeSnapshot) : [])];
  const byVersion = new Map();
  snapshots.forEach((snapshot) => {
    const version = Number(snapshot?.version);
    if (!snapshot || !Number.isFinite(version) || version < 1 || byVersion.has(version)) return;
    byVersion.set(version, { ...snapshot, id: recipe.id, version });
  });
  return Array.from(byVersion.values()).sort((left, right) => right.version - left.version);
}

export function createNextRecipeVersion(currentRecipe, draft) {
  const history = listRecipeVersions(currentRecipe);
  const nextVersion = history.reduce((highest, snapshot) => Math.max(highest, snapshot.version), 0) + 1;
  return {
    ...cloneRecipeSnapshot(draft),
    id: currentRecipe.id,
    version: nextVersion,
    versions: history,
  };
}

export function removeRecipeVersion(recipe, versionToRemove) {
  const remaining = listRecipeVersions(recipe).filter((snapshot) => snapshot.version !== Number(versionToRemove));
  if (!remaining.length) return null;
  const [latest, ...history] = remaining;
  return {
    ...latest,
    id: recipe.id,
    versions: history,
  };
}
