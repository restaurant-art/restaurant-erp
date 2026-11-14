from decimal import Decimal

from django.db import migrations, models
from django.db.models import Q


def backfill_cost_status(apps, schema_editor):
    db = schema_editor.connection.alias
    lot_model = apps.get_model("core", "KitchenLot")
    batch_model = apps.get_model("core", "ProductionBatch")
    movement_model = apps.get_model("core", "KitchenMovement")
    lots = lot_model.objects.using(db)
    missing_receipts = movement_model.objects.using(db).filter(
        quantity__gt=0, value=0,
    ).filter(Q(category__in=("purchase_receipt", "production_receipt", "receipt", "opening"))).values("balance__lot_id")
    lots.filter(pk__in=missing_receipts).update(cost_incomplete=True)
    incomplete = set(lots.filter(cost_incomplete=True).values_list("pk", flat=True))
    pending = []
    for batch in batch_model.objects.using(db).filter(status="posted").iterator():
        inputs = batch.actual.get("allocations", [])
        shortages = batch.actual.get("shortages", [])
        outputs = {row["lot"] for row in batch.actual.get("outputs", []) if row.get("lot")}
        unknown = any(Decimal(row.get("cost") or 0) <= 0 for row in inputs)
        unknown |= any(Decimal(row.get("unit_cost") or 0) <= 0 for row in shortages)
        if unknown:
            incomplete.update(outputs)
        elif outputs:
            pending.append(({row.get("lot") for row in inputs}, outputs))
    while pending:
        remaining = []
        before = len(incomplete)
        for inputs, outputs in pending:
            if inputs & incomplete:
                incomplete.update(outputs)
            else:
                remaining.append((inputs, outputs))
        if len(incomplete) == before:
            break
        pending = remaining
    # Chunk the IDs for installations with many historical receipts.
    keys = list(incomplete)
    for index in range(0, len(keys), 500):
        lots.filter(pk__in=keys[index:index + 500]).update(cost_incomplete=True)


class Migration(migrations.Migration):
    dependencies = [("core", "0016_assign_internal_barcodes")]

    operations = [
        migrations.AddField(
            model_name="kitchenlot", name="cost_incomplete", field=models.BooleanField(default=False),
        ),
        migrations.AddIndex(
            model_name="kitchentransaction", index=models.Index(
                fields=["site", "business_date"], name="kitchen_tx_site_date",
            ),
        ),
        migrations.RunPython(backfill_cost_status, migrations.RunPython.noop),
    ]
