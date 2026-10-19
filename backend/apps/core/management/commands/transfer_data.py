import hashlib
import json
from pathlib import Path

from django.apps import apps
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Export application records, or import a checksum-verified snapshot into an empty database."

    def add_arguments(self, parser):
        parser.add_argument("action", choices=["export", "import"])
        parser.add_argument("path")
        parser.add_argument("--sha256", help="Required expected checksum when importing")

    def handle(self, *args, **options):
        path = Path(options["path"])
        if options["action"] == "export":
            if path.exists():
                raise CommandError("Destination already exists; refusing to overwrite it.")
            with path.open("x", encoding="utf-8") as output:
                call_command("dumpdata", "core", "auth.group", use_natural_foreign_keys=True, stdout=output, verbosity=0)
            self.stdout.write("Snapshot exported. It contains private business data and password hashes; keep it encrypted and outside source control.")
            self.stdout.write("SHA256=" + hashlib.sha256(path.read_bytes()).hexdigest())
            return
        expected = options["sha256"]
        if not expected:
            raise CommandError("--sha256 from the trusted source export is required.")
        payload = path.read_bytes()
        if hashlib.sha256(payload).hexdigest().lower() != expected.lower():
            raise CommandError("Snapshot checksum mismatch; no records imported.")
        try:
            records = json.loads(payload)
        except (ValueError, UnicodeError) as error:
            raise CommandError("Snapshot is not valid JSON.") from error
        if not isinstance(records, list) or any(
            not isinstance(record, dict) or not (
                str(record.get("model", "")).startswith("core.")
                or record.get("model") == "auth.group"
            ) for record in records
        ):
            raise CommandError("Only core application records and auth groups may be imported.")
        with transaction.atomic():
            occupied = [model._meta.label for model in apps.get_app_config("core").get_models() if model.objects.exists()]
            if occupied or apps.get_model("auth", "Group").objects.exists():
                raise CommandError("Target database already contains application records. Restore to a fresh target; no records were changed.")
            # Use Django's fixture loader for deferred foreign keys, M2M links,
            # constraints and PostgreSQL sequence reset. It is transaction-safe.
            call_command("loaddata", str(path.resolve()), verbosity=0)
            Integration = apps.get_model("core", "IntegrationSetting")
            for record in Integration.objects.filter(provider__in=["cloudflare_r2", "amazon_s3"]):
                record.credentials = {}
                record.config = {}
                record.enabled = False
                record.save(update_fields=["credentials", "config", "enabled"])
            # Reuse the idempotent provider migration after importing older data.
            from importlib import import_module
            migration = import_module("apps.core.migrations.0003_rename_r2_integration")
            migration.use_amazon_s3_provider(apps, None)
        self.stdout.write(self.style.SUCCESS(f"Imported {len(records)} records into the empty database. Verify login and business totals before DNS cutover."))
