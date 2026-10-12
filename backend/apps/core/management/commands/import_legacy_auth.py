import csv
import json

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Import legacy auth users from a CSV export into the AWS-backed user database."

    def add_arguments(self, parser):
        parser.add_argument("source", help="CSV with email, encrypted_password, raw_user_meta_data and raw_app_meta_data")

    def handle(self, *args, **options):
        user_model = get_user_model()
        created = updated = skipped = 0
        try:
            handle = open(options["source"], newline="", encoding="utf-8")
        except OSError as error:
            raise CommandError(str(error)) from error
        with handle:
            for row in csv.DictReader(handle):
                email = str(row.get("email") or "").strip().lower()
                if "@" not in email:
                    skipped += 1
                    continue
                try:
                    metadata = json.loads(row.get("raw_user_meta_data") or "{}")
                    app_metadata = json.loads(row.get("raw_app_meta_data") or "{}")
                except json.JSONDecodeError:
                    metadata, app_metadata = {}, {}
                assigned = app_metadata.get("vestora") or {}
                defaults = {
                    "username": email,
                    "first_name": str(metadata.get("name") or "")[:150],
                    "user_type": str(assigned.get("role") or metadata.get("role") or "cashier")[:40],
                    "is_active": assigned.get("active") is not False,
                }
                user, was_created = user_model.objects.get_or_create(email__iexact=email, defaults={"email": email, **defaults})
                for field, value in defaults.items():
                    setattr(user, field, value)
                digest = str(row.get("encrypted_password") or "")
                if digest.startswith(("$2a$", "$2b$", "$2y$")):
                    # Keep the existing hash marker; the compatibility hasher upgrades it at next login.
                    user.password = f"supabase_bcrypt${digest}"
                elif was_created:
                    user.set_unusable_password()
                user.save()
                created += int(was_created)
                updated += int(not was_created)
        self.stdout.write(self.style.SUCCESS(f"Imported {created} new and {updated} existing users; skipped {skipped}."))
