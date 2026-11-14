"""Atomic Product Master configuration and direct retail snapshots.

Product metadata stays in the existing master; KitchenItem is its ledger link,
not a second retail catalogue. A size is a SKU property and a receipt snapshot.
"""
import re
from decimal import Decimal
from django.utils import timezone
from .barcode_labels import code_owners, options, scan_key, text
from .internal_barcodes import InternalBarcodeError, assign_internal_barcodes
from .models import AuditLog, SharedAppState
from .product_state import require_product_enabled
from .production_domain import UNITS, fail, number, quantity
from .production_models import KitchenItem, KitchenMovement
from .production_service import HANDLERS, save_item


def stock_definition(product, site):
    """Only same-size MRP/EAN batches may share their parent's scan code."""
    unit = str(product.get("unit", "")).strip().lower()
    linked = KitchenItem.objects.filter(site=site, legacy_key=str(product.get("id", ""))).first()
    base, factor = UNITS.get(unit) or (
        product.get("productionBaseUnit") or (linked.base_unit if linked else "piece"),
        number(product.get("productionUnitFactor") or (quantity(linked, 1, unit, False) if linked else 1), "Pack contents", allow_zero=False),
    )
    return unit, base, factor, bool(product.get("productionConsumption", linked.production_consumption if linked else False))


def configure_product(tx, product):
    key = str(product["id"])
    unit = str(product.get("unit", "")).strip().lower()
    if not unit:
        fail("Select a stock unit.")
    item = KitchenItem.objects.filter(site=tx.site, legacy_key=key).first()
    enabled = product.get("productionConsumption", item.production_consumption if item else False)
    if not isinstance(enabled, bool):
        fail("Enable Production Consumption must be a boolean.")
    if enabled and item and item.production_consumption and str(item.inventory_item.unit).strip().lower() != unit:
        fail(f"Production consumes this product in {item.inventory_item.unit}. Disable Production Consumption before changing its stock unit.")
    standard = UNITS.get(unit)
    if standard:
        base, factor = standard
    elif enabled or product.get("repackedFromProductId"):
        base = product.get("productionBaseUnit")
        factor = number(product.get("productionUnitFactor"), "Net quantity per pack", allow_zero=False)
        if base not in ("g", "ml", "piece"):
            fail("Choose a weight, volume or count for the pack contents.")
    else:
        base, factor = "piece", Decimal(1)
        # Retail-only products may change their stock unit. Preserve the current
        # conversion when it is unchanged; a new custom unit is counted as pieces.
        if item and str(item.inventory_item.unit).strip().lower() == unit:
            base = item.base_unit
            factor = quantity(item, 1, unit, False)
    pack_size = None if standard else factor
    if item and (item.base_unit != base or item.kind not in ("raw", "resale")):
        if KitchenMovement.objects.filter(balance__lot__item=item).exists():
            fail("Existing stock history uses a different measurement. Create a separate SKU for this pack size/unit; historical receipts are preserved.")
        item.base_unit = base
        item.kind = "raw" if enabled else "resale"
        item.save(update_fields=["base_unit", "kind"])
    if item and item.pack_size != pack_size and item.pack_size and KitchenMovement.objects.filter(balance__lot__item=item).exists():
        fail("This SKU has stock history for its recorded pack size. Create a separate SKU and barcode for the different size, even when its current stock is zero.")
    measures = dict(item.measures) if item else {}
    if not standard:
        measures[unit] = str(factor)
    result = save_item(tx, {
        **({"id": item.pk} if item else {"legacy_key": key}), "name": product["name"],
        "kind": item.kind if item else "raw" if enabled else "resale", "base_unit": base,
        "inventory_unit": unit, "measures": measures, "production_consumption": enabled,
        "pack_size": str(pack_size) if pack_size else None})
    item = KitchenItem.objects.select_related("inventory_item").get(pk=result["id"])
    return item


def validate_product_prices(product, previous):
    fields = {
        "price": "Purchase price", "mrp": "MRP", "sellingPrice": "Selling price",
        "wholesalePrice": "Wholesale price", "ecommercePrice": "E-commerce price",
        "cardPrice": "Card price",
    }
    if product.get("hsnCode") != previous.get("hsnCode"):
        hsn = str(product.get("hsnCode") or "").strip()
        if hsn and not re.fullmatch(r"(?:[0-9]{4}|[0-9]{6}|[0-9]{8})", hsn):
            fail("HSN code must contain 4, 6, or 8 digits.")
    for field, label in fields.items():
        value = product.get(field)
        if value not in (None, "") and value != previous.get(field):
            number(value, label, precision=Decimal("0.00000001"))
    mrp = product.get("mrp")
    if product.get("sellable") is False or mrp in (None, ""):
        return
    for field in ("sellingPrice", "wholesalePrice", "ecommercePrice", "cardPrice"):
        price = product.get(field)
        if price in (None, "") or (price == previous.get(field) and mrp == previous.get("mrp")):
            continue
        if number(price, fields[field], precision=Decimal("0.00000001")) > number(mrp, "MRP", precision=Decimal("0.00000001")):
            fail(f"{fields[field]} cannot be greater than MRP.")


def save_product(tx, data):
    product = data.get("product")
    if not isinstance(product, dict) or not product.get("id") or not str(product.get("name", "")).strip():
        fail("A product ID and name are required.")
    row, _ = SharedAppState.objects.select_for_update().get_or_create(
        state_key=f"vestora-inventory-{tx.site.store_id}", defaults={"state_value": []})
    products = list(row.state_value)
    old = next((p for p in products if str(p.get("id")) == str(product["id"])), None)
    if old and old.get("updatedAt") != data.get("expected_updated_at"):
        fail("This product changed. Refresh Product Master before saving.")
    product = {**(old or {}), **product}
    validate_product_prices(product, old or {})
    if product.get("status", "Active") not in ("Active", "Inactive"):
        fail("Product status must be Active or Inactive.")
    for field in ("stock", "cost", "unopenedPacks", "looseStock", "totalBaseStock", "stockLocations"):
        if old:
            if field in old:
                product[field] = old[field]
        elif field == "stock":
            product[field] = 0
    linked_item = KitchenItem.objects.filter(site=tx.site, legacy_key=str(product["id"])).first()
    requested_consumption = product.get("productionConsumption", linked_item.production_consumption if linked_item else False)
    if old and old.get("unit") != product.get("unit") and linked_item and requested_consumption:
        fail(f"Production consumes this product in {linked_item.inventory_item.unit}. Disable Production Consumption before changing its stock unit.")
    parent_id = str(product.get("parentProductId") or "")
    if parent_id:
        parent = next((p for p in products if str(p.get("id")) == parent_id and not p.get("parentProductId")), None)
        if not parent or stock_definition(product, tx.site) != stock_definition(parent, tx.site):
            fail("Product batches must keep their parent's stock unit and pack contents. Create a separate product for a different size.")
    family = parent_id or str(product["id"])
    for other in products:
        if str(other.get("id")) == str(product["id"]):
            continue
        for field in ("sku", "barcode", "plu"):
            value = str(product.get(field) or "").strip().lower()
            if value and value == str(other.get(field) or "").strip().lower():
                same_batch_family = (field != "sku"
                    and family == str(other.get("parentProductId") or other.get("id"))
                    and stock_definition(product, tx.site) == stock_definition(other, tx.site))
                if not same_batch_family:
                    fail(f"{field.upper()} is already assigned to another product. Different pack sizes need distinct identification.")
    previous_codes = {text(entry.get("barcode")) for entry in options(old or {})}
    new_codes = {text(entry.get("barcode")) for entry in options(product)} - previous_codes - {""}
    if new_codes:
        others = {str(entry["id"]): entry for entry in products if str(entry["id"]) != str(product["id"])}
        owners = code_owners(others)
        if any(owners.get(scan_key(code), set()) - {family} for code in new_codes):
            fail("This barcode is already assigned to another product or pack size.")
    timestamp = timezone.now()
    product["updatedAt"] = timestamp.isoformat()
    updated = [product if str(p.get("id")) == str(product["id"]) else p for p in products] if old else [product, *products]
    menu = SharedAppState.objects.filter(state_key=f"vestora-menu-items-{tx.site.store_id}").values_list("state_value", flat=True).first()
    try:
        row.state_value = assign_internal_barcodes(updated, products, menu)
    except InternalBarcodeError as error:
        fail(str(error))
    product = next(p for p in row.state_value if str(p.get("id")) == str(product["id"]))
    row.updated_at = timestamp
    row.save()
    item = configure_product(tx, product)
    product.update(productionManaged=True, productionConsumption=item.production_consumption,
                   productionBaseUnit=item.base_unit, productionUnitFactor=str(item.pack_size or quantity(item, 1, product["unit"])),
                   packTracking=bool(item.pack_size))
    row.save()
    return {"product": product, "item": item.pk}


def set_product_status(tx, data):
    if not isinstance(data.get("enabled"), bool):
        fail("Choose Enable or Disable for the product.")
    key = str(data.get("product_id") or "").strip()
    row = SharedAppState.objects.select_for_update().filter(state_key=f"vestora-inventory-{tx.site.store_id}").first()
    products = list(row.state_value) if row and isinstance(row.state_value, list) else []
    product = next((entry for entry in products if isinstance(entry, dict) and str(entry.get("id")) == key), None)
    if product is None:
        fail("Product not found in this branch. Refresh Inventory before changing its status.")
    if data.get("expected_updated_at") is not None and product.get("updatedAt") != data["expected_updated_at"]:
        fail("This product changed. Refresh Inventory before changing its status.")
    before = product.get("status", "Active")
    product["status"] = "Active" if data["enabled"] else "Inactive"
    product["updatedAt"] = timezone.now().isoformat()
    row.state_value = products
    row.updated_at = timezone.now()
    row.save(update_fields=["state_value", "updated_at"])
    tx.source = key
    tx.reason = "Product enabled" if data["enabled"] else "Product disabled"
    tx.save(update_fields=["source", "reason"])
    AuditLog.objects.create(restaurant=tx.site.branch.restaurant, branch=tx.site.branch, actor=tx.actor,
        action="inventory.product_status", entity="ProductMaster", entity_id=key,
        before={"status": before}, after={"status": product["status"]})
    item = KitchenItem.objects.filter(site=tx.site, legacy_key=key).first()
    return {"product": product, "enabled": data["enabled"], "item": item.pk if item else None}


def retail_snapshot(site, entry):
    key = str(entry["product_id"])
    item = KitchenItem.objects.filter(site=site, legacy_key=key).select_related("inventory_item").first()
    if not item:
        fail("Save this product in Product Master to initialize its stock link before selling.")
    row = SharedAppState.objects.filter(state_key=f"vestora-inventory-{site.store_id}").first()
    product = next((p for p in (row.state_value if row else []) if str(p.get("id")) == key), None)
    products = {str(p.get("id")): p for p in (row.state_value if row else []) if isinstance(p, dict)}
    require_product_enabled(product, products)
    if not product or product.get("sellable") is False:
        fail("This product is not enabled for retail sales.")
    conversion = Decimal(1)
    if entry.get("sales_unit") and str(entry["sales_unit"]).lower() != str(product["unit"]).lower():
        alternate = next((u for u in product.get("alternateUnits", []) if u.get("name") == entry["sales_unit"]), None)
        if not alternate:
            fail("Select a configured selling unit.")
        conversion = number(alternate["conversion"], "Selling unit conversion", allow_zero=False)
        if alternate.get("conversionMode") == "base_contains_unit":
            conversion = 1 / conversion
    if item.pack_size and (conversion != conversion.to_integral_value() or number(entry["quantity"]) != number(entry["quantity"]).to_integral_value()):
        fail("Retail sales require whole unopened packs. Loose contents are for production consumption.")
    amount = quantity(item, conversion, product["unit"], False)
    return {"key": key, "version": 1, "name": product["name"], "method": "retail", "product_id": key,
            "sales_unit": entry.get("sales_unit") or product["unit"],
            "components": [{"item": item.pk, "quantity": str(amount), "unit": item.base_unit,
                            "sealed": bool(item.pack_size), "pack_size": str(item.pack_size or "")} ]}


HANDLERS["product"] = save_product
HANDLERS["product_status"] = set_product_status
