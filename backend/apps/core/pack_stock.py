"""Physical package splits. All quantities are Decimal base units, never floats.

Old receipts have no package evidence: their quantity remains unclassified/loose.
A package is only saleable when a receipt or a controlled return records it sealed.
"""
from decimal import Decimal, ROUND_CEILING
from .production_domain import fail

ZERO = Decimal(0)


def issue_split(total, opened, sealed, size, amount, mode="consume"):
    if amount <= 0 or amount > total:
        fail("Issue exceeds the balance on hand.")
    if not size:
        if mode == "sealed":
            fail("This lot has no verified unopened packs.")
        return 0, -amount, 0, amount
    if mode == "sealed":
        count = amount / size
        if count != count.to_integral_value() or count > sealed:
            fail("Only complete unopened packs can be sold or returned as packs.")
        return -int(count), ZERO, int(count), ZERO
    loose_used = min(opened, amount)
    remainder = amount - loose_used
    opened_packs = int((remainder / size).to_integral_value(rounding=ROUND_CEILING))
    if opened_packs > sealed:
        fail("Insufficient unopened packs for this consumption.")
    sealed_sent = int(remainder // size) if mode == "preserve" else 0
    loose_sent = amount - sealed_sent * size
    return -opened_packs, opened_packs * size - amount, sealed_sent, loose_sent


def validate_split(total, opened, sealed, size):
    # A marked shortage balance is negative base quantity with no physical
    # packs or loose stock; it records ledger debt, never usable inventory.
    if total < 0 and opened == 0 and sealed == 0 and not size:
        return
    if sealed < 0 or opened < 0 or total != opened + sealed * (size or ZERO) or (sealed and not size):
        fail("Package movement would create an inconsistent sealed/loose stock balance.")
