import hashlib
import json
from pathlib import Path

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db.models import FileField


def digest_file(storage, key):
    digest = hashlib.sha256()
    size = 0
    with storage.open(key, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
    return {"size": size, "sha256": digest.hexdigest()}


class Command(BaseCommand):
    help = "Create or verify checksums of all FileField media referenced by the current database."

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--output")
        group.add_argument("--verify")

    def handle(self, *args, **options):
        objects = {}
        failures = 0
        for model in apps.get_app_config("core").get_models():
            for field in model._meta.fields:
                if not isinstance(field, FileField):
                    continue
                for key in model.objects.exclude(**{field.name: ""}).values_list(field.name, flat=True).distinct():
                    if not key or key in objects:
                        continue
                    try:
                        objects[key] = digest_file(field.storage, key)
                    except Exception:
                        failures += 1
        if failures:
            raise CommandError(f"{failures} referenced media objects could not be read. Resolve missing files before cutover.")
        if options["verify"]:
            expected = json.loads(Path(options["verify"]).read_text(encoding="utf-8"))
            if expected != objects:
                raise CommandError("Media keys, byte lengths or SHA256 checksums differ; do not cut over.")
            self.stdout.write(self.style.SUCCESS(f"Verified {len(objects)} media objects byte-for-byte."))
        else:
            destination = Path(options["output"])
            if destination.exists():
                raise CommandError("Manifest destination already exists; refusing to overwrite it.")
            with destination.open("x", encoding="utf-8") as output:
                json.dump(objects, output, sort_keys=True, indent=2)
            self.stdout.write(self.style.SUCCESS(f"Recorded {len(objects)} media objects."))
