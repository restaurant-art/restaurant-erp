from decimal import Decimal
from tempfile import TemporaryDirectory

from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.core.models import SharedAppState
from apps.core.production_models import KitchenBalance, KitchenItem, KitchenTransaction
from .test_pack_stock import PackFixture


class WorkflowRegressionTests(PackFixture, TestCase):
    def test_packing_is_atomic_and_unpacks_only_verified_stock(self):
        source = self.product(key="bulk-rice", unit="kg")
        self.cmd("receipt", {"item": source.pk, "location": self.store.pk,
            "quantity": 2000, "total_cost": 200, "source": "repack-opening", "reason": "Counted stock"})
        lines = [{"source_id": source.legacy_key, "pack_grams": 125, "pack_count": 4, "selling_price": 15, "mrp": 20}]
        payload = {"location": self.store.pk, "lines": lines}
        with self.assertRaisesRegex(ValidationError, "Insufficient"):
            self.cmd("repack", {**payload, "lines": lines + [{**lines[0], "pack_grams": 250, "pack_count": 10}]})
        self.assertFalse(KitchenTransaction.objects.filter(kind="repack").exists())
        self.assertEqual(KitchenBalance.objects.get(lot__item=source).quantity, 2000)

        result = self.cmd("repack", payload, "pack-four")
        self.assertEqual(self.cmd("repack", payload, "pack-four"), result)
        product = result["outputs"][0]["product"]
        source_row = next(row for row in SharedAppState.objects.get(state_key="vestora-inventory-A").state_value
                          if row["id"] == source.legacy_key)
        self.assertRegex(product["internalBarcode"], r"^[0-9]{5}$")
        self.assertNotEqual(source_row["internalBarcode"], product["internalBarcode"])
        pack = KitchenItem.objects.get(site=self.site, legacy_key=product["id"])
        self.balance(pack, 4, 0, 500)
        self.sale(pack, 1, "sell-one-pack")
        self.cmd("repack", {"direction": "reverse", "location": self.store.pk,
            "lines": [{"product_id": product["id"], "pack_count": 2}]})
        self.balance(pack, 1, 0, 125)
        bulk = KitchenBalance.objects.filter(lot__item=source)
        self.assertEqual(sum(row.quantity for row in bulk), 1750)
        self.assertEqual(sum(row.value for row in bulk), 175)

    def test_missing_cost_follows_mixed_batch_into_sale(self):
        unpriced = self.product(key="unpriced", unit="kg")
        priced = self.product(key="priced", unit="kg")
        self.cmd("receipt", {"item": priced.pk, "location": self.store.pk,
            "quantity": 1000, "total_cost": 100, "source": "known-cost", "reason": "Counted stock"})
        recipe = self.recipe([(unpriced, 250), (priced, 250)], [(self.rice, 500, 1)])
        batch = self.cmd("draft_batch", {"recipe": recipe["id"], "reference": "mixed-cost", "scale": 1,
            "source_location": self.store.pk, "destination_location": self.kitchen.pk})
        posted = self.cmd("post_batch", {"batch": batch["id"],
            "inputs": [{"item": unpriced.pk, "quantity": 250}, {"item": priced.pk, "quantity": 250}],
            "outputs": [{"item": self.rice.pk, "quantity": 500}]})
        self.assertTrue(posted["cost_incomplete"])
        self.assertEqual(Decimal(posted["total_cost"]), 25)
        self.cmd("recipe", {"key": "rice-portion", "name": "Rice", "kind": "serving",
            "stock_method": "prepared", "components": [{"item": self.rice.pk, "quantity": 250}]})
        self.cmd("confirm", {"reference": "rice-sale", "location": self.kitchen.pk,
            "lines": [{"key": "rice", "menu_key": "rice-portion", "quantity": 1, "unit_price": 50}]})
        self.cmd("fulfill", {"reference": "rice-sale", "targets": {"rice": 1}})
        from apps.core.production_reports import posted_sale_costs, report
        from django.utils import timezone
        sale = next(row for row in report(self.site, timezone.localdate())["sales"] if row["order"] == "rice-sale")
        self.assertEqual(Decimal(sale["food_cost"]), Decimal("12.50"))
        self.assertIsNone(sale["food_margin_before_discount"])
        self.assertFalse(posted_sale_costs(self.site, ["rice-sale"])["rice-sale"]["complete"])

    def test_export_download_contains_saved_business_data_and_is_branch_scoped(self):
        client = APIClient()
        client.force_authenticate(self.user)
        SharedAppState.objects.create(state_key="vestora-sales-ledger", state_value=[
            {"storeId": "A", "total": 54, "tax": 2.57, "date": "2026-11-13"},
            {"storeId": "other", "total": 999, "tax": 0, "date": "2026-11-13"},
        ])
        with TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media, CELERY_TASK_ALWAYS_EAGER=True):
            with self.captureOnCommitCallbacks(execute=True):
                job = client.post("/api/report-exports/", {"branch": self.branch.pk, "report_type": "daily-sales",
                    "filters": {"from": "2026-11-13", "to": "2026-11-13"}}, format="json")
            self.assertEqual(job.status_code, 201, job.data)
            response = client.get(f"/api/report-exports/{job.data['id']}/download/")
            self.assertEqual(response.status_code, 200)
            content = b"".join(response.streaming_content).decode()
            self.assertIn("2026-11-13,1,54.00,0.00,2.57,51.43", content)
            self.assertNotIn("999", content)
