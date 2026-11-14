from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0012_kitchencount_mode")]

    operations = [
        migrations.AddField(
            model_name="kitchencount",
            name="scope",
            field=models.CharField(default="all", max_length=12),
        ),
    ]
