import os
import runpy
from pathlib import Path
from unittest import mock

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from apps.core.storage import PrivateS3MediaStorage


SETTINGS_PATH = Path(__file__).resolve().parents[3] / "config" / "settings.py"
CONTROLLED_ENV_KEYS = {
    "DATABASE_URL",
    "DB_SECRET_ARN",
    "DATABASE_SSL_ROOT_CERT",
    "DATABASE_SSL_REQUIRE",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "USE_S3_STORAGE",
    "AWS_STORAGE_BUCKET_NAME",
    "AWS_S3_REGION_NAME",
    "AWS_REGION",
    "AWS_DEFAULT_REGION",
    "AWS_QUERYSTRING_EXPIRE",
    "AWS_S3_CUSTOM_DOMAIN",
    "AWS_CLOUDFRONT_KEY_ID",
    "AWS_CLOUDFRONT_KEY",
    "CSRF_TRUSTED_ORIGINS",
    "SECURE_SSL_REDIRECT",
    "SESSION_COOKIE_SECURE",
    "CSRF_COOKIE_SECURE",
    "SECURE_HSTS_SECONDS",
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    "SECURE_HSTS_PRELOAD",
}


def load_settings(**environment):
    clean_environment = {
        key: value
        for key, value in os.environ.items()
        if key not in CONTROLLED_ENV_KEYS
    }
    clean_environment.update(environment)
    with mock.patch.dict(os.environ, clean_environment, clear=True):
        return runpy.run_path(str(SETTINGS_PATH))


class AwsSettingsTests(SimpleTestCase):
    def test_secret_database_requires_split_location_and_verifies_server(self):
        configured = load_settings(
            DB_SECRET_ARN="arn:aws:secretsmanager:ap-south-1:123456789012:secret:database-test",
            DB_HOST="database.internal", DB_PORT="5432", DB_NAME="uvpro",
            DATABASE_SSL_ROOT_CERT="/app/certs/rds-global-bundle.pem",
        )
        database = configured["DATABASES"]["default"]
        self.assertEqual(database["ENGINE"], "config.db.secrets_postgresql")
        self.assertEqual(database["OPTIONS"]["sslmode"], "verify-full")
        self.assertEqual(database["PASSWORD"], "")
        with self.assertRaises(ImproperlyConfigured):
            load_settings(DB_SECRET_ARN="not-an-arn")

    def test_local_defaults_use_sqlite_and_filesystem_storage(self):
        configured = load_settings()

        self.assertFalse(configured["USE_S3_STORAGE"])
        self.assertEqual(
            configured["STORAGES"]["default"]["BACKEND"],
            "django.core.files.storage.FileSystemStorage",
        )
        self.assertEqual(
            configured["DATABASES"]["default"]["ENGINE"],
            "django.db.backends.sqlite3",
        )

    def test_bucket_auto_enables_private_s3_without_static_credentials(self):
        configured = load_settings(
            AWS_STORAGE_BUCKET_NAME="uvpro-private-media",
            AWS_S3_REGION_NAME="ap-south-1",
            AWS_QUERYSTRING_EXPIRE="900",
        )

        storage = configured["STORAGES"]["default"]
        options = storage["OPTIONS"]
        self.assertTrue(configured["USE_S3_STORAGE"])
        self.assertEqual(storage["BACKEND"], "apps.core.storage.PrivateS3MediaStorage")
        self.assertEqual(options["bucket_name"], "uvpro-private-media")
        self.assertEqual(options["region_name"], "ap-south-1")
        self.assertIsNone(options["default_acl"])
        self.assertTrue(options["querystring_auth"])
        self.assertEqual(options["querystring_expire"], 900)
        self.assertIsNone(options["endpoint_url"])
        self.assertNotIn("access_key", options)
        self.assertNotIn("secret_key", options)

    def test_explicit_false_keeps_filesystem_even_when_bucket_is_set(self):
        configured = load_settings(
            USE_S3_STORAGE="false",
            AWS_STORAGE_BUCKET_NAME="uvpro-private-media",
            AWS_S3_REGION_NAME="ap-south-1",
        )

        self.assertFalse(configured["USE_S3_STORAGE"])
        self.assertEqual(
            configured["STORAGES"]["default"]["BACKEND"],
            "django.core.files.storage.FileSystemStorage",
        )

    def test_enabled_s3_requires_bucket_and_region(self):
        with self.subTest("missing bucket"):
            with self.assertRaisesMessage(
                ImproperlyConfigured, "AWS_STORAGE_BUCKET_NAME is required"
            ):
                load_settings(
                    USE_S3_STORAGE="true",
                    AWS_S3_REGION_NAME="ap-south-1",
                )

        with self.subTest("missing region"):
            with self.assertRaisesMessage(
                ImproperlyConfigured, "AWS_S3_REGION_NAME is required"
            ):
                load_settings(
                    USE_S3_STORAGE="true",
                    AWS_STORAGE_BUCKET_NAME="uvpro-private-media",
                )

    def test_signed_url_expiry_must_fit_s3_presign_limits(self):
        for expiry in ("0", "604801", "not-a-number"):
            with self.subTest(expiry=expiry):
                with self.assertRaises(ImproperlyConfigured):
                    load_settings(AWS_QUERYSTRING_EXPIRE=expiry)

    def test_custom_domain_requires_cloudfront_signing_keys(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured, "private CloudFront domain requires"
        ):
            load_settings(
                AWS_STORAGE_BUCKET_NAME="uvpro-private-media",
                AWS_S3_REGION_NAME="ap-south-1",
                AWS_S3_CUSTOM_DOMAIN="media.example.com",
            )

    def test_cloudfront_configuration_preserves_private_key_newlines(self):
        configured = load_settings(
            AWS_STORAGE_BUCKET_NAME="uvpro-private-media",
            AWS_S3_REGION_NAME="ap-south-1",
            AWS_S3_CUSTOM_DOMAIN="media.example.com",
            AWS_CLOUDFRONT_KEY_ID="K1234567890",
            AWS_CLOUDFRONT_KEY="first-line\\nsecond-line",
        )

        options = configured["STORAGES"]["default"]["OPTIONS"]
        self.assertEqual(options["custom_domain"], "media.example.com")
        self.assertEqual(options["cloudfront_key_id"], "K1234567890")
        self.assertEqual(options["cloudfront_key"], "first-line\nsecond-line")

    def test_split_rds_environment_builds_postgresql_configuration(self):
        configured = load_settings(
            DB_HOST="database.internal",
            DB_PORT="5432",
            DB_NAME="uvpro",
            DB_USER="uvpro_app",
            DB_PASSWORD="secret-value",
            DATABASE_SSL_REQUIRE="true",
        )

        database = configured["DATABASES"]["default"]
        self.assertEqual(database["ENGINE"], "django.db.backends.postgresql")
        self.assertEqual(database["HOST"], "database.internal")
        self.assertEqual(database["PORT"], "5432")
        self.assertEqual(database["NAME"], "uvpro")
        self.assertEqual(database["USER"], "uvpro_app")
        self.assertEqual(database["PASSWORD"], "secret-value")
        self.assertEqual(database["OPTIONS"], {"sslmode": "require"})

    def test_partial_split_rds_environment_fails_early(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured, "Incomplete split database configuration"
        ):
            load_settings(DB_HOST="database.internal")

    def test_db_port_alone_does_not_disable_local_sqlite_default(self):
        configured = load_settings(DB_PORT="5432")

        self.assertEqual(
            configured["DATABASES"]["default"]["ENGINE"],
            "django.db.backends.sqlite3",
        )

    def test_production_transport_security_is_environment_controlled(self):
        configured = load_settings(
            CSRF_TRUSTED_ORIGINS="https://app.example.com,https://admin.example.com",
            SESSION_COOKIE_SECURE="true",
            CSRF_COOKIE_SECURE="true",
            SECURE_HSTS_SECONDS="31536000",
            SECURE_HSTS_INCLUDE_SUBDOMAINS="true",
            SECURE_HSTS_PRELOAD="true",
        )

        self.assertEqual(
            configured["CSRF_TRUSTED_ORIGINS"],
            ["https://app.example.com", "https://admin.example.com"],
        )
        self.assertTrue(configured["SESSION_COOKIE_SECURE"])
        self.assertTrue(configured["CSRF_COOKIE_SECURE"])
        self.assertEqual(configured["SECURE_HSTS_SECONDS"], 31536000)
        self.assertTrue(configured["SECURE_HSTS_INCLUDE_SUBDOMAINS"])
        self.assertTrue(configured["SECURE_HSTS_PRELOAD"])


class PrivateS3MediaStorageTests(SimpleTestCase):
    def create_storage(self, **overrides):
        options = {
            "bucket_name": "uvpro-private-media",
            "region_name": "ap-south-1",
            "access_key": "test-access-key",
            "secret_key": "test-secret-key",
            "querystring_expire": 600,
        }
        options.update(overrides)
        return PrivateS3MediaStorage(**options)

    def test_defaults_are_private_and_non_overwriting(self):
        storage = self.create_storage()

        self.assertIsNone(storage.default_acl)
        self.assertTrue(storage.querystring_auth)
        self.assertFalse(storage.file_overwrite)

    def test_s3_urls_are_signed_and_expire(self):
        url = self.create_storage().url("receipts/order-123.pdf")

        self.assertIn("X-Amz-Signature=", url)
        self.assertIn("X-Amz-Expires=600", url)

    def test_unsafe_storage_overrides_fail_early(self):
        unsafe_options = (
            ({"querystring_auth": False}, "requires signed URLs"),
            (
                {"endpoint_url": "https://storage.example.com"},
                "does not support custom endpoints",
            ),
            (
                {"custom_domain": "media.example.com"},
                "requires a CloudFront signer",
            ),
        )
        for overrides, message in unsafe_options:
            with self.subTest(overrides=overrides):
                with self.assertRaisesMessage(ImproperlyConfigured, message):
                    self.create_storage(**overrides)

    def test_custom_domain_url_uses_cloudfront_signer(self):
        signer = mock.Mock()
        signer.generate_presigned_url.return_value = "https://signed.example/media"
        storage = self.create_storage(
            custom_domain="media.example.com",
            cloudfront_signer=signer,
        )

        url = storage.url("receipts/order-123.pdf")

        self.assertEqual(url, "https://signed.example/media")
        signer.generate_presigned_url.assert_called_once()

