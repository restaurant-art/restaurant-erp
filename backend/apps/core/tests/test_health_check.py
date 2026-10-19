from django.test import TestCase, override_settings
from unittest.mock import patch


@override_settings(ALLOWED_HOSTS=["pos.example.com"])
class HealthCheckHostTests(TestCase):
    def test_readiness_accepts_probe_host_and_checks_database(self):
        response = self.client.get("/api/ready/", HTTP_HOST="10.42.10.17")
        self.assertEqual(response.status_code, 200)
        with patch("django.db.connection.cursor", side_effect=RuntimeError("private database detail")):
            response = self.client.get("/api/ready/", HTTP_HOST="10.42.10.17")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable"})

    def test_private_ip_host_is_allowed_only_for_health_probe(self):
        response = self.client.get("/api/health/", HTTP_HOST="10.42.10.17")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "service": "UVPRO"})

    def test_private_ip_host_remains_rejected_for_application_routes(self):
        response = self.client.get("/api/schema/", HTTP_HOST="10.42.10.17")

        self.assertEqual(response.status_code, 400)
