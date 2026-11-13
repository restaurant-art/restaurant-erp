from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [("core", "0013_kitchencount_scope")]

    operations = [
        migrations.RemoveConstraint(
            model_name="kitchenbalance",
            name="kitchen_nonnegative_value",
        ),
        migrations.AddConstraint(
            model_name="kitchenbalance",
            constraint=models.CheckConstraint(
                condition=Q(value__gte=0) | Q(quantity__lt=0),
                name="kitchen_negative_value_only_for_debt",
            ),
        ),
    ]
