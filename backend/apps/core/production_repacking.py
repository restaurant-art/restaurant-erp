"""Post packing and unpacking to the same ledger used by purchasing and POS."""

from decimal import Decimal, InvalidOperation

from .production_domain import UNITS, fail, money, number, quantity
from .production_models import KitchenItem, KitchenLocation
from .production_products import save_product
from .production_purchase import shared
from .production_service import HANDLERS, allocate, issue_allocations, receive, scoped
from .product_state import require_product_enabled


def mapped_item(site, product):
    item = KitchenItem.objects.filter(site=site, legacy_key=str(product["id"])).select_related("inventory_item").first()
    if item is None:
        fail(f"{product['name']} needs an inventory stock link before repacking.")
    return item


def output_product(tx, source, products, index, grams, line):
    existing = None
    for row in products.values():
        if str(row.get("repackedFromProductId")) != str(source["id"]):
            continue
        try:
            if Decimal(str(row.get("packSizeGrams") or 0)) == grams:
                existing = row
                break
        except InvalidOperation:
            continue
    selling_price = number(line.get("selling_price"), "Pack selling price", allow_zero=False, precision=Decimal("0.01"))
    mrp = line.get("mrp")
    mrp = selling_price if mrp in ("", None) else number(mrp, "Pack MRP", precision=Decimal("0.01"))
    prices = {"sellingPrice": float(selling_price), "mrp": float(mrp)}
    if existing:
        require_product_enabled(existing, products)
        if not KitchenItem.objects.filter(site=tx.site, legacy_key=str(existing["id"])).exists() and Decimal(str(existing.get("stock") or 0)):
            fail("The old pack has stock outside the ledger. Reconcile it before recording another run.")
        product = {**existing, **prices}
    else:
        size = format(grams.normalize(), "f")
        # Product Master assigns a five-digit barcode in the same transaction.
        serial = tx.pk.int % 10**14
        sku = f"9{serial:014d}{index:02d}"
        used_skus = {str(row.get("sku")) for row in products.values()}
        while sku in used_skus:
            serial = (serial + 1) % 10**14
            sku = f"9{serial:014d}{index:02d}"
        product = {
            "id": f"RPK-{tx.pk.hex}-{index}", "sku": sku,
            "name": f"{source['name']} - {size} g pack", "unit": "pack", "status": "Active",
            "purchasable": False, "sellable": True, "productType": "sellable",
            "productionConsumption": False, "productionBaseUnit": "g", "productionUnitFactor": size,
            "repackedFromProductId": source["id"], "repackedFromName": source["name"],
            "packSizeGrams": float(grams), "packWeight": f"{size} g", **prices,
        }
        for field in ("hsnCode", "gstRate", "department", "category", "subcategory", "brand", "manufacturer"):
            if field in source:
                product[field] = source[field]
    saved = save_product(tx, {"product": product, "expected_updated_at": existing.get("updatedAt") if existing else None})
    return saved["product"], scoped(KitchenItem, tx.site, saved["item"])


def repack(tx, data):
    location = scoped(KitchenLocation, tx.site, data.get("location"))
    lines = data.get("lines")
    if not isinstance(lines, list) or not 1 <= len(lines) <= 100:
        fail("Enter between 1 and 100 repack lines.")
    catalog = shared(tx.site, "inventory")
    products = {str(row["id"]): row for row in catalog.state_value if isinstance(row, dict) and "id" in row}
    direction = data.get("direction", "pack")
    reverse, reconcile = direction == "reverse", direction == "reconcile"
    if direction not in ("pack", "reverse", "reconcile"):
        fail("Choose to pack or return to bulk.")
    if reconcile and not tx.reason:
        fail("Record the reason for reconciling previously unposted packs.")
    history, outputs, linked_items = [], [], []
    seen = set()
    for index, line in enumerate(lines, 1):
        if not isinstance(line, dict):
            fail("Enter valid repack lines.")
        product = products.get(str(line.get("product_id"))) if reverse or reconcile else None
        if (reverse or reconcile) and not product:
            fail("Choose an existing repacked product.")
        source = products.get(str(product.get("repackedFromProductId"))) if product else products.get(str(line.get("source_id")))
        if not source or source.get("parentProductId"):
            fail("Select an enabled bulk product.")
        bulk_item = mapped_item(tx.site, source)
        if bulk_item.base_unit != "g" or bulk_item.pack_size:
            fail("Select loose bulk stock measured by weight.")
        count = number(line.get("pack_count"), "Pack count", allow_zero=reconcile)
        if count or not reconcile:
            require_product_enabled(source, products)
        if count != count.to_integral_value() or count > 1000000:
            fail("Pack count must be a whole number up to 1,000,000.")
        grams = number(product.get("packSizeGrams") if product else line.get("pack_grams"),
                       "Pack weight in grams", allow_zero=False)
        if (str(source["id"]), grams) in seen:
            fail("Combine repeated sizes of the same bulk item into one line.")
        seen.add((str(source["id"]), grams))
        total_grams = number(grams * count, "Total weight in grams", allow_zero=reconcile)
        if reverse:
            require_product_enabled(product, products)
            pack_item = mapped_item(tx.site, product)
            packed_qty = quantity(pack_item, count, pack_item.inventory_item.unit, False)
            if pack_item.pack_size and (pack_item.base_unit != "g" or pack_item.pack_size != grams):
                fail("The recorded pack size differs from its stock link.")
            if not pack_item.pack_size and pack_item.base_unit != "piece":
                fail("The old pack stock needs reconciliation before unpacking.")
            picks = allocate(tx.site, pack_item, location, packed_qty,
                             sealed=bool(pack_item.pack_size), pack_size=pack_item.pack_size)
            allocations = issue_allocations(tx, picks, "repack_out", mode="sealed" if pack_item.pack_size else "consume")
            target_item, received = bulk_item, total_grams
        else:
            picks = allocate(tx.site, bulk_item, location, total_grams)
            allocations = issue_allocations(tx, picks, "repack_out")
            if reconcile:
                require_product_enabled(product, products)
                if KitchenItem.objects.filter(site=tx.site, legacy_key=str(product["id"])).exists():
                    fail("This pack is already linked. Refresh the repack list.")
                if Decimal(str(product.get("stock") or 0)) != number(line.get("expected_stock"), "Previous pack count"):
                    fail("The recorded pack quantity changed. Refresh before reconciling.")
                # Only the new verified receipt contributes stock. Preserve the
                # existing product ID, scan codes and earlier history.
                catalog.refresh_from_db()
                catalog.state_value = [{**entry, "stock": 0} if entry.get("id") == product["id"] else entry
                                       for entry in catalog.state_value]
                catalog.save(update_fields=["state_value", "updated_at"])
                saved = save_product(tx, {"product": {**product, "stock": 0, "unit": "pack",
                    "productionConsumption": False, "productionBaseUnit": "g",
                    "productionUnitFactor": str(grams)}, "expected_updated_at": product.get("updatedAt")})
                product, pack_item = saved["product"], scoped(KitchenItem, tx.site, saved["item"])
            else:
                product, pack_item = output_product(tx, source, products, index, grams, line)
            products[str(product["id"])] = product
            received = quantity(pack_item, count, pack_item.inventory_item.unit, allow_zero=reconcile)
            if (pack_item.pack_size and (pack_item.base_unit != "g" or pack_item.pack_size != grams)) or (
                    not pack_item.pack_size and pack_item.base_unit != "piece"):
                fail("The recorded pack size differs from its stock link.")
            target_item = pack_item
            linked_items.append(pack_item.pk)
        cost = money(sum(Decimal(entry["cost"]) for entry in allocations))
        expiry = min((balance.lot.expires_at for balance, _ in picks if balance.lot.expires_at), default=None)
        if received:
            receive(tx, target_item, location, received, cost, f"RPK-{tx.pk.hex}:{index}", "repack_in",
                    expires=expiry, pack_size=target_item.pack_size,
                    sealed_packages=0 if reverse or not target_item.pack_size else count,
                    cost_incomplete=any(entry["cost_incomplete"] for entry in allocations))
        display_unit = bulk_item.inventory_item.unit
        display_factor = UNITS.get(display_unit, ("g", Decimal(bulk_item.measures.get(display_unit, 1))))[1]
        history.append({
            "id": f"RPK-{tx.pk.hex}-{index}", "type": "Bulk Repacking Reversal" if reverse else "Bulk Repacking",
            "sourceItemId": source["id"], "sourceItemName": source["name"], "sourceQuantity": float(total_grams / display_factor),
            "sourceUnit": display_unit, "outputItemId": product["id"], "outputItemName": product["name"],
            "outputQuantity": int(count), "outputUnit": product["unit"], "packSizeGrams": float(grams),
            "barcode": product["internalBarcode"], "date": str(tx.business_date),
            "createdAt": tx.created_at.isoformat(), "productionTransaction": str(tx.pk), "carryingValue": str(cost),
            **({"reconciliationReason": tx.reason} if reconcile else {}),
        })
        outputs.append({"product": product, "packCount": int(count)})
    ledger = shared(tx.site, "inventory-transactions")
    ledger.state_value = history + ledger.state_value
    ledger.save(update_fields=["state_value", "updated_at"])
    return {"outputs": outputs, "repack_transactions": history, "projection_items": linked_items}


HANDLERS["repack"] = repack
