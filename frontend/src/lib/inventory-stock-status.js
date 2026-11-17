export function inventoryProductStock(item, items) {
  const parent = item.parentProductId ? items.find((entry) => entry.id === item.parentProductId) : item;
  const linked = parent ? items.filter((entry) => entry.id === parent.id || entry.parentProductId === parent.id) : [item];
  return linked.reduce((total, entry) => total + Number(entry.stock || 0), 0);
}

export function inventoryStockStatus(item, items) {
  const parent = item.parentProductId ? items.find((entry) => entry.id === item.parentProductId) : item;
  const stock = inventoryProductStock(item, items);
  const ownReorder = parent?.reorder;
  const legacyReorder = parent && items.find((entry) => entry.parentProductId === parent.id)?.reorder;
  const reorder = Number(ownReorder !== '' && ownReorder != null && Number(ownReorder) > 0 ? ownReorder : legacyReorder ?? ownReorder ?? item.reorder ?? 0);
  if (stock <= reorder) return 'Low stock';
  if (reorder > 0 && stock <= reorder * 1.25) return 'Watch';
  return 'Healthy';
}
