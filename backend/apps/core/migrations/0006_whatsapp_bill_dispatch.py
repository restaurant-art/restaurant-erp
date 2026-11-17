from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0005_action_otp_challenge")]

    operations = [
        migrations.CreateModel(
            name="WhatsAppBillDispatch",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("store_id", models.CharField(max_length=100)),
                ("bill_id", models.CharField(max_length=120)),
                ("status", models.CharField(default="sending", max_length=20)),
                ("message_id", models.CharField(blank=True, max_length=255)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"constraints": [models.UniqueConstraint(fields=("store_id", "bill_id"), name="core_whatsapp_bill_unique")]},
        ),
    ]
