import uuid

from django.db import migrations, models
from django.utils import timezone


class Migration(migrations.Migration):
    dependencies = [("core", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="SharedAppState",
            fields=[
                ("state_key", models.TextField(primary_key=True, serialize=False)),
                ("state_value", models.JSONField(blank=True, default=None, null=True)),
                ("updated_at", models.DateTimeField(default=timezone.now)),
            ],
            options={"db_table": "vestora_shared_app_state"},
        ),
        migrations.CreateModel(
            name="SyncOperation",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("actor_id", models.CharField(max_length=64)),
                ("operation_id", models.UUIDField(default=uuid.uuid4)),
                ("request_hash", models.CharField(max_length=64)),
                ("result", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "vestora_sync_operations_aws"},
        ),
        migrations.AddConstraint(
            model_name="syncoperation",
            constraint=models.UniqueConstraint(fields=("actor_id", "operation_id"), name="vestora_sync_actor_operation"),
        ),
        migrations.CreateModel(
            name="PublicOrder",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("order_number", models.TextField(unique=True)),
                ("store_id", models.TextField(db_index=True)),
                ("table_id", models.TextField()),
                ("table_name", models.TextField()),
                ("floor", models.TextField(default="Main")),
                ("customer_name", models.TextField(default="Guest")),
                ("customer_note", models.TextField(blank=True, default="")),
                ("guest_count", models.PositiveIntegerField(default=1)),
                ("items", models.JSONField(default=list)),
                ("item_count", models.PositiveIntegerField(default=0)),
                ("subtotal", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("status", models.TextField(default="New")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "vestora_public_orders", "ordering": ("-created_at",)},
        ),
    ]
