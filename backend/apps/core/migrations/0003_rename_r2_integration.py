from django.db import migrations


def use_amazon_s3_provider(apps, schema_editor):
    integration_setting = apps.get_model("core", "IntegrationSetting")
    for legacy in integration_setting.objects.filter(provider="cloudflare_r2"):
        current = integration_setting.objects.filter(
            restaurant_id=legacy.restaurant_id,
            branch_id=legacy.branch_id,
            provider="amazon_s3",
        ).first()
        if current:
            current.enabled = current.enabled or legacy.enabled
            # Native AWS storage is configured only by server environment and
            # its IAM task role.  Never relabel or retain legacy endpoint and
            # key material as Amazon S3 configuration.
            current.config = {}
            current.credentials = {}
            current.save(update_fields=("enabled", "config", "credentials", "updated_at"))
            legacy.delete()
        else:
            legacy.provider = "amazon_s3"
            legacy.config = {}
            legacy.credentials = {}
            legacy.save(update_fields=("provider", "config", "credentials", "updated_at"))

    # Also scrub any AWS-labelled rows that may have been created before this
    # migration.  The application never needs bucket or IAM secrets in SQL.
    integration_setting.objects.filter(provider="amazon_s3").update(
        config={},
        credentials={},
    )


class Migration(migrations.Migration):
    dependencies = [("core", "0002_aws_cloud_compat")]

    # Secret deletion is intentionally irreversible.
    operations = [migrations.RunPython(use_amazon_s3_provider, migrations.RunPython.noop)]
