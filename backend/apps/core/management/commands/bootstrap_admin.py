import json
import os

import boto3
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import transaction


class Command(BaseCommand):
    help = "Create a first platform administrator from a dedicated Secrets Manager secret."

    def handle(self, *args, **options):
        arn = os.getenv("BOOTSTRAP_ADMIN_SECRET_ARN", "")
        if not arn:
            self.stdout.write("No administrator bootstrap requested.")
            return
        secret = boto3.client("secretsmanager", region_name=arn.split(":")[3]).get_secret_value(SecretId=arn)
        credentials = json.loads(secret["SecretString"])
        email = str(credentials.get("email", "")).strip().lower()
        password = credentials.get("password", "")
        try:
            validate_email(email)
        except ValidationError as error:
            raise CommandError("Bootstrap secret requires a valid email.") from error
        if not isinstance(password, str) or len(password) < 20:
            raise CommandError("Bootstrap password must contain at least 20 characters.")
        User = get_user_model()
        with transaction.atomic():
            if User.objects.filter(is_superuser=True).exists():
                self.stdout.write("An administrator already exists; no account was changed.")
                return
            if User.objects.filter(email__iexact=email).exists() or User.objects.filter(username=email).exists():
                raise CommandError("Bootstrap email belongs to an existing account; refusing to promote it.")
            User.objects.create_superuser(username=email, email=email, password=password, user_type="super_admin")
        self.stdout.write(self.style.SUCCESS("First administrator created. Retrieve the password securely from Secrets Manager and change it after login."))
