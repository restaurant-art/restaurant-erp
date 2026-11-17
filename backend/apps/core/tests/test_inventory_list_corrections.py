from decimal import Decimal as D

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from apps.core.models import SharedAppState
from apps.core.production_models import KitchenCount, KitchenItem, KitchenBalance
from apps.core.production_views import inventory_unit_factor
from .test_pack_stock import PackFixture


class InventoryListCorrectionTests(PackFixture, TestCase):
    def test_list_includes_consumption_enabled_product_master_items_but_not_recipe_outputs(self):
        rice = self.product("Basmati rice", enabled=True, unit="kg")
        chicken = self.product("Chicken", enabled=True, unit="kg")
        masala = self.product("Masala 250g", enabled=True, size=250)
        count = self.start_list()
        self.assertEqual({row["item"] for row in count["expected"]}, {rice.pk, chicken.pk, masala.pk})
        self.assertNotIn(self.rice.pk, {row["item"] for row in count["expected"]})

    def test_inventory_pack_edit_changes_unopened_packs_and_preserves_loose_contents(self):
        item = self.product("Masala 250g", size=250)
        self.purchase_packs(item, 7)
        self.consume(item, 200)
        self.balance(item, 6, 50, 1550)
        count = self.start_list()
        row = next(row for row in count["expected"] if row["item"] == item.pk)
        self.assertEqual(row["count_basis"], "sealed")
        self.assertEqual(D(row["count_factor"]), D(250))
        recorded = self.cmd("inventory_record_count", {"count": count["id"], "physical": [self.entry(count, item, 5)]})
        self.assertEqual(D(recorded["physical"][0]["open_variance"]), 0)
        self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "Five unopened packets physically checked"})
        self.balance(item, 5, 50, 1300)
        self.sale(item, 5)
        self.balance(item, 0, 50, 50)
        self.sale(item, 1, "negative-sale")
        # A shortage is recorded separately; the remaining loose contents are
        # never converted into or sold as another unopened packet.
        self.balance(item, 0, 50, -200)

    def test_loose_consumption_before_observation_is_preserved(self):
        item = self.product("Masala 250g", size=250)
        self.purchase_packs(item, 7)
        self.consume(item, 200)
        count = self.start_list()
        self.consume(item, 30)
        recorded = self.cmd("inventory_record_count", {"count": count["id"], "physical": [self.entry(count, item, 5)]})
        row = recorded["physical"][0]
        self.assertEqual(D(row["quantity"]), D(1270))
        self.assertEqual(D(row["open_quantity"]), D(20))
        self.assertEqual(D(row["open_variance"]), D(0))
        self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "Five packs checked after cooking"})
        self.balance(item, 5, 20, 1270)

    def test_unverified_historical_pack_stock_requires_production_classification(self):
        item = self.product("Legacy masala", size=250)
        self.cmd("receipt", {"item": item.pk, "location": self.store.pk, "quantity": "1000", "unit": "g",
            "total_cost": "100", "source": "historical-loose", "reason": "Historical receipt"})
        balance = KitchenBalance.objects.get(lot__item=item)
        balance.lot.pack_size = None
        balance.lot.save(update_fields=["pack_size"])
        count = self.start_list()
        row = next(row for row in count["expected"] if row["item"] == item.pk)
        self.assertIn("Production", row["read_only_reason"])
        self.assertEqual(row["count_basis"], "unverified")
        self.assertEqual(row["count_unit"], "g")
        self.assertEqual(D(row["count_factor"]), D(1))
        with self.assertRaisesRegex(ValidationError, "historical pack stock"):
            self.start_list("full")
        with self.assertRaisesRegex(ValidationError, "historical pack stock"):
            self.cmd("inventory_record_count", {"count": count["id"], "physical": [self.entry(count, item, 4)]})
        self.balance(item, 0, 1000, 1000)

    def test_full_count_requires_all_product_master_items_to_be_linked(self):
        self.product("linked", enabled=False)
        master = SharedAppState.objects.get(state_key="vestora-inventory-A")
        master.state_value.append({"id": "old-unlinked", "name": "Old unlinked product", "unit": "piece", "stock": 0})
        master.save()
        self.assertEqual(len(self.start_list()["expected"]), 1)
        with self.assertRaisesRegex(ValidationError, "Save or link every inventory product"):
            self.start_list("full")

    def test_custom_unit_historical_stock_without_pack_snapshot_stays_readonly(self):
        item = self.product("Historical packet", enabled=False)
        KitchenItem.objects.filter(pk=item.pk).update(pack_size=None, base_unit="g", measures={"packet": "100"})
        self.cmd("receipt", {"item": item.pk, "location": self.store.pk, "quantity": "1000", "unit": "g",
            "total_cost": "100", "source": "old-custom-unit", "reason": "Historical unclassified contents"})
        count = self.start_list()
        row = next(row for row in count["expected"] if row["item"] == item.pk)
        self.assertEqual(row["count_basis"], "unverified")
        self.assertEqual(row["count_unit"], "g")
        self.assertEqual(D(row["count_factor"]), D(1))
        self.assertIn("Production", row["read_only_reason"])
        with self.assertRaisesRegex(ValidationError, "historical pack stock"):
            self.start_list("full")
        with self.assertRaisesRegex(ValidationError, "historical pack stock"):
            self.cmd("inventory_record_count", {"count": count["id"], "physical": [self.entry(count, item, 10)]})
        self.balance(item, 0, 1000, 1000)

    def test_missing_legacy_conversion_is_exposed_without_an_invented_factor(self):
        item = self.product("legacy", enabled=False)
        KitchenItem.objects.filter(pk=item.pk).update(pack_size=None, measures={})
        item.refresh_from_db()
        self.assertIsNone(inventory_unit_factor(item))

    def test_unconfigured_unselected_product_does_not_block_configured_corrections(self):
        configured = self.product("configured", enabled=False)
        invalid = self.product("legacy", enabled=False)
        self.purchase_packs(configured, 10)
        KitchenItem.objects.filter(pk=invalid.pk).update(pack_size=None, measures={})
        count = self.start_list()
        invalid_row = next(row for row in count["expected"] if row["item"] == invalid.pk)
        self.assertIsNone(invalid_row["count_factor"])
        self.assertIn("stock unit conversion", invalid_row["configuration_error"])
        with self.assertRaisesRegex(ValidationError, "stock unit conversion"):
            self.cmd("inventory_record_count", {"count": count["id"], "physical": [
                {"balance": invalid_row["balance"], "quantity": "2"}]})
        self.cmd("inventory_record_count", {"count": count["id"], "physical": [self.entry(count, configured, 8)]})
        self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "Valid product counted"})
        self.balance(configured, 8, 0, 8)
        self.balance(invalid, 0, 0, 0)

    def start_list(self, mode="items"):
        return self.cmd("inventory_start_count", {"location": self.store.pk, "mode": mode})

    def entry(self, count, item, value):
        row = next(row for row in count["expected"] if row["item"] == item.pk)
        return {"balance": row["balance"], "quantity": str(value)}

    def test_multiple_entered_rows_post_together_and_omitted_stock_stays_unchanged(self):
        first = self.product("first", enabled=False)
        second = self.product("second", enabled=False)
        omitted = self.product("omitted", enabled=False)
        for item, amount in ((first, 10), (second, 5), (omitted, 3)):
            self.purchase_packs(item, amount)
        count = self.start_list()
        self.assertEqual(count["mode"], "items")
        self.cmd("inventory_record_count", {"count": count["id"], "physical": [
            self.entry(count, first, 8), self.entry(count, second, 0),
        ]})
        self.assertEqual(len(KitchenCount.objects.get(pk=count["id"]).physical), 2)
        result = self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "Shelf quantities verified"}, "list-post")
        self.assertEqual(self.cmd("inventory_adjust_count", {
            "count": count["id"], "reason": "Shelf quantities verified"}, "list-post"), result)
        self.balance(first, 8, 0, 8)
        self.balance(second, 0, 0, 0)
        self.balance(omitted, 3, 0, 3)

    def test_incomplete_gain_valuation_rolls_back_every_selected_correction(self):
        stocked = self.product("stocked", enabled=False)
        empty = self.product("empty", enabled=False)
        self.purchase_packs(stocked, 10)
        count = self.start_list()
        gain = self.entry(count, empty, 2)
        self.cmd("inventory_record_count", {"count": count["id"], "physical": [
            self.entry(count, stocked, 8), gain,
        ]})
        with self.assertRaisesRegex(ValidationError, "Count gain unit cost"):
            self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "Review missing cost"})
        self.balance(stocked, 10, 0, 10)
        self.balance(empty, 0, 0, 0)
        self.assertIsNone(KitchenCount.objects.get(pk=count["id"]).adjustment_id)
        self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "Reviewed found stock",
            "unit_costs": {str(gain["balance"]): "20"}})
        self.balance(stocked, 8, 0, 8)
        self.balance(empty, 2, 0, 2)

    def test_full_stock_take_still_requires_every_row(self):
        first = self.product("first", enabled=False)
        self.product("second", enabled=False)
        count = self.start_list("full")
        with self.assertRaisesRegex(ValidationError, "every listed batch"):
            self.cmd("inventory_record_count", {"count": count["id"], "physical": [self.entry(count, first, 0)]})

    def test_items_mode_is_not_available_through_production_start(self):
        self.product("normal", enabled=False)
        with self.assertRaisesRegex(ValidationError, "Inventory items list"):
            self.cmd("start_count", {"location": self.store.pk, "scope": "inventory", "mode": "items"})
        with self.assertRaisesRegex(ValidationError, "Inventory items list"):
            self.cmd("start_count", {"location": self.store.pk, "scope": "production", "mode": "items"})

    def test_selected_item_new_lot_is_not_silently_omitted(self):
        item = self.product("normal", enabled=False)
        count = self.start_list()
        self.purchase_packs(item, 2)
        with self.assertRaisesRegex(ValidationError, "new stock lot"):
            self.cmd("inventory_record_count", {"count": count["id"], "physical": [self.entry(count, item, 0)]})

    def test_selected_item_movement_after_observation_blocks_posting(self):
        first = self.product("first", enabled=False)
        second = self.product("second", enabled=False)
        self.purchase_packs(first, 10)
        self.purchase_packs(second, 10)
        count = self.start_list()
        self.cmd("inventory_record_count", {"count": count["id"], "physical": [
            self.entry(count, first, 8), self.entry(count, second, 9),
        ]})
        self.sale(second, 1)
        with self.assertRaisesRegex(ValidationError, "Stock moved after"):
            self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "Stale shelf count"})
        self.balance(first, 10, 0, 10)
        self.balance(second, 9, 0, 9)

    def test_unrelated_new_items_and_movements_do_not_block_selected_correction(self):
        selected = self.product("selected", enabled=False)
        unrelated = self.product("unrelated", enabled=False)
        self.purchase_packs(selected, 10)
        count = self.start_list()
        self.purchase_packs(unrelated, 3)
        self.product("new-unrelated", enabled=False)
        self.cmd("inventory_record_count", {"count": count["id"], "physical": [self.entry(count, selected, 8)]})
        self.sale(unrelated, 1)
        self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "Only selected shelf counted"})
        self.balance(selected, 8, 0, 8)
        self.balance(unrelated, 2, 0, 2)

    def test_invalid_or_duplicate_rows_cannot_replace_selected_stock(self):
        item = self.product("normal", enabled=False)
        count = self.start_list()
        entry = self.entry(count, item, 0)
        for physical in ([], [entry, entry], [{"balance": "new:999999", "quantity": "2"}]):
            with self.assertRaises(ValidationError):
                self.cmd("inventory_record_count", {"count": count["id"], "physical": physical})
        self.assertFalse(KitchenCount.objects.get(pk=count["id"]).physical)
