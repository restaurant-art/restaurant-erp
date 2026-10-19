import hashlib
import json
import os
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest import skipUnless
from unittest.mock import AsyncMock, patch

from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings
from django.db import connection

from apps.core.consumers import RestaurantEventsConsumer
from config.db.credentials import read_database_credentials


class SecretConnectionTests(SimpleTestCase):
    @skipUnless(connection.vendor == "postgresql", "PostgreSQL driver test runs in the PostgreSQL CI job")
    @override_settings(DB_SECRET_ARN="arn:aws:secretsmanager:ap-south-1:123456789012:secret:database")
    def test_new_connections_read_new_password_without_restart(self):
        from config.db.secrets_postgresql.base import DatabaseWrapper, PostgreSQLWrapper
        wrapper = DatabaseWrapper({"ENGINE": "config.db.secrets_postgresql", "NAME": "uvpro"})
        with patch("config.db.secrets_postgresql.base.read_database_credentials", side_effect=[
            {"username": "uvpro_app", "password": "before-rotation"},
            {"username": "uvpro_app", "password": "after-rotation"},
        ]), patch.object(PostgreSQLWrapper, "get_new_connection") as connect:
            wrapper.get_new_connection({"host": "database"})
            wrapper.get_new_connection({"host": "database"})
        self.assertEqual(connect.call_args_list[0].args[0]["password"], "before-rotation")
        self.assertEqual(connect.call_args_list[1].args[0]["password"], "after-rotation")

    def test_secret_read_uses_current_version(self):
        with patch("config.db.credentials.boto3.client") as factory:
            factory.return_value.get_secret_value.return_value = {"SecretString": '{"username":"uvpro_app","password":"secret"}'}
            credentials = read_database_credentials("arn:aws:secretsmanager:ap-south-1:123456789012:secret:db")
        self.assertEqual(credentials["username"], "uvpro_app")
        self.assertEqual(factory.return_value.get_secret_value.call_args.kwargs["VersionStage"], "AWSCURRENT")


class BootstrapAndTransferTests(TestCase):
    def test_bootstrap_does_not_reset_existing_administrator(self):
        secret = {"SecretString": json.dumps({"email": "owner@example.com", "password": "random-long-initial-password-123"})}
        with patch.dict(os.environ, {"BOOTSTRAP_ADMIN_SECRET_ARN": "arn:aws:secretsmanager:ap-south-1:123456789012:secret:bootstrap"}), patch("apps.core.management.commands.bootstrap_admin.boto3.client") as factory:
            factory.return_value.get_secret_value.return_value = secret
            call_command("bootstrap_admin", stdout=StringIO())
            user = get_user_model().objects.get(email="owner@example.com")
            user.set_password("changed-by-owner")
            user.save()
            call_command("bootstrap_admin", stdout=StringIO())
            user.refresh_from_db()
            self.assertTrue(user.check_password("changed-by-owner"))
            self.assertTrue(user.is_superuser)

    def test_snapshot_round_trip_and_overwrite_protection(self):
        User = get_user_model()
        user = User.objects.create_user(username="source@example.com", email="source@example.com", password="keep-this-password")
        original_pk = user.pk
        with TemporaryDirectory() as directory:
            source = Path(directory) / "snapshot.json"
            call_command("transfer_data", "export", str(source), stdout=StringIO())
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            with self.assertRaises(CommandError):
                call_command("transfer_data", "import", str(source), sha256="wrong", stdout=StringIO())
            with self.assertRaises(CommandError):
                call_command("transfer_data", "import", str(source), sha256=digest, stdout=StringIO())
            User.objects.all().delete()
            call_command("transfer_data", "import", str(source), sha256=digest, stdout=StringIO())
        restored = User.objects.get(pk=original_pk)
        self.assertTrue(restored.check_password("keep-this-password"))


class WebsocketIsolationTests(SimpleTestCase):
    def connect_as(self, user):
        consumer = RestaurantEventsConsumer()
        consumer.scope = {"user": user, "url_route": {"kwargs": {"restaurant_id": 1}}}
        consumer.channel_name = "test-channel"
        consumer.channel_layer = SimpleNamespace(group_add=AsyncMock())
        consumer.accept = AsyncMock()
        consumer.close = AsyncMock()
        async_to_sync(consumer.connect)()
        return consumer

    def test_unauthenticated_and_other_tenant_connections_are_rejected(self):
        for user, code in [(None, 4401), (SimpleNamespace(is_authenticated=True, is_active=True, is_superuser=False, restaurant_id=2), 4403)]:
            consumer = self.connect_as(user)
            consumer.close.assert_awaited_once_with(code=code)
            consumer.channel_layer.group_add.assert_not_awaited()

    def test_same_tenant_can_subscribe(self):
        consumer = self.connect_as(SimpleNamespace(is_authenticated=True, is_active=True, is_superuser=False, restaurant_id=1))
        consumer.accept.assert_awaited_once()
