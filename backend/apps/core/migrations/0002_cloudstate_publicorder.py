import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="CloudState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("state_key", models.CharField(db_index=True, max_length=180, unique=True)),
                ("state_value", models.JSONField(blank=True, null=True)),
                ("last_mutation_id", models.UUIDField(blank=True, null=True, unique=True)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="core.user")),
            ],
        ),
        migrations.CreateModel(
            name="PublicOrder",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("order_number", models.CharField(db_index=True, max_length=40, unique=True)),
                ("store_id", models.CharField(db_index=True, max_length=80)),
                ("table_id", models.CharField(max_length=80)),
                ("table_name", models.CharField(max_length=120)),
                ("floor", models.CharField(blank=True, max_length=120)),
                ("customer_name", models.CharField(default="Guest", max_length=120)),
                ("customer_note", models.CharField(blank=True, max_length=240)),
                ("guest_count", models.PositiveSmallIntegerField(default=1)),
                ("items", models.JSONField(default=list)),
                ("item_count", models.PositiveIntegerField(default=0)),
                ("subtotal", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("status", models.CharField(db_index=True, default="New", max_length=40)),
            ],
            options={"ordering": ("-created_at",)},
        ),
    ]
