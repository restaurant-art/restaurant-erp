import { standardPurchaseMeasure } from "./purchase-units.js";

const configured = (...values) => values.find((value) => value != null && String(value).trim() !== "") ?? "";

// A batch is its own stock identity. Inherit configuration, never balances or
// the parent's ledger link; an existing batch keeps its explicit conversion.
export function productBatchStockFields(parent, existing = {}, linkedParent = null) {
  const parentUnit = String(parent.unit || "").trim().toLowerCase();
  const linkedFactor = linkedParent?.measures?.[parentUnit] ?? linkedParent?.pack_size ?? standardPurchaseMeasure(parentUnit)?.factor;
  return {
    unit: existing.unit || parent.unit || "pcs",
    productionConsumption: existing.productionConsumption ?? parent.productionConsumption ?? linkedParent?.production_consumption ?? false,
    productionBaseUnit: configured(existing.productionBaseUnit, parent.productionBaseUnit, linkedParent?.unit),
    productionUnitFactor: configured(existing.productionUnitFactor, parent.productionUnitFactor, linkedFactor),
    productionContentUnit: configured(existing.productionContentUnit, parent.productionContentUnit, linkedParent?.unit),
    alternateUnits: existing.alternateUnits ?? parent.alternateUnits ?? [],
    purchaseUnits: existing.purchaseUnits ?? parent.purchaseUnits ?? [],
  };
}
