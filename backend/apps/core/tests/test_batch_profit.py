from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import SharedAppState
from apps.core.production_batch_sales import batch_sales_report
from apps.core.production_models import KitchenFulfillment, KitchenTransaction
from .test_production import KitchenFixture


class BatchProfitTests(KitchenFixture, TestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        self.yesterday = self.today - timedelta(days=1)
        self.site.cutover_at -= timedelta(days=2)
        self.site.save(update_fields=["cutover_at"])
        SharedAppState.objects.create(state_key="vestora-stores", state_value=[
            {"id": self.site.store_id, "restaurantId": self.restaurant.pk},
        ])

    def post(self, reference, day, inputs, outputs, **actuals):
        recipe = self.recipe(inputs, [(item, quantity, weight) for item, quantity, weight in outputs])
        draft = self.cmd("draft_batch", {"recipe": recipe["id"], "reference": reference,
            "source_location": self.kitchen.pk, "destination_location": self.kitchen.pk, "business_date": day.isoformat()})
        return self.cmd("post_batch", {"batch": draft["id"], "business_date": day.isoformat(),
            "inputs": [{"item": item.pk, "quantity": str(quantity)} for item, quantity in inputs],
            "outputs": [{"item": item.pk, "quantity": str(quantity)} for item, quantity, _ in outputs], **actuals})

    def serve(self, reference, portions):
        items = [{"id": menu, "name": menu, "stockLineKey": menu, "qty": qty, "price": price, "tax": 5}
                 for menu, qty, price in portions]
        self.cmd("confirm", {"reference": reference, "location": self.kitchen.pk, "lines": [
            {"key": item["stockLineKey"], "menu_key": item["id"], "quantity": str(item["qty"]),
             "unit_price": str(item["price"]), "tax_rate": str(item["tax"])} for item in items]})
        self.fulfill(reference, **{item["id"]: item["qty"] for item in items})
        return items

    def save_bill(self, reference, items, **totals):
        row, _ = SharedAppState.objects.get_or_create(state_key="vestora-sales-ledger", defaults={"state_value": []})
        row.state_value.append({"id": f"bill-{reference}", "tableOrderId": reference, "storeId": self.site.store_id,
            "items": items, "taxInclusive": True, **totals})
        row.save()

    def test_batch_report_uses_later_pos_bills_and_reconciles_full_sale(self):
        raw_chicken = self.item("Raw chicken", "raw", "g")
        container = self.item("Takeaway container", "resale", "piece")
        self.opening(raw_chicken, 1600, 360)
        self.opening(container, 4, 8)
        KitchenTransaction.objects.filter(site=self.site, kind="receipt").update(business_date=self.yesterday)
        self.post("BIRIYANI-5200", self.yesterday, [(self.raw_rice, 2000), (raw_chicken, 1600)],
                  [(self.rice, 4000, 1), (self.chicken, 12, 0)], direct_costs={str(self.chicken.pk): "360"})
        self.serving("Full", [(self.rice, 400), (self.chicken, 2), (container, 1)])
        self.serving("Half", [(self.rice, 250), (self.chicken, 1)])
        self.serving("Extra Rice", [(self.rice, 350)])
        portions = [("Full", 2, 189), ("Half", 2, 126), ("Extra Rice", 2, 63)]

        client = APIClient()
        client.force_authenticate(self.user)
        url = "/api/production/A/reports/"

        def report():
            response = client.get(url, {"view": "batch-profit", "date": self.yesterday.isoformat()})
            self.assertEqual(response.status_code, 200, response.data)
            return response.data["batches"][0]

        self.assertEqual(report()["status"], "In stock")
        items = self.serve("first", portions)
        self.assertEqual(report()["status"], "Awaiting billing")
        self.save_bill("first", items, total=756, taxableSubtotal=720)
        partial = report()
        self.assertEqual(partial["status"], "Partly sold")
        self.assertEqual(Decimal(partial["food_cost"]), 234)
        self.assertEqual(Decimal(partial["gross_profit"]), 486)
        self.assertEqual([Decimal(output["remaining"]) for output in partial["outputs"]], [2000, 6])

        self.save_bill("second", self.serve("second", portions), total=714, taxableSubtotal=680, lineDiscounts=[0, 0, 42])
        SharedAppState.objects.create(state_key="vestora-refund-ledger", state_value=[
            {"id": "refund", "storeId": "A", "billId": "bill-second", "amount": 105, "taxAmount": 5},
        ])
        final = report()
        self.assertEqual(final["status"], "Fully sold")
        for key, expected in {"production_cost": 460, "net_sales": 1300, "food_cost": 468, "gross_profit": 832, "margin_pct": 64}.items():
            self.assertEqual(Decimal(final[key]), expected, key)
        self.assertEqual([Decimal(output["sold"]) for output in final["outputs"]], [4000, 12])
        self.assertEqual([Decimal(output["remaining"]) for output in final["outputs"]], [0, 0])
        servings = {row["name"]: row for row in final["servings"]}
        self.assertEqual({name: Decimal(row["cost_per_portion"]) for name, row in servings.items()},
                         {"Full": Decimal(72), "Half": Decimal("36.25"), "Extra Rice": Decimal("8.75")})
        self.assertEqual(Decimal(servings["Full"]["average_rate"]), 189)
        self.assertEqual(Decimal(servings["Extra Rice"]["net_sales"]), Decimal("188.23529412"))
        self.assertEqual(Decimal(servings["Extra Rice"]["net_rate"]).quantize(Decimal("0.01")), Decimal("47.06"))
        self.assertEqual(client.get(url, {"view": "batch-profit", "date": self.today.isoformat()}).data["batches"], [])

        fulfillment = KitchenFulfillment.objects.get(line__order__site=self.site, line__order__reference="first", line__key="Full")
        rice_issue = next(entry for entry in fulfillment.allocations if entry["item"] == self.rice.pk)
        self.cmd("disposition", {"fulfillment": fulfillment.pk, "outcome": "usable_return", "location": self.kitchen.pk,
            "reason": "Verified usable return", "returns": [{"movement": rice_issue["movement"], "quantity": 350}]})
        reopened = report()
        self.assertEqual(reopened["status"], "Partly sold")
        self.assertEqual(Decimal(reopened["outputs"][0]["remaining"]), 350)
        self.assertEqual(Decimal(reopened["food_cost"]), Decimal("459.25"))

    def test_serving_with_two_batches_splits_revenue_without_changing_production_cost(self):
        self.post("older", self.yesterday, [(self.flour, 500)], [(self.rice, 500, 1)])
        self.post("newer", self.today, [(self.flour, 1000)], [(self.rice, 500, 1)])
        self.serving("Platter", [(self.rice, 1000)])
        self.save_bill("mixed", self.serve("mixed", [("Platter", 1, 210)]), total=210, tax=10)

        first = batch_sales_report(self.site, self.yesterday)[0]
        second = batch_sales_report(self.site, self.today)[0]
        self.assertEqual([row["status"] for row in (first, second)], ["Fully sold", "Fully sold"])
        self.assertEqual([Decimal(row["net_sales"]) for row in (first, second)], [100, 100])
        self.assertEqual([Decimal(row["food_cost"]) for row in (first, second)], [50, 100])
        self.assertEqual([Decimal(row["gross_profit"]) for row in (first, second)], [50, 0])
        self.assertEqual([Decimal(row["servings"][0]["portions"]) for row in (first, second)], [Decimal("0.5")] * 2)

    def test_unpriced_sale_with_wasted_remainder_keeps_margin_pending(self):
        raw = self.item("Unpriced ingredient", "raw", "g")
        self.post("without-cost", self.today, [(raw, 250)], [(self.rice, 500, 1)])
        self.serving("Bowl", [(self.rice, 250)])
        self.save_bill("bowl", self.serve("bowl", [("Bowl", 1, 105)]), total=105, tax=5)
        self.cmd("usage", {"item": self.rice.pk, "quantity": 250, "location": self.kitchen.pk,
            "source": "waste", "category": "waste", "reason": "Discarded remaining portion"})
        batch = batch_sales_report(self.site, self.today)[0]
        self.assertEqual(batch["status"], "Closed with other use")
        self.assertEqual(Decimal(batch["outputs"][0]["other_use"]), 250)
        self.assertEqual(Decimal(batch["net_sales"]), 100)
        self.assertIsNone(batch["production_cost"])
        self.assertIsNone(batch["gross_profit"])
        self.assertIsNone(batch["margin_pct"])

    def test_cancelled_food_used_before_billing_is_other_use(self):
        self.post("cancelled", self.today, [(self.flour, 500)], [(self.rice, 500, 1)])
        self.serving("Bowl", [(self.rice, 500)])
        self.confirm("cancelled-order", [("Bowl", 1)])
        self.cmd("cancel", {"reference": "cancelled-order", "reason": "Customer cancelled after preparation",
            "disposition": "waste", "used_targets": {"Bowl": "1"}})
        batch = batch_sales_report(self.site, self.today)[0]
        self.assertEqual(batch["status"], "Closed with other use")
        self.assertEqual(Decimal(batch["outputs"][0]["other_use"]), 500)
        self.assertEqual(Decimal(batch["net_sales"]), 0)
