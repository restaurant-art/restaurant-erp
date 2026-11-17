"""Decimal quantities and recipe validation, independent of HTTP and storage."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from rest_framework.exceptions import ValidationError

QTY = Decimal("0.000001")
MONEY = Decimal("0.00000001")
UNITS = {"g": ("g", Decimal(1)), "gm": ("g", Decimal(1)), "gms": ("g", Decimal(1)),
         "gram": ("g", Decimal(1)), "grams": ("g", Decimal(1)), "kg": ("g", Decimal(1000)),
         "kilogram": ("g", Decimal(1000)), "kilograms": ("g", Decimal(1000)),
         "ml": ("ml", Decimal(1)), "millilitre": ("ml", Decimal(1)), "milliliter": ("ml", Decimal(1)),
         "litre": ("ml", Decimal(1000)), "litres": ("ml", Decimal(1000)),
         "liter": ("ml", Decimal(1000)), "liters": ("ml", Decimal(1000)), "ltr": ("ml", Decimal(1000)), "l": ("ml", Decimal(1000)),
         "piece": ("piece", Decimal(1)), "pieces": ("piece", Decimal(1)),
         "pcs": ("piece", Decimal(1)), "pc": ("piece", Decimal(1)), "no": ("piece", Decimal(1)),
         "nos": ("piece", Decimal(1)), "cyl": ("piece", Decimal(1)),
         "each": ("piece", Decimal(1)), "unit": ("piece", Decimal(1)), "units": ("piece", Decimal(1))}
METHODS = {"prepared", "cook_on_order", "resale", "non_stock"}
KINDS = {"raw", "intermediate", "prepared", "resale"}


def fail(message):
    raise ValidationError(message)


def number(value, label="Quantity", allow_zero=True, signed=False, precision=QTY):
    try:
        result = Decimal(str(value))
        if not result.is_finite() or abs(result) >= Decimal("1e14"):
            raise ValueError()
        rounded = result.quantize(precision, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        fail(f"{label} must be a finite decimal.")
    if result != rounded:
        fail(f"{label} supports at most {-precision.as_tuple().exponent} decimal places.")
    if (not signed and result < 0) or (not allow_zero and result == 0):
        fail(f"{label} must be {'positive' if not allow_zero else 'zero or positive'}.")
    return result


def money(value):
    return Decimal(value).quantize(MONEY, rounding=ROUND_HALF_UP)


def quantity(item, value, unit=None, allow_zero=True):
    amount = number(value, allow_zero=allow_zero)
    unit = str(unit or item.base_unit).strip().lower()
    if unit in UNITS:
        base, factor = UNITS[unit]
        if base != item.base_unit:
            fail(f"{item.inventory_item.name}: {unit} is not convertible to {item.base_unit}.")
    elif unit in item.measures:
        factor = number(item.measures[unit], "Measure quantity", allow_zero=False)
    else:
        fail(f"Configure an item-specific quantity for {unit} on {item.inventory_item.name}.")
    amount = number(amount * factor)
    if item.base_unit == "piece" and amount != amount.to_integral_value():
        fail(f"{item.inventory_item.name} requires whole pieces.")
    return amount


def allocate_cost(total, weights):
    """The final output receives the rounding remainder, never duplicated cost."""
    total = money(total)
    weights = [number(weight, "Cost weight") for weight in weights]
    if not weights or sum(weights) <= 0:
        fail("Set positive cost allocation weights for good outputs.")
    allocations = [money(total * weight / sum(weights)) for weight in weights]
    allocations[-1] += total - sum(allocations)
    return allocations


def check_cycles(recipes):
    graph = {}
    for recipe in recipes:
        for output in recipe.get("outputs", []):
            graph.setdefault(str(output["item"]), set()).update(str(row["item"]) for row in recipe.get("inputs", []))
    visiting, visited = set(), set()
    def visit(node):
        if node in visiting:
            fail("Circular production dependency: an output eventually consumes itself.")
        if node in visited:
            return
        visiting.add(node)
        for child in graph.get(node, []):
            visit(child)
        visiting.remove(node)
        visited.add(node)
    for node in graph:
        visit(node)
