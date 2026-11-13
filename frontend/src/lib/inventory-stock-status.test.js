import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryProductStock, inventoryStockStatus } from './inventory-stock-status.js';

test('stock status includes linked batch stock and uses the product reorder level', () => {
  const product = { id: 'rice', stock: 2, reorder: 10 };
  const batch = { id: 'batch', parentProductId: 'rice', stock: 8 };
  const items = [product, batch];
  assert.equal(inventoryProductStock(product, items), 10);
  assert.equal(inventoryStockStatus(product, items), 'Low stock');
  assert.equal(inventoryStockStatus(batch, items), 'Low stock');
  batch.stock = 9;
  assert.equal(inventoryStockStatus(product, items), 'Watch');
  batch.stock = 20;
  assert.equal(inventoryStockStatus(product, items), 'Healthy');
});

test('legacy batch reorder levels and zero thresholds are handled consistently', () => {
  const product = { id: 'p', stock: 0, reorder: '' };
  const batch = { id: 'b', parentProductId: 'p', stock: 3, reorder: 3 };
  assert.equal(inventoryStockStatus(product, [product, batch]), 'Low stock');
  assert.equal(inventoryStockStatus({ id: 'out', stock: 0, reorder: 0 }, [{ id: 'out', stock: 0, reorder: 0 }]), 'Low stock');
});
