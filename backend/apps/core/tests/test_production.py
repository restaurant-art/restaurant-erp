import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal as D

from django.db import close_old_connections, OperationalError
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.core.models import Branch, Restaurant, User, SharedAppState, InventoryItem
from apps.core.production_models import *
from apps.core.production_service import execute
from apps.core.production_cutover import review
from apps.core.production_reports import availability, report, trace
from apps.core.production_domain import quantity


class KitchenFixture:
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Test", slug=str(uuid.uuid4()))
        self.branch = Branch.objects.create(restaurant=self.restaurant, name="Branch", code="A")
        self.user = User.objects.create_user(username=str(uuid.uuid4()), user_type="owner", restaurant=self.restaurant)
        self.site = ProductionSite.objects.create(store_id="A", branch=self.branch)
        self.store = KitchenLocation.objects.create(site=self.site, name="Store")
        self.kitchen = KitchenLocation.objects.create(site=self.site, name="Kitchen")
        self.flour = self.item("Flour", "raw", "g")
        self.raw_rice = self.item("Raw rice", "raw", "g")
        self.rice = self.item("Cooked rice excluding chicken", "prepared", "g")
        self.chicken = self.item("Cooked chicken", "prepared", "piece")
        self.chapathi = self.item("Chapathi", "prepared", "piece")
        self.dough = self.item("Dough", "intermediate", "g")
        self.opening(self.flour, 10000, 1000)
        self.opening(self.raw_rice, 10000, 500)
        self.site.enabled = True
        self.site.cutover_at = timezone.now()
        self.site.save()

    def cmd(self, name, data, key=None, preview=False):
        return execute(self.site, self.user, name, key or str(uuid.uuid4()), data, preview)

    def item(self, name, kind, unit):
        result = self.cmd("item", {"name": name, "kind": kind, "base_unit": unit})
        return KitchenItem.objects.get(pk=result["id"])

    def opening(self, item, qty, cost, location=None):
        # Fixture setup is explicit and isolated; never live demonstration seeding.
        enabled = self.site.enabled
        ProductionSite.objects.filter(pk=self.site.pk).update(enabled=False)
        result = self.cmd("receipt", {"item": item.pk, "quantity": str(qty), "total_cost": str(cost),
            "location": (location or self.kitchen).pk, "source": str(uuid.uuid4()), "category": "opening", "reason": "Reviewed opening"})
        ProductionSite.objects.filter(pk=self.site.pk).update(enabled=enabled)
        return result

    def link_master_product(self, item, master_cost=None):
        """Create the catalogue link used by the approved-purchase bridge."""
        key = item.legacy_key or f"test-{uuid.uuid4()}"
        KitchenItem.objects.filter(pk=item.pk).update(legacy_key=key)
        item.refresh_from_db()
        row, _ = SharedAppState.objects.get_or_create(
            state_key=f"vestora-inventory-{self.site.store_id}", defaults={"state_value": []})
        products = list(row.state_value or [])
        previous = next((p for p in products if str(p.get("id")) == key), {})
        product = {**previous, "id": key, "name": item.inventory_item.name,
            "unit": item.inventory_item.unit, "status": "Active", "purchasable": True,
            "productionConsumption": True}
        product.setdefault("stock", 0)
        if master_cost is not None:
            product["cost"] = master_cost
        products = [p for p in products if str(p.get("id")) != key]
        products.append(product)
        row.state_value = products
        row.save(update_fields=["state_value", "updated_at"])
        return key

    def approved_purchase(self, item, base_quantity, value, location=None):
        """Post an approved purchase through the real purchase ledger command."""
        item_key = self.link_master_product(item)
        purchase_ref = f"test-purchase-{uuid.uuid4()}"
        unit = item.inventory_item.unit
        display_factor = quantity(item, 1, unit, False)
        purchase_quantity = D(str(base_quantity)) / display_factor
        line = {"itemId": item_key, "quantity": str(purchase_quantity), "unit": unit}
        entry = {"lines": [line]}
        drafts, _ = SharedAppState.objects.get_or_create(
            state_key=f"vestora-purchase-drafts-{self.site.store_id}", defaults={"state_value": []})
        drafts.state_value = list(drafts.state_value or []) + [
            {"id": purchase_ref, "status": "PendingApproval", "entry": entry}]
        drafts.save(update_fields=["state_value", "updated_at"])
        payload = {"source": purchase_ref, "draft_id": purchase_ref, "entry": entry,
            "location": (location or self.kitchen).pk,
            "receipts": [{**line, "id": purchase_ref, "carryingValue": str(value)}]}
        return self.cmd("purchase", payload, purchase_ref)

    def consume_to_zero(self, item, amount, location=None):
        return self.cmd("usage", {"item": item.pk, "location": (location or self.kitchen).pk,
            "quantity": str(amount), "unit": item.base_unit, "category": "sample",
            "source": str(uuid.uuid4()), "reason": "Consume verified stock for costing test"})

    def serving(self, key, components, expected=0, method="prepared"):
        return self.cmd("recipe", {"key": key, "name": key, "kind": "serving", "expected_version": expected,
            "stock_method": method, "components": [{"item": item.pk, "quantity": str(qty)} for item, qty in components]})

    def recipe(self, inputs, outputs):
        return self.cmd("recipe", {"key": str(uuid.uuid4()), "name": "Recipe", "kind": "production",
            "inputs": [{"item": i.pk, "quantity": str(q)} for i, q in inputs],
            "outputs": [{"item": i.pk, "quantity": str(q), "weight": str(w)} for i, q, w in outputs]})

    def batch(self, recipe, inputs, outputs, **extra):
        draft = self.cmd("draft_batch", {"recipe": recipe["id"], "reference": str(uuid.uuid4()), "scale": "1",
            "source_location": self.kitchen.pk, "destination_location": self.kitchen.pk})
        return self.cmd("post_batch", {"batch": draft["id"], "inputs": [{"item": i.pk, "quantity": str(q)} for i, q in inputs],
            "outputs": [{"item": i.pk, "quantity": str(q)} for i, q in outputs], **extra})

    def confirm(self, reference, entries):
        return self.cmd("confirm", {"reference": reference, "location": self.kitchen.pk,
            "lines": [{"key": key, "menu_key": key, "quantity": str(q)} for key, q in entries]})

    def fulfill(self, reference, **targets):
        return self.cmd("fulfill", {"reference": reference, "targets": {k: str(v) for k, v in targets.items()}})

    def stock(self, item, location=None):
        rows = KitchenBalance.objects.filter(lot__item=item)
        if location:
            rows = rows.filter(location=location)
        return sum((b.quantity for b in rows), D(0)), sum((b.value for b in rows), D(0))


class ProductDeletionTests(KitchenFixture, TestCase):
    def linked_product(self, product_id="unused"):
        SharedAppState.objects.create(state_key="vestora-inventory-A", state_value=[
            {"id": product_id, "name": "Unused ingredient", "unit": "kg", "stock": 0, "cost": 0}])
        result = self.cmd("item", {"name": "Unused ingredient", "legacy_key": product_id,
                                   "kind": "raw", "base_unit": "g"})
        return KitchenItem.objects.get(pk=result["id"])

    def test_unused_linked_product_is_retained_and_must_be_disabled(self):
        item = self.linked_product()
        inventory_id = item.inventory_item_id
        with self.assertRaisesRegex(ValidationError, "Disable or Enable"):
            self.cmd("delete_item", {"item": item.pk})
        self.assertTrue(KitchenItem.objects.filter(pk=item.pk).exists())
        self.assertTrue(InventoryItem.objects.filter(pk=inventory_id).exists())

    def test_product_with_stock_history_cannot_be_deleted(self):
        item = self.linked_product()
        self.opening(item, 100, 10)
        with self.assertRaises(ValidationError):
            self.cmd("delete_item", {"item": item.pk})
        self.assertTrue(KitchenItem.objects.filter(pk=item.pk).exists())

    def test_product_referenced_by_recipe_or_purchase_cannot_be_deleted(self):
        item = self.linked_product()
        self.recipe([(item, 10)], [(self.rice, 20, 1)])
        with self.assertRaises(ValidationError):
            self.cmd("delete_item", {"item": item.pk})
        KitchenRecipe.objects.filter(site=self.site).delete()
        SharedAppState.objects.create(state_key="vestora-purchase-drafts-A", state_value=[
            {"entry": {"lines": [{"itemId": "unused", "quantity": 1}]}}])
        with self.assertRaises(ValidationError):
            self.cmd("delete_item", {"item": item.pk})

    def test_product_with_sales_history_cannot_be_deleted(self):
        item = self.linked_product()
        SharedAppState.objects.create(state_key="vestora-sales-ledger", state_value=[
            {"storeId": "A", "items": [{"id": "unused", "qty": 1}]}])
        with self.assertRaises(ValidationError):
            self.cmd("delete_item", {"item": item.pk})


class ProductionAcceptanceTests(KitchenFixture, TestCase):
    def biriyani(self):
        recipe = self.recipe([(self.raw_rice, 2000)], [(self.rice, 6000, 3), (self.chicken, 20, 2)])
        batch = self.batch(recipe, [(self.raw_rice, 2000)], [(self.rice, 6000), (self.chicken, 20)])
        self.serving("full", [(self.rice, 300), (self.chicken, 1)])
        self.serving("half", [(self.rice, 200), (self.chicken, 1)])
        self.serving("extra", [(self.rice, 150)])
        return batch

    def test_biriyani_independent_portions_and_shared_availability(self):
        batch = self.biriyani()
        self.confirm("lunch", [("full", 10), ("half", 8), ("extra", 4)])
        self.assertEqual(self.stock(self.rice)[0], 6000)  # reservations do not consume
        self.fulfill("lunch", full=10, half=8, extra=4)
        self.assertEqual(self.stock(self.rice)[0], 800)
        self.assertEqual(self.stock(self.chicken)[0], 2)
        self.assertEqual(self.stock(self.raw_rice)[0], 8000)
        self.assertEqual(sum(D(r["cost"]) for r in batch["outputs"]), D(batch["total_cost"]))
        self.assertIn("production_input", {r["category"] for r in trace(self.site, batch["batch"])})
        self.confirm("last-chicken", [("half", 2)])
        self.fulfill("last-chicken", half=2)
        menu = {r["menu_key"]: r for r in availability(self.site, self.kitchen.pk)["servings"]}
        self.assertEqual(menu["full"]["available_servings"], 0)
        self.assertEqual(menu["extra"]["available_servings"], 2)

    def test_finished_weight_does_not_determine_raw_input(self):
        recipe = self.recipe([(self.raw_rice, 2000)], [(self.rice, 6000, 1)])
        self.batch(recipe, [(self.raw_rice, 700)], [(self.rice, 2000)])
        self.assertEqual(self.stock(self.raw_rice)[0], 9300)
        self.assertEqual(self.stock(self.rice)[0], 2000)

    def test_chapathi_variable_yield_cost_and_no_double_flour_deduction(self):
        recipe = self.recipe([(self.flour, 2000)], [(self.chapathi, 40, 1)])
        a = self.batch(recipe, [(self.flour, 2000)], [(self.chapathi, 40)])
        b = self.batch(recipe, [(self.flour, 2000)], [(self.chapathi, 45)])
        self.assertEqual(self.stock(self.flour)[0], 6000)
        self.assertEqual(self.stock(self.chapathi), (D(85), D(400)))
        self.assertEqual(D(a["outputs"][0]["unit_cost"]), 5)
        self.assertEqual(D(b["outputs"][0]["cost"]), 200)
        self.serving("set", [(self.chapathi, 2)])
        self.confirm("free-staff-set", [("set", 1)])
        self.fulfill("free-staff-set", set=1)  # no selling price required for consumption
        self.assertEqual(self.stock(self.chapathi)[0], 83)
        self.assertEqual(self.stock(self.flour)[0], 6000)

    def test_units_and_whole_pieces(self):
        from apps.core.production_domain import quantity
        self.assertEqual(quantity(self.flour, "2", "kg"), 2000)
        with self.assertRaises(ValidationError): quantity(self.flour, "1", "litre")
        with self.assertRaises(ValidationError): quantity(self.chapathi, ".5")
        with self.assertRaises(ValidationError): quantity(self.flour, "1", "bowl")
        self.flour.measures = {"bowl": "125"}
        self.assertEqual(quantity(self.flour, 2, "bowl"), 250)
        for value in ("NaN", "Infinity", "-1", "0.0000001"):
            with self.assertRaises(ValidationError): quantity(self.flour, value)

    def test_drafts_preview_and_post_once(self):
        recipe = self.recipe([(self.flour, 2000)], [(self.chapathi, 40, 1)])
        draft = self.cmd("draft_batch", {"recipe": recipe["id"], "reference": "A", "scale": 1, "source_location": self.kitchen.pk, "destination_location": self.kitchen.pk})
        payload = {"batch": draft["id"], "inputs": [{"item": self.flour.pk, "quantity": 2000}], "outputs": [{"item": self.chapathi.pk, "quantity": 45}]}
        self.cmd("post_batch", payload, "post", preview=True)
        self.assertEqual(self.stock(self.flour)[0], 10000)
        self.assertEqual(self.stock(self.chapathi)[0], 0)
        first = self.cmd("post_batch", payload, "post")
        self.assertEqual(first, self.cmd("post_batch", payload, "post"))
        with self.assertRaises(ValidationError): self.cmd("post_batch", payload, "different-post")
        self.assertEqual(self.stock(self.chapathi)[0], 45)

    def test_production_shortage_previews_and_posts_to_negative_stock(self):
        missing = self.item("No stock spice", "raw", "g")
        self.link_master_product(missing, master_cost=50)
        # A non-purchase receipt, even one with value, does not establish
        # purchase history for shortage costing.
        self.opening(missing, 500, 125)
        self.consume_to_zero(missing, 500)
        InventoryItem.objects.filter(pk=missing.inventory_item_id).update(valuation_rate=D("50"))
        recipe = self.recipe([(missing, 1000)], [(self.rice, 1500, 1)])
        draft = self.cmd("draft_batch", {"recipe": recipe["id"], "reference": "SHORT-001", "scale": 1,
            "source_location": self.kitchen.pk, "destination_location": self.kitchen.pk})
        payload = {"batch": draft["id"], "inputs": [{"item": missing.pk, "quantity": 1000}],
            "outputs": [{"item": self.rice.pk, "quantity": 1600}]}

        preview = self.cmd("post_batch", payload, "short-preview", preview=True)
        self.assertEqual(len(preview["shortages"]), 1)
        self.assertEqual(D(preview["shortages"][0]["quantity"]), D(1000))
        self.assertEqual(self.stock(missing)[0], D(0))  # Preview must roll back the deficit ledger too.

        posted = self.cmd("post_batch", payload, "short-post")
        self.assertEqual(D(posted["shortages"][0]["quantity"]), D(1000))
        self.assertEqual(self.stock(missing)[0], D(-1000))
        self.assertEqual(self.stock(self.rice)[0], D(1600))
        self.assertEqual(D(posted["outputs"][0]["cost"]), D(0))
        self.assertIn("negative_stock_production_input", {row["category"] for row in trace(self.site, posted["batch"])})

        self.opening(missing, 1000, 100)
        self.assertEqual(self.stock(missing)[0], D(0))  # The next receipt settles the recorded shortage.

    def test_production_shortage_uses_last_cost_then_receipt_recalculates_weighted_average(self):
        missing = self.item("Known cost spice", "raw", "g")
        self.approved_purchase(missing, 1000, 50)
        self.consume_to_zero(missing, 1000)
        recipe = self.recipe([(missing, 1000)], [(self.rice, 1000, 1)])
        draft = self.cmd("draft_batch", {"recipe": recipe["id"], "reference": "COST-SHORT-001", "scale": 1,
            "source_location": self.kitchen.pk, "destination_location": self.kitchen.pk})
        payload = {"batch": draft["id"], "inputs": [{"item": missing.pk, "quantity": 1000}],
            "outputs": [{"item": self.rice.pk, "quantity": 1000}]}

        preview = self.cmd("post_batch", payload, "cost-short-preview", preview=True)
        self.assertEqual(D(preview["shortages"][0]["unit_cost"]), D("0.05"))
        self.assertEqual(D(preview["shortages"][0]["estimated_cost"]), D("50"))
        self.assertEqual(D(preview["input_cost"]), D("50"))
        self.assertEqual(self.stock(missing), (D(0), D(0)))

        posted = self.cmd("post_batch", payload, "cost-short-post")
        self.assertEqual(D(posted["input_cost"]), D("50"))
        self.assertEqual(self.stock(missing), (D(-1000), D(-50)))
        debt = KitchenBalance.objects.get(lot__site=self.site, lot__item=missing,
            lot__reference__startswith="__negative_stock__:", location=self.kitchen)
        self.assertEqual(debt.value, D("-50"))

        self.approved_purchase(missing, 2000, 300)
        self.assertEqual(self.stock(missing), (D(1000), D(250)))
        missing.inventory_item.refresh_from_db()
        self.assertEqual(missing.inventory_item.valuation_rate, D("0.25"))

    def test_cheaper_receipt_uses_shortage_carrying_cost_for_weighted_average(self):
        missing = self.item("Low cost spice", "raw", "g")
        self.approved_purchase(missing, 1000, 50)
        self.consume_to_zero(missing, 1000)
        recipe = self.recipe([(missing, 1000)], [(self.rice, 1000, 1)])
        draft = self.cmd("draft_batch", {"recipe": recipe["id"], "reference": "LOW-COST-SHORT-001", "scale": 1,
            "source_location": self.kitchen.pk, "destination_location": self.kitchen.pk})
        self.cmd("post_batch", {"batch": draft["id"], "inputs": [{"item": missing.pk, "quantity": 1000}],
            "outputs": [{"item": self.rice.pk, "quantity": 1000}]}, "low-cost-short-post")

        self.approved_purchase(missing, 2000, 80)

        # Signed moving-average valuation: ₹80 receipt value minus the ₹50
        # carrying value of the earlier shortage leaves ₹30 over 1,000 g.
        self.assertEqual(self.stock(missing), (D(1000), D(30)))
        missing.inventory_item.refresh_from_db()
        self.assertEqual(missing.inventory_item.valuation_rate, D("0.03"))

    def test_partial_fulfillment_and_deduplication(self):
        self.biriyani()
        self.confirm("order", [("full", 3)])
        self.fulfill("order", full=1)
        self.fulfill("order", full=1)
        self.assertEqual(self.stock(self.rice)[0], 5700)
        self.fulfill("order", full=2)
        self.assertEqual(self.stock(self.rice)[0], 5400)
        with self.assertRaises(ValidationError): self.fulfill("order", full=4)
        self.assertEqual(self.stock(self.rice)[0], 5400)

    def test_cancel_releases_and_refund_disposition_does_not_restore_or_rededuct(self):
        self.biriyani()
        self.confirm("order", [("half", 2)])
        result = self.fulfill("order", half=1)
        self.cmd("cancel", {"reference": "order", "reason": "Customer left", "disposition": "no_return"})
        self.assertEqual(KitchenReservation.objects.filter(line__order__reference="order").count(), 0)
        self.cmd("disposition", {"fulfillment": result["fulfillments"][0]["id"], "outcome": "waste", "reason": "Returned unfit"})
        self.assertEqual(self.stock(self.rice)[0], 5800)
        self.assertEqual(self.stock(self.chicken)[0], 19)

    def test_recipe_snapshots_and_amendments(self):
        self.biriyani()
        self.confirm("old", [("half", 2)])
        self.serving("half", [(self.rice, 250), (self.chicken, 1)], expected=1)
        self.confirm("new", [("half", 1)])
        self.fulfill("old", half=1)
        self.fulfill("new", half=1)
        self.assertEqual(self.stock(self.rice)[0], 5550)
        with self.assertRaises(ValidationError):
            self.cmd("confirm", {"reference": "old", "location": self.kitchen.pk, "lines": [{"key": "half", "menu_key": "half", "quantity": 2, "refresh_recipe": True, "expected_revision": 1}]})

    def test_transfer_unused_flour_and_remaining_dough_keep_value(self):
        before = self.stock(self.flour)
        self.cmd("usage", {"category": "transfer", "item": self.flour.pk, "quantity": 3000, "location": self.kitchen.pk, "destination": self.store.pk, "source": "return-unused", "reason": "Unused flour"})
        self.assertEqual(self.stock(self.flour), before)
        self.assertEqual(self.stock(self.flour, self.store), (D(3000), D(300)))
        dough_recipe = self.recipe([(self.flour, 2000)], [(self.dough, 3000, 1)])
        self.batch(dough_recipe, [(self.flour, 2000)], [(self.dough, 3000)])
        bread_recipe = self.recipe([(self.dough, 1500)], [(self.chapathi, 20, 1)])
        self.batch(bread_recipe, [(self.dough, 1500)], [(self.chapathi, 20)])
        self.assertEqual(self.stock(self.dough), (D(1500), D(100)))
        self.assertEqual(self.stock(self.chapathi), (D(20), D(100)))

    def test_count_shortage_once_and_transactions_during_count(self):
        self.opening(self.rice, 800, 80)
        count = self.cmd("start_count", {"location": self.kitchen.pk})
        balance = KitchenBalance.objects.get(lot__item=self.rice)
        entry = self.cmd("record_count", {"count": count["id"], "physical": [{"balance": balance.pk, "quantity": 650}]})
        self.assertEqual(entry["physical"][0]["variance"], "-150.000000")
        self.assertEqual(self.stock(self.rice)[0], 800)
        self.cmd("usage", {"category": "sample", "item": self.rice.pk, "quantity": 100, "location": self.kitchen.pk, "source": "after-count", "reason": "Tasting"})
        self.cmd("adjust_count", {"count": count["id"], "reason": "Unexplained shortage reviewed"}, "count-adjust")
        self.cmd("adjust_count", {"count": count["id"], "reason": "Unexplained shortage reviewed"}, "count-adjust")
        self.assertEqual(self.stock(self.rice)[0], 550)
        rows = report(self.site, timezone.localdate())["closing"]
        row = next(r for r in rows if r["item"] == self.rice.pk)
        self.assertEqual(D(row["opening"]) + D(row["receipts"]) - D(row["issues"]), D(row["closing"]))

    def test_used_batch_cannot_reverse_unused_correction_is_linked(self):
        batch = self.biriyani()
        self.confirm("order", [("full", 1)])
        self.fulfill("order", full=1)
        with self.assertRaises(ValidationError):
            self.cmd("reverse", {"transaction": batch["transaction"], "reason": "Posting error", "no_physical_consumption": True})
        recipe = self.recipe([(self.flour, 2000)], [(self.chapathi, 40, 1)])
        unused = self.batch(recipe, [(self.flour, 2000)], [(self.chapathi, 40)])
        reverse = self.cmd("reverse", {"transaction": unused["transaction"], "reason": "Entered twice, no cooking", "no_physical_consumption": True})
        self.assertEqual(self.stock(self.flour)[0], 10000)
        self.assertEqual(self.stock(self.chapathi)[0], 0)
        self.assertEqual(str(KitchenTransaction.objects.get(pk=reverse["transaction"]).related_id), unused["transaction"])

    def test_failed_rejected_and_lower_yield_batches(self):
        recipe = self.recipe([(self.flour, 2000)], [(self.chapathi, 40, 1)])
        low = self.batch(recipe, [(self.flour, 2000)], [(self.chapathi, 30)], rejects=[{"item": self.chapathi.pk, "quantity": 5}])
        self.assertEqual(D(low["outputs"][0]["cost"]), 200)
        failed = self.batch(recipe, [(self.flour, 2000)], [(self.chapathi, 0)], disposition="Burned, nothing recoverable")
        self.assertEqual(failed["status"], "aborted")
        self.assertEqual(D(failed["loss_cost"]), 200)
        self.assertEqual(self.stock(self.flour)[0], 6000)
        self.assertEqual(self.stock(self.chapathi)[0], 30)

    def test_expiry_quarantine_and_reservations(self):
        self.biriyani()
        self.confirm("order", [("half", 1)])
        lot = KitchenLot.objects.get(item=self.chicken)
        lot.expires_at = timezone.now() - timedelta(seconds=1)
        lot.save()
        with self.assertRaises(ValidationError): self.fulfill("order", half=1)
        self.assertEqual(self.stock(self.rice)[0], 6000)  # rollback all components
        self.assertEqual(next(r for r in availability(self.site, self.kitchen.pk)["servings"] if r["menu_key"] == "half")["available_servings"], 0)
        self.cmd("cancel", {"reference": "order", "reason": "Expired reservation released"})
        self.cmd("usage", {"category": "supplier_return", "item": self.chicken.pk, "quantity": 1,
            "location": self.kitchen.pk, "source": "approved-expired-return", "reason": "Approved return of unusable stock"})
        self.assertEqual(self.stock(self.chicken)[0], 19)

    def test_cycles_and_cross_branch_components_rejected(self):
        self.recipe([(self.flour, 1000)], [(self.dough, 1500, 1)])
        with self.assertRaises(ValidationError): self.recipe([(self.dough, 1000)], [(self.flour, 600, 1)])
        other = ProductionSite.objects.create(store_id="other", branch=Branch.objects.create(restaurant=self.restaurant, code="B"))
        foreign = KitchenItem.objects.create(site=other, inventory_item=InventoryItem.objects.create(restaurant=self.restaurant, name="Foreign"), kind="raw", base_unit="g")
        with self.assertRaises(ValidationError): self.recipe([(foreign, 1)], [(self.dough, 1, 1)])

    def test_closed_period_and_conflicting_operation_key(self):
        self.cmd("location", {"name": "New"}, "same")
        with self.assertRaises(ValidationError): self.cmd("location", {"name": "Other"}, "same")
        self.cmd("close_period", {"reason": "Closing approved"})
        with self.assertRaises(ValidationError): self.cmd("location", {"name": "Late"})

    def test_permissions_and_legacy_cutover_guard(self):
        SharedAppState.objects.create(state_key="vestora-stores", state_value=[{"id": "A", "restaurantId": self.restaurant.pk}])
        client = APIClient()
        cashier = User.objects.create_user(username="cashier", user_type="cashier", restaurant=self.restaurant)
        client.force_authenticate(cashier)
        endpoint = "/api/production/A/command/"
        request = {"command": "item", "key": "x", "data": {"name": "bad", "kind": "raw", "base_unit": "g"}}
        self.assertEqual(client.post(endpoint, request, format="json").status_code, 403)
        cashier.branches.add(self.branch)
        self.assertEqual(client.post(endpoint, request, format="json").status_code, 403)
        foreign = User.objects.create_user(username="foreign", restaurant=Restaurant.objects.create(slug="other", name="Other"), user_type="owner")
        client.force_authenticate(foreign)
        self.assertEqual(client.get("/api/production/A/").status_code, 403)
        client.force_authenticate(self.user)
        response = client.put("/api/cloud/state/", {"key": "vestora-food-stock-A", "value": [{"available": 100}], "expectedUpdatedAt": None, "mutationId": str(uuid.uuid4())}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_nonstock_resale_cook_on_order_and_remakes(self):
        water = self.item("Water bottle", "resale", "piece")
        self.opening(water, 5, 50)
        self.serving("water", [(water, 1)], method="resale")
        self.serving("fresh", [(self.flour, 50)], method="cook_on_order")
        self.serving("service", [], method="non_stock")
        self.confirm("order", [("water", 1), ("fresh", 2), ("service", 1)])
        self.fulfill("order", water=1, fresh=2, service=1)
        self.assertEqual(self.stock(water)[0], 4)
        self.assertEqual(self.stock(self.flour)[0], 9900)
        self.cmd("usage", {"category": "remake", "item": self.flour.pk, "quantity": 50,
            "location": self.kitchen.pk, "source": "order:remake-1", "reason": "Order fresh remake"})
        self.assertEqual(self.stock(self.flour)[0], 9850)

    def test_cloud_sync_marks_retired_snapshots_including_absent_rows_read_only(self):
        from apps.core.production_compat import legacy_read_only_keys
        SharedAppState.objects.create(state_key="vestora-stores", state_value=[{"id": "A", "restaurantId": self.restaurant.pk}])
        old = [{"id": "historic", "available": 12}]
        SharedAppState.objects.create(state_key="vestora-food-stock-A", state_value=old)
        client = APIClient()
        client.force_authenticate(self.user)
        rows = client.get("/api/cloud/state/").data
        retired = {row["state_key"]: row for row in rows if row.get("read_only")}
        self.assertEqual(set(retired), legacy_read_only_keys("A"))
        self.assertEqual(retired["vestora-food-stock-A"]["state_value"], old)
        self.assertEqual(retired["vestora-recipes-A"]["state_value"], [])
        self.assertIsNone(retired["vestora-recipes-A"]["updated_at"])
        for key in legacy_read_only_keys("A"):
            row = client.get("/api/cloud/state/", {"key": key}).data[0]
            self.assertTrue(row["read_only"])
            self.assertEqual(row["read_only_reason"], "production_ledger")
            rejected = client.put("/api/cloud/state/", {"key": key, "value": [{"id": "stale"}],
                "expectedUpdatedAt": row["updated_at"], "mutationId": str(uuid.uuid4())}, format="json")
            self.assertEqual(rejected.status_code, 409)
        # Synthetic rows are only a sync instruction, never new business data.
        self.assertFalse(SharedAppState.objects.filter(state_key="vestora-recipes-A").exists())
        self.assertFalse(next(row for row in rows if row["state_key"] == "vestora-stores").get("read_only"))
        self.assertEqual(self.stock(self.flour)[0], 10000)
        self.site.enabled = False
        self.site.save()
        rows = client.get("/api/cloud/state/").data
        self.assertFalse(any(row.get("read_only") for row in rows))
        self.assertEqual(client.get("/api/cloud/state/", {"key": "vestora-recipes-A"}).data, [])

    def test_retired_snapshot_metadata_respects_store_access_and_filters(self):
        foreign = User.objects.create_user(username="outside", user_type="owner",
            restaurant=Restaurant.objects.create(name="Outside", slug="outside"))
        SharedAppState.objects.create(state_key="vestora-stores", state_value=[{"id": "A", "restaurantId": self.restaurant.pk}])
        client = APIClient()
        client.force_authenticate(foreign)
        self.assertFalse(any(row.get("read_only") for row in client.get("/api/cloud/state/").data))
        self.assertEqual(client.get("/api/cloud/state/", {"key": "vestora-recipes-A"}).status_code, 403)
        client.force_authenticate(self.user)
        self.assertTrue(all(row["state_key"].endswith("-A") for row in
            client.get("/api/cloud/state/", {"storeId": "A"}).data if row.get("read_only")))


class ProductionIntegrationTests(KitchenFixture, TestCase):
    def test_new_recipe_api_saves_reopens_and_retries_without_changing_stock(self):
        SharedAppState.objects.create(state_key="vestora-stores", state_value=[{"id": "A", "restaurantId": self.restaurant.pk}])
        client = APIClient()
        client.force_authenticate(self.user)
        endpoint = "/api/production/A/command/"
        data = {"key": "new-chapathi", "name": "New chapathi", "kind": "production", "expected_version": 0,
            "inputs": [{"item": self.flour.pk, "quantity": "0.25", "unit": "kg"}],
            "outputs": [{"item": self.chapathi.pk, "quantity": "5", "unit": "piece", "weight": "1"}]}
        envelope = {"command": "recipe", "key": str(uuid.uuid4()), "data": data}
        saved = client.post(endpoint, envelope, format="json")
        self.assertEqual(saved.status_code, 200, saved.data)
        replay = client.post(endpoint, envelope, format="json")
        self.assertEqual(replay.data, saved.data)
        recipes = client.get("/api/production/A/").data["recipes"]
        self.assertEqual(len(recipes), 1)
        self.assertEqual(recipes[0]["key"], "new-chapathi")
        self.assertEqual(D(recipes[0]["inputs"][0]["quantity"]), 250)
        self.assertEqual(recipes[0]["inputs"][0]["unit"], "g")
        self.assertEqual(self.stock(self.flour)[0], 10000)
        self.assertEqual(self.stock(self.chapathi)[0], 0)
        updated = client.post(endpoint, {"command": "recipe", "key": str(uuid.uuid4()),
            "data": {**data, "expected_version": 1, "instructions": "Updated preparation"}}, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data["version"], 2)
        self.assertEqual(len(client.get("/api/production/A/").data["recipes"]), 1)

    def test_cutover_keeps_legacy_prices_recipes_and_history_without_replay(self):
        from apps.core.production_compat import legacy_write_issue
        self.site.enabled = False
        self.site.cutover_at = None
        self.site.save()
        inventory = [{"id": "flour", "name": "Legacy flour", "unit": "kg", "stock": 2, "cost": 100, "sellingPrice": 175, "margin": 42}]
        menu = [{"id": "half", "name": "Half", "price": 143, "margin": 51, "tax": 5}]
        recipes = [{"id": "manual", "portion": "half", "outputQty": 17}]
        for prefix, rows in (("inventory", inventory), ("menu-items", menu), ("recipes", recipes)):
            SharedAppState.objects.create(state_key=f"vestora-{prefix}-A", state_value=rows)
        SharedAppState.objects.create(state_key="vestora-sales-ledger", state_value=[{"id": "old-bill", "storeId": "A", "total": 143}])
        self.assertTrue(review(self.site)["issues"])
        imported = self.cmd("import_legacy", {"location": self.store.pk, "mappings": [{"legacy_key": "flour", "kind": "raw"}]})
        mapped = KitchenItem.objects.get(pk=imported["imported"][0]["item"])
        self.assertEqual(self.stock(mapped), (D(2000), D(200)))
        self.assertEqual(review(self.site)["reconciliation"][0]["value_difference"], "0E-8")
        self.serving("half", [(self.rice, 200)])
        before = KitchenMovement.objects.count()
        payload = {"openings_reviewed": True, "legacy_wip_reconciled": True, "reason": "Count sheets reviewed; no open WIP"}
        activated = self.cmd("activate", payload, "cutover")
        self.assertEqual(self.cmd("activate", payload, "cutover"), activated)
        self.assertEqual(KitchenMovement.objects.count(), before)
        self.assertEqual(activated["historic_sales_replayed"], 0)
        self.assertEqual(SharedAppState.objects.get(state_key="vestora-menu-items-A").state_value, menu)
        self.assertEqual(SharedAppState.objects.get(state_key="vestora-recipes-A").state_value, recipes)
        projected = SharedAppState.objects.get(state_key="vestora-inventory-A").state_value[0]
        self.assertEqual(projected["stock"], 2)
        self.assertEqual(projected["sellingPrice"], 175)
        self.assertEqual(projected["margin"], 42)
        with self.assertRaises(ValidationError): self.confirm("old-bill", [("half", 1)])
        self.assertIsNotNone(legacy_write_issue("vestora-inventory-A", [projected], [{**projected, "stock": 3}]))

    def purchase_fixture(self):
        SharedAppState.objects.create(state_key="vestora-inventory-A", state_value=[{"id": "new", "name": "Mapped flour", "unit": "kg", "stock": 0, "cost": 100, "sellingPrice": 150}])
        mapped = self.cmd("item", {"name": "Mapped flour", "legacy_key": "new", "kind": "raw", "base_unit": "g"})
        entry = {"lines": [{"itemId": "new", "quantity": "2"}]}
        SharedAppState.objects.create(state_key="vestora-purchase-drafts-A", state_value=[{"id": "draft", "status": "PendingApproval", "entry": entry}])
        return KitchenItem.objects.get(pk=mapped["id"]), {"source": "PUR-1", "draft_id": "draft", "entry": entry, "location": self.store.pk,
            "receipts": [{"id": "receipt1", "type": "Purchase", "purchaseId": "PUR-1", "supplier": "Vendor", "invoice": "INV1", "itemId": "new", "quantity": "2", "unit": "kg", "carryingValue": "240", "total": 240}], "reason": "Approved invoice including allocated freight"}

    def test_purchase_projection_atomic_dedup_and_linked_credit(self):
        item, payload = self.purchase_fixture()
        result = self.cmd("purchase", payload, "purchase-key")
        self.assertEqual(self.cmd("purchase", payload, "purchase-key"), result)
        self.assertEqual(self.stock(item), (D(2000), D(240)))
        projected = SharedAppState.objects.get(state_key="vestora-inventory-A").state_value[0]
        self.assertEqual(projected["unit"], "kg")
        self.assertEqual(projected["stock"], 2)
        self.assertEqual(projected["cost"], 120)
        self.assertEqual(projected["sellingPrice"], 150)
        with self.assertRaises(ValidationError): self.cmd("purchase", payload)
        reversed_tx = self.cmd("reverse", {"transaction": result["transaction"], "reason": "Duplicate physical delivery entered by mistake", "no_physical_consumption": True})
        self.assertEqual(self.stock(item), (D(0), D(0)))
        rows = SharedAppState.objects.get(state_key="vestora-inventory-transactions-A").state_value
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["correctsTransaction"], result["transaction"])
        self.assertEqual(rows[0]["productionTransaction"], reversed_tx["transaction"])
        self.assertEqual(rows[1]["type"], "Purchase")

    def test_stale_or_invalid_purchase_rolls_back_every_line(self):
        item, payload = self.purchase_fixture()
        with self.assertRaises(ValidationError): self.cmd("purchase", {**payload, "entry": {"lines": []}})
        with self.assertRaises(ValidationError): self.cmd("purchase", {**payload, "receipts": [{**payload["receipts"][0], "unit": "litre"}]})
        self.assertEqual(self.stock(item), (D(0), D(0)))
        self.assertFalse(KitchenTransaction.objects.filter(site=self.site, kind="purchase").exists())
        self.assertEqual(SharedAppState.objects.get(state_key="vestora-purchase-drafts-A").state_value[0]["status"], "PendingApproval")

    def test_staged_production_packing_and_partial_service(self):
        recipe = self.recipe([(self.flour, 2000)], [(self.dough, 2500, 1)])
        self.batch(recipe, [(self.flour, 2000)], [(self.dough, 2500)])
        finish = self.recipe([(self.dough, 1000)], [(self.chapathi, 20, 1)])
        for n in range(2):
            draft = self.cmd("draft_batch", {"recipe": finish["id"], "reference": f"release-{n}", "parent_reference": "morning", "source_location": self.kitchen.pk, "destination_location": self.kitchen.pk})
            actual = {"batch": draft["id"], "inputs": [{"item": self.dough.pk, "quantity": 1000}], "outputs": [{"item": self.chapathi.pk, "quantity": 20}]}
            self.cmd("post_batch", actual)
            with self.assertRaises(ValidationError): self.cmd("post_batch", actual)
        self.assertEqual(self.stock(self.flour)[0], 8000)
        self.assertEqual(self.stock(self.dough), (D(500), D(40)))
        pack = self.item("Packed two chapathis", "prepared", "piece")
        packing = self.recipe([(self.chapathi, 10)], [(pack, 5, 1)])
        self.batch(packing, [(self.chapathi, 10)], [(pack, 5)])
        self.serving("pack", [(pack, 1)])
        self.confirm("packs", [("pack", 5)])
        self.fulfill("packs", pack=2)
        self.fulfill("packs", pack=5)
        with self.assertRaises(ValidationError): self.fulfill("packs", pack=6)
        self.assertEqual(self.stock(pack)[0], 0)
        self.assertEqual(self.stock(self.chapathi)[0], 30)

    def test_physically_used_before_cancel_consumes_and_disposes_once(self):
        self.opening(self.chicken, 3, 30)
        self.serving("chicken", [(self.chicken, 1)])
        self.confirm("used", [("chicken", 2)])
        payload = {"reference": "used", "reason": "Prepared food cancelled", "disposition": "waste", "used_targets": {"chicken": "2"}}
        self.cmd("cancel", payload, "cancel-key")
        self.cmd("cancel", payload, "cancel-key")
        self.assertEqual(self.stock(self.chicken)[0], 1)
        self.assertEqual(KitchenFulfillment.objects.count(), 1)
        self.assertEqual(KitchenReservation.objects.count(), 0)

    def test_controlled_return_reuses_original_lot_without_full_refund_restore(self):
        self.opening(self.chicken, 3, 30)
        self.serving("chicken", [(self.chicken, 1)])
        self.confirm("used", [("chicken", 2)])
        self.fulfill("used", chicken=2)
        f = KitchenFulfillment.objects.get()
        payload = {"fulfillment": f.pk, "outcome": "usable_return", "location": self.kitchen.pk, "reason": "Unserved controlled recovery", "returns": [{"movement": f.allocations[0]["movement"], "quantity": 1}]}
        self.cmd("disposition", payload)
        self.assertEqual(self.stock(self.chicken), (D(2), D(20)))
        with self.assertRaises(ValidationError): self.cmd("disposition", payload)
        self.assertEqual(KitchenLot.objects.filter(item=self.chicken).count(), 1)

    def test_direct_shared_overhead_and_loss_reconcile_without_double_cost(self):
        self.cmd("policy", {"overhead_allowed": True, "reason": "Approved overhead policy"})
        recipe = self.recipe([(self.raw_rice, 2000)], [(self.rice, 6000, 3), (self.chicken, 20, 2)])
        result = self.batch(recipe, [(self.raw_rice, 2000)], [(self.rice, 6000), (self.chicken, 20)], overhead="20", abnormal_loss_cost="10", disposition="Separately recognized failed trial", direct_costs={str(self.chicken.pk): "30"})
        self.assertEqual(D(result["total_cost"]), 120)
        self.assertEqual(sum(D(r["cost"]) for r in result["outputs"]) + D(result["loss_cost"]), 120)
        self.assertEqual([D(r["cost"]) for r in result["outputs"]], [48, 62])

    def test_seed_refuses_existing_business_database(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError): call_command("seed_production_demo", confirm_empty_database=True)
        self.assertEqual(self.stock(self.flour)[0], 10000)

    def test_average_cost_dependencies_prevent_silent_historic_recost(self):
        receipt = self.cmd("receipt", {"item": self.flour.pk, "quantity": 1000, "total_cost": 200,
            "location": self.kitchen.pk, "source": "higher-rate", "reason": "Purchased flour"})
        self.cmd("usage", {"item": self.flour.pk, "quantity": 100, "location": self.kitchen.pk,
            "category": "sample", "source": "quality-check", "reason": "Quality sample"})
        with self.assertRaises(ValidationError):
            self.cmd("reverse", {"transaction": receipt["transaction"], "reason": "Would change an issued cost pool", "no_physical_consumption": True})
        self.assertEqual(sum(KitchenMovement.objects.filter(balance__lot__item=self.flour).values_list("value", flat=True)), self.stock(self.flour)[1])

    def test_relational_checkout_kds_and_refund_share_one_stock_path(self):
        from apps.core.models import MenuItem, MenuCategory
        SharedAppState.objects.create(state_key="vestora-stores", state_value=[{"id": "A", "restaurantId": self.restaurant.pk}])
        category = MenuCategory.objects.create(restaurant=self.restaurant, branch=self.branch, name="Food")
        menu = MenuItem.objects.create(restaurant=self.restaurant, branch=self.branch, category=category, name="Chapathi", base_price=15)
        self.opening(self.chapathi, 10, 50)
        self.serving(str(menu.pk), [(self.chapathi, 1)])
        client = APIClient(); client.force_authenticate(self.user)
        response = client.post("/api/orders/checkout/", {"bill_number": "REST-1", "branch": self.branch.pk, "order_type": "takeaway", "items": [{"menu_item": menu.pk, "name": "Chapathi", "quantity": "2", "rate": "15", "tax_rate": "5"}]}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        order_id = response.data["id"]
        self.assertEqual(self.stock(self.chapathi)[0], 10)
        self.assertEqual(KitchenReservation.objects.get(line__order__legacy_order_id=order_id).quantity, 2)
        for status in ("ready", "completed", "completed", "refunded"):
            response = client.post(f"/api/orders/{order_id}/kds-status/", {"status": status}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.stock(self.chapathi)[0], 8)
        self.assertEqual(KitchenFulfillment.objects.count(), 1)
        sales = report(self.site, timezone.localdate())["sales"]
        self.assertEqual(D(sales[0]["net_menu_value"]), 30)
        self.assertEqual(D(sales[0]["food_margin_before_discount"]), 20)
        self.assertEqual(client.delete(f"/api/orders/{order_id}/").status_code, 400)
        self.assertEqual(client.get("/api/production/A/reports/?export=csv").status_code, 200)
        held = client.post("/api/orders/checkout/", {"bill_number": "REST-HELD", "branch": self.branch.pk, "order_type": "takeaway", "status": "hold", "items": [{"menu_item": menu.pk, "name": "Chapathi", "quantity": "1", "rate": "15"}]}, format="json")
        self.assertEqual(held.status_code, 201, held.data)
        self.assertFalse(KitchenOrder.objects.filter(legacy_order_id=held.data["id"]).exists())
        served = client.post(f"/api/orders/{held.data['id']}/kds-status/", {"status": "completed"}, format="json")
        self.assertEqual(served.status_code, 200, served.data)
        self.assertEqual(self.stock(self.chapathi)[0], 7)


class ProductionConcurrencyTests(KitchenFixture, TransactionTestCase):
    def test_two_orders_cannot_reserve_last_piece(self):
        self.opening(self.chicken, 1, 25)
        self.serving("chicken", [(self.chicken, 1)])
        def order(reference):
            close_old_connections()
            try:
                self.confirm(reference, [("chicken", 1)])
                return "reserved"
            except (ValidationError, OperationalError):
                return "conflict"
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(order, ["one", "two"]))
        self.assertEqual(outcomes.count("reserved"), 1)
        self.assertEqual(sum((r.quantity for r in KitchenReservation.objects.all()), D(0)), 1)
