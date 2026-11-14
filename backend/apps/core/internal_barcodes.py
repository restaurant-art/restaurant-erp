"""Allocate stable store-local barcodes alongside the existing product identifiers."""

import re

FIRST_INTERNAL_BARCODE = 10000
LAST_INTERNAL_BARCODE = 99999
INTERNAL_BARCODE = "internalBarcode"


class InternalBarcodeError(ValueError):
    pass


def _records(value):
    return (row for row in value if isinstance(row, dict)) if isinstance(value, list) else ()


def short_code(value):
    code = str(value or "").strip()
    return code if re.fullmatch(r"[1-9][0-9]{4}", code) else ""


def reserved_short_codes(rows):
    """Avoid codes already used by the catalogue, including SKU and PLU lookups."""
    result = set()
    for row in _records(rows):
        fields = [row.get(key) for key in ("barcode", "batchBarcode", "sku", "plu", "pluNumber")]
        options = row.get("eanMrpOptions")
        fields.extend(option.get("barcode") for option in _records(options))
        additional = row.get("additionalBarcodes")
        if isinstance(additional, list):
            fields.extend(additional)
        result.update(code for value in fields if (code := short_code(value)))
    return result


def assigned_short_codes(rows):
    return {code for row in _records(rows) if (code := short_code(row.get(INTERNAL_BARCODE)))}


def reject_internal_collision(reserved, assigned):
    overlap = reserved & assigned
    if overlap:
        raise InternalBarcodeError(f"{min(overlap)} is assigned as an internal product barcode. Choose a different code.")


def assign_internal_barcodes(products, previous, menu):
    """Copy the saved code by product ID. Client-supplied codes never set the identity."""
    if not isinstance(products, list):
        return products

    assigned = {
        str(row["id"]): code for row in _records(previous)
        if row.get("id") is not None and (code := short_code(row.get(INTERNAL_BARCODE)))
    }
    occupied = set(assigned.values())
    if len(occupied) != len(assigned):
        raise InternalBarcodeError("Two saved products share an internal barcode.")
    reserved = reserved_short_codes(products) | reserved_short_codes(menu)
    reject_internal_collision(reserved, occupied)
    unavailable = reserved | occupied
    free = (str(value) for value in range(FIRST_INTERNAL_BARCODE, LAST_INTERNAL_BARCODE + 1)
            if str(value) not in unavailable)

    result = []
    for product in products:
        if not isinstance(product, dict) or product.get("id") is None:
            result.append(product)
            continue
        product_id = str(product["id"])
        if product_id not in assigned:
            code = next(free, None)
            if code is None:
                raise InternalBarcodeError("All five-digit internal barcodes for this store are in use.")
            assigned[product_id] = code
        code = assigned[product_id]
        result.append(product if product.get(INTERNAL_BARCODE) == code else {**product, INTERNAL_BARCODE: code})
    return result
