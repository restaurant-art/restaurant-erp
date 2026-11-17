from django.db import migrations
from django.utils import timezone

from apps.core.internal_barcodes import assign_internal_barcodes


INVENTORY = "vestora-inventory-"
OTHER_INVENTORY_KEYS = tuple(f"{INVENTORY}{kind}-" for kind in (
    "brand-manufacturer-profiles", "brands", "categories", "category-profiles", "departments",
    "manufacturers", "subcategories", "tax-profiles", "transactions", "vendors",
))


def backfill_internal_barcodes(apps, schema_editor):
    state = apps.get_model("core", "SharedAppState")
    rows = state.objects.using(schema_editor.connection.alias)
    menu_by_key = dict(rows.filter(state_key__startswith="vestora-menu-items-").values_list("state_key", "state_value"))
    for row in rows.filter(state_key__startswith=INVENTORY).iterator():
        if row.state_key.startswith(OTHER_INVENTORY_KEYS) or not isinstance(row.state_value, list):
            continue
        store_id = row.state_key.removeprefix(INVENTORY)
        products = assign_internal_barcodes(
            row.state_value, row.state_value, menu_by_key.get(f"vestora-menu-items-{store_id}", []),
        )
        if products != row.state_value:
            row.state_value = products
            row.updated_at = timezone.now()
            row.save(update_fields=["state_value", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [("core", "0015_barcode_printing")]

    operations = [migrations.RunPython(backfill_internal_barcodes, migrations.RunPython.noop)]
