from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


class StorageStatusTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="storage-admin",
            email="storage@example.test",
            password="test-only-password",
            user_type="super_admin",
            is_superuser=True,
        )
        self.client = APIClient()
        self.url = "/api/cloud/storage-status/"

    def test_status_requires_authentication(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)

    @override_settings(USE_S3_STORAGE=False)
    def test_local_storage_status_exposes_no_credentials(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "provider": "local",
            "configured": False,
            "region": None,
            "private": True,
            "signedUrls": False,
        })

    @override_settings(
        USE_S3_STORAGE=True,
        AWS_S3_REGION_NAME="ap-south-1",
        AWS_QUERYSTRING_AUTH=True,
    )
    def test_s3_status_only_returns_non_sensitive_configuration(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "provider": "amazon_s3",
            "configured": True,
            "region": "ap-south-1",
            "private": True,
            "signedUrls": True,
        })
        self.assertNotIn("bucket", response.json())
        self.assertNotIn("accessKey", response.json())
