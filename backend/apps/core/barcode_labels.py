"""Barcode label validation and projections of existing ERP records."""

import math
import re
from collections import defaultdict
from decimal import Decimal, InvalidOperation

from .internal_barcodes import INTERNAL_BARCODE, short_code
from .production_domain import UNITS, fail

MAX_LABELS = 5000
FIELDS = (
    "store", "product", "bars", "number", "mrp", "price", "sku", "unit", "batch", "expiry",
)
DEFAULT_SETTINGS = {
    "paper": "thermal", "orientation": "portrait", "width": 50, "height": 30,
    "gap_x": 2, "gap_y": 2, "margin": 0, "columns": 3,
    "offset_x": 0, "offset_y": 0, "dpi": 203, "font": 7,
    "barcode_height": 8, "barcode_width": 100,
    "visible": {field: field in ("store", "product", "bars", "number", "mrp", "price") for field in FIELDS},
}


def bounded(value, title, low, high, integer=False):
    if isinstance(value, bool):
        fail(f"{title} must be a number between {low} and {high}.")
    try:
        amount = float(value)
    except (ValueError, TypeError, OverflowError):
        amount = math.nan
    if not math.isfinite(amount) or not low <= amount <= high or (integer and not amount.is_integer()):
        fail(f"{title} must be {'a whole number' if integer else 'a number'} between {low} and {high}.")
    return int(amount) if integer else round(amount, 3)


def label_settings(data):
    if not isinstance(data, dict):
        fail("Enter valid label settings.")
    data = {**DEFAULT_SETTINGS, **data}
    paper, orientation = data["paper"], data["orientation"]
    if paper not in ("thermal", "a4") or orientation not in ("portrait", "landscape"):
        fail("Choose thermal or A4 paper and a valid orientation.")
    width = bounded(data["width"], "Label width (mm)", 18, 150)
    height = bounded(data["height"], "Label height (mm)", 12, 100)
    result = {
        "paper": paper, "orientation": orientation, "width": width, "height": height,
        "gap_x": bounded(data["gap_x"], "Horizontal gap (mm)", 0, 20),
        "gap_y": bounded(data["gap_y"], "Vertical gap (mm)", 0, 20),
        "margin": bounded(data["margin"], "Margin (mm)", 0, 25),
        "columns": bounded(data["columns"], "Labels per row", 1, 12, integer=True),
        "offset_x": bounded(data["offset_x"], "Horizontal alignment (mm)", -10, 10),
        "offset_y": bounded(data["offset_y"], "Vertical alignment (mm)", -10, 10),
        "dpi": bounded(data["dpi"], "Printer DPI", 150, 600, integer=True),
        "font": bounded(data["font"], "Font size (pt)", 4, 18),
        "barcode_height": bounded(data["barcode_height"], "Barcode height (mm)", 3, 45),
        "barcode_width": bounded(data["barcode_width"], "Barcode width (%)", 40, 100),
    }
    visible = data["visible"]
    if not isinstance(visible, dict) or any(not isinstance(visible.get(field, False), bool) for field in FIELDS):
        fail("Choose which label fields to show.")
    result["visible"] = {field: visible.get(field, False) for field in FIELDS}
    if not any(result["visible"].values()):
        fail("Show at least one label field.")
    if paper == "a4":
        page_width, page_height = (297, 210) if orientation == "landscape" else (210, 297)
        left, top = result["margin"] + result["offset_x"], result["margin"] + result["offset_y"]
        full_width = result["columns"] * width + (result["columns"] - 1) * result["gap_x"]
        if min(left, top) < 0 or left + full_width + result["margin"] > page_width or top + height + result["margin"] > page_height:
            fail("The label grid and alignment must fit on the selected A4 sheet.")
    elif result["margin"] * 2 + 2 * abs(result["offset_x"]) + 4 >= width or result["margin"] * 2 + 2 * abs(result["offset_y"]) + 6 >= height:
        fail("Reduce the margin or alignment offset to fit the thermal label.")
    return result


def text(value, limit=250):
    return str(value if value is not None else "").strip()[:limit]


def amount(value):
    if value is None or value == "" or isinstance(value, bool):
        return None
    try:
        value = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return value if value.is_finite() else None


def money_value(value):
    value = amount(value)
    return float(value) if value is not None and 0 <= value < 10**12 else None


def barcode_format(code):
    if not code or not re.fullmatch(r"[!-~]{1,32}", code):
        return None
    gtin = {8: "EAN8", 12: "UPC", 13: "EAN13"}.get(len(code))
    if gtin and re.fullmatch(r"[0-9]+", code):
        digits = [int(value) for value in code]
        check = sum(value * (3 if index % 2 == 0 else 1) for index, value in enumerate(reversed(digits[:-1])))
        return gtin if (-check) % 10 == digits[-1] else None
    return "CODE128"


def scan_key(code):
    # UPC-A and an EAN-13 with a leading zero can be returned interchangeably by scanners.
    code = code.lower()
    return code[1:] if re.fullmatch(r"0[0-9]{12}", code) else code


def options(product):
    yield product
    yield from (entry for entry in product.get("eanMrpOptions", []) or [] if isinstance(entry, dict))


def family(product):
    return text(product.get("parentProductId") or product.get("id"), 180)


def code_owners(products, menu=()):
    index = defaultdict(set)
    for product in products.values():
        internal = short_code(product.get(INTERNAL_BARCODE))
        if internal:
            index[internal].add(str(product["id"]))
        for code in [row.get("barcode") for row in options(product)] + [product.get("batchBarcode"), product.get("plu"), product.get("sku")]:
            if text(code):
                index[scan_key(text(code))].add(family(product))
    for row in menu:
        if isinstance(row, dict) and text(row.get("barcode")):
            product_id = text(row.get("productMasterId") or row.get("id"), 180)
            index[scan_key(text(row["barcode"]))].add(family(products[product_id]) if product_id in products else product_id)
    return index


def first_batches(products):
    batches = {}
    for product in products.values():
        if product.get("parentProductId"):
            batches.setdefault(str(product["parentProductId"]), product)
    return batches


def item_label(product, products, owners, batches):
    parent = products.get(text(product.get("parentProductId")), {})
    master = parent or product
    identity = {**master, **product}
    entries = {}
    legacy_batch = batches.get(str(master.get("id")), {})
    own_price = parent and product.get("inheritPricing") is not True
    primary_price = money_value(product.get("sellingPrice")) if own_price else None
    if primary_price is None:
        primary_price = money_value(master.get("sellingPrice"))
    if primary_price is None:
        primary_price = money_value(legacy_batch.get("sellingPrice"))
    master_mrp = money_value(product.get("mrp")) if own_price else None
    if master_mrp is None:
        master_mrp = money_value(master.get("mrp"))
    if master_mrp is None:
        master_mrp = money_value(legacy_batch.get("mrp"))
    internal = short_code(product.get(INTERNAL_BARCODE))
    if internal:
        entries[(internal, master_mrp)] = {
            "barcode": internal, "format": "CODE128", "mrp": master_mrp, "price": primary_price,
            "internal": True,
            "issue": "Barcode belongs to more than one item." if len(owners.get(internal, ())) > 1 else "",
        }
    for entry in [product, *options(master), legacy_batch]:
        code = text(entry.get("barcode"))
        mrp = money_value(entry.get("mrp"))
        if not code or (code, mrp) in entries:
            continue
        encoding = barcode_format(code)
        issue = ""
        if len(owners.get(scan_key(code), ())) > 1:
            issue = "Barcode belongs to more than one item."
        elif not encoding:
            issue = "Invalid barcode or GTIN check digit. Correct it in Product Master."
        price = primary_price
        if entry is not product and entry is not master and entry is not legacy_batch:
            price = money_value(entry.get("sellingPrice"))
            if price is None:
                price = mrp if mrp is not None else primary_price
        entries[(code, mrp)] = {"barcode": code, "format": encoding, "mrp": mrp, "price": price, "issue": issue}
    unit = text(product.get("unit"))
    factor = amount(product.get("productionUnitFactor"))
    base = text(product.get("productionBaseUnit"))
    unit_label = f"{unit} · {factor.normalize():f} {base}" if product.get("packTracking") and factor and base else unit
    stock = amount(product.get("unopenedPacks") if product.get("packTracking") and product.get("unopenedPacks") is not None else product.get("stock"))
    sale_unit = UNITS.get(unit.lower(), ("piece", None))[0]
    return {
        "id": text(product.get("id"), 180), "name": text(product.get("name")),
        "sku": text(product.get("sku")), "category": text(identity.get("category")), "brand": text(identity.get("brand")),
        "unit": unit_label, "stock": float(stock or 0),
        "stock_labels": int(stock) if stock is not None and stock > 0 and sale_unit == "piece" and stock == stock.to_integral_value() else None,
        "mrp": master_mrp, "price": primary_price,
        "batch": text(product.get("batchNumber") or product.get("variantLabel")), "expiry": text(product.get("expiryDate")),
        "internal_barcode": internal, "codes": list(entries.values()), "can_generate": not internal,
    }


def purchase_label_count(receipt, product):
    stock_unit = text(receipt.get("stockUnit") or (product or {}).get("unit") or receipt.get("unit")).lower()
    unit_type = UNITS.get(stock_unit, ("piece", None))[0]
    if unit_type != "piece":
        return None
    converted = receipt.get("stockQuantity")
    if converted is None:
        # Older records can safely fall back when the received and sellable units match.
        if text(receipt.get("unit")).lower() != stock_unit:
            return None
        converted = receipt.get("acceptedQuantity", receipt.get("quantity"))
    count = amount(converted)
    return int(count) if count is not None and 0 < count == count.to_integral_value() else None
