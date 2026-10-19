from django.test import TestCase

from apps.core.models import IntegrationSetting, Restaurant
from apps.core.serializers import IntegrationSettingSerializer


class IntegrationSettingSerializerTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(
            name="Secure Kitchen",
            legal_name="Secure Kitchen Pvt Ltd",
            slug="secure-kitchen",
            owner_name="Owner",
            owner_email="owner@example.test",
            owner_mobile="9999999999",
        )

    def test_credentials_are_accepted_but_never_returned(self):
        setting = IntegrationSetting.objects.create(
            restaurant=self.restaurant,
            provider="payment_gateway",
            enabled=True,
            credentials={"access_key": "must-not-leak", "secret_key": "also-secret"},
            config={"region": "ap-south-1"},
        )

        payload = IntegrationSettingSerializer(setting).data

        self.assertNotIn("credentials", payload)
        self.assertTrue(payload["configured"])
        self.assertEqual(payload["config"], {"region": "ap-south-1"})

    def test_amazon_s3_rejects_browser_managed_secrets_and_configuration(self):
        serializer = IntegrationSettingSerializer(data={
            "provider": "amazon_s3",
            "branch": None,
            "enabled": True,
            "credentials": {"access_key": "must-not-be-stored"},
            "config": {"bucket": "must-not-be-stored"},
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn("credentials", serializer.errors)
        self.assertIn("config", serializer.errors)

    def test_empty_credentials_report_not_configured(self):
        setting = IntegrationSetting.objects.create(
            restaurant=self.restaurant,
            provider="amazon_s3",
            credentials={},
        )

        self.assertFalse(IntegrationSettingSerializer(setting).data["configured"])
