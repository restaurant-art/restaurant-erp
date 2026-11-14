from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0011_remove_kitchenbalance_kitchen_nonnegative_balance_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="kitchencount",
            name="mode",
            field=models.CharField(default="legacy", max_length=12),
        ),
    ]
