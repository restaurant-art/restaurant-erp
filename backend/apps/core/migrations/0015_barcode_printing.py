import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0014_kitchenbalance_negative_carrying_value")]

    operations = [
        migrations.CreateModel(
            name="BarcodeLabelSettings",
            fields=[
                ("store_id", models.CharField(max_length=100, primary_key=True, serialize=False)),
                ("settings", models.JSONField(default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name="BarcodePrintJob",
            fields=[
                ("id", models.UUIDField(editable=False, primary_key=True, serialize=False)),
                ("store_id", models.CharField(max_length=100)),
                ("branch_name", models.CharField(max_length=250)),
                ("actor_name", models.CharField(max_length=250)),
                ("source", models.CharField(max_length=12)),
                ("purchase_reference", models.CharField(blank=True, max_length=180)),
                ("action", models.CharField(max_length=5)),
                ("status", models.CharField(default="prepared", max_length=24)),
                ("copies", models.PositiveSmallIntegerField(default=1)),
                ("label_count", models.PositiveIntegerField()),
                ("labels", models.JSONField()),
                ("settings", models.JSONField()),
                ("request_hash", models.CharField(max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ("reprint_of", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to="core.barcodeprintjob")),
            ],
            options={"indexes": [models.Index(fields=["store_id", "-created_at"], name="barcode_job_store_date")]},
        ),
    ]
