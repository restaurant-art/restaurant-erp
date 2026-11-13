import unittest

from apps.core.whatsapp_bill_format import receipt_parameters, template_payload


class WhatsAppBillFormatTests(unittest.TestCase):
    def setUp(self):
        self.bill = {
            "storeName": "Market", "orderNumber": "ORD-123", "payment": "Cash",
            "items": [{"name": "Rice", "qty": 2, "price": "49.30"}],
            "subtotal": "98.60", "discount": 0, "tax": "4.70", "total": "98.60",
        }

    def test_payload_contains_the_complete_bill_with_exact_amounts(self):
        payload = template_payload("919876543210", "uvpro_invoice_confirmation", "en", self.bill)
        values = [parameter["text"] for parameter in payload["template"]["components"][0]["parameters"]]
        self.assertEqual(values, ["Market", "ORD-123", "2 x Rice (₹98.60)", "₹98.60", "₹0.00", "₹4.70", "₹98.60", "Cash"])
        self.assertEqual(payload["to"], "919876543210")

    def test_long_bill_is_rejected_instead_of_silently_dropping_items(self):
        self.bill["items"] = [{"name": "A" * 80, "qty": 1, "price": 1}] * 7
        with self.assertRaisesRegex(ValueError, "too long"):
            receipt_parameters(self.bill)

    def test_invalid_amount_is_rejected(self):
        self.bill["total"] = "NaN"
        with self.assertRaisesRegex(ValueError, "invalid amount"):
            receipt_parameters(self.bill)


if __name__ == "__main__":
    unittest.main()
