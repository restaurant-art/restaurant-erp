"""Formatting for the eight-variable WhatsApp bill receipt template.

This module deliberately contains no network access or credentials.
"""

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re


def _text(value, fallback, limit):
    value = re.sub(r"\s+", " ", str(value or "")).strip()
    return (value or fallback)[:limit]


def _money(value):
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or abs(amount) > Decimal("999999999999"):
            raise ValueError
        return "₹" + str(amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Bill contains an invalid amount") from None


def receipt_parameters(bill):
    """Produce store, number, items, subtotal, discount, GST, total, payment."""
    if not isinstance(bill, dict) or not isinstance(bill.get("items"), list) or not bill["items"]:
        raise ValueError("Bill has no items")
    items = []
    for item in bill["items"]:
        if not isinstance(item, dict):
            raise ValueError("Bill contains an invalid item")
        name = _text(item.get("name"), "Item", 80)
        try:
            qty = Decimal(str(item.get("qty")))
            price = Decimal(str(item.get("price")))
            if (not qty.is_finite() or not price.is_finite() or qty <= 0 or
                    qty > Decimal("999999999") or price < 0 or price > Decimal("999999999999")):
                raise ValueError
            qty_text = format(qty.normalize(), "f")
            items.append(f"{qty_text} x {name} ({_money(qty * price)})")
        except (InvalidOperation, TypeError, ValueError):
            raise ValueError("Bill contains an invalid item quantity or price") from None
    item_text = "; ".join(items)
    # Keep the entire receipt in the message. Do not silently omit products.
    if len(item_text) > 500:
        raise ValueError("This bill is too long for the WhatsApp text receipt")
    return [
        _text(bill.get("storeName"), "Our store", 80),
        _text(bill.get("orderNumber") or bill.get("id"), "Bill", 80),
        item_text,
        _money(bill.get("subtotal", 0)),
        _money(bill.get("discount", 0)),
        _money(bill.get("tax", 0)),
        _money(bill.get("total", 0)),
        _text(bill.get("payment"), "Recorded", 40),
    ]


def template_payload(phone, template, language, bill):
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": language},
            "components": [{
                "type": "body",
                "parameters": [{"type": "text", "text": value} for value in receipt_parameters(bill)],
            }],
        },
    }
