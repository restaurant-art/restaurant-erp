from decimal import Decimal as D
import uuid

from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.core.models import SharedAppState, User
from apps.core.production_models import KitchenBalance, KitchenCount
from .test_pack_stock import PackFixture


class StockCountScopeTests(PackFixture, TestCase):
    def inventory_count(self, item=None, mode="single"):
        return self.cmd("inventory_start_count", {
            "location": self.store.pk, "mode": mode,
            **({"item": item.pk} if item else {}),
        })

    def change_normal_product_unit(self, item, unit):
        products = SharedAppState.objects.get(state_key="vestora-inventory-A").state_value
        saved = next(product for product in products if str(product["id"]) == item.legacy_key)
        self.cmd("product", {
            "product": {**saved, "unit": unit},
            "expected_updated_at": saved["updatedAt"],
        })

    def test_inventory_count_rejects_changed_measurement_before_recording(self):
        item = self.product("retail-rice", enabled=False, unit="kg")
        count = self.inventory_count(item)
        row = count["expected"][0]
        self.assertEqual(row["base_unit"], "g")
        self.change_normal_product_unit(item, "litre")
        with self.assertRaises(ValidationError) as rejected:
            self.cmd("inventory_record_count", {"count": count["id"], "physical": [
                {"balance": row["balance"], "quantity": "2.5"},
            ]})
        self.assertRegex(str(rejected.exception), "(?i)measurement|fresh count")
        self.assertFalse(KitchenBalance.objects.filter(lot__item=item).exists())

    def test_inventory_count_rejects_changed_measurement_before_posting(self):
        item = self.product("retail-rice", enabled=False, unit="kg")
        count = self.inventory_count(item)
        row = count["expected"][0]
        self.cmd("inventory_record_count", {"count": count["id"], "physical": [
            {"balance": row["balance"], "quantity": "2.5"},
        ]})
        self.change_normal_product_unit(item, "litre")
        with self.assertRaises(ValidationError) as rejected:
            self.cmd("inventory_adjust_count", {
                "count": count["id"], "reason": "Stale kg count must not become millilitres",
                "unit_costs": {str(row["balance"]): "80"},
            })
        self.assertRegex(str(rejected.exception), "(?i)measurement|fresh count")
        self.assertFalse(KitchenBalance.objects.filter(lot__item=item).exists())
        self.assertIsNone(KitchenCount.objects.get(pk=count["id"]).adjustment_id)

    def test_inventory_counts_kg_in_saved_product_unit_and_values_gains_per_kg(self):
        item = self.product("retail-rice", enabled=False, unit="kg")
        count = self.inventory_count(item)
        self.assertEqual(count["scope"], "inventory")
        row = count["expected"][0]
        self.assertEqual(row["count_unit"], "kg")
        self.assertEqual(D(row["count_factor"]), D(1000))
        recorded = self.cmd("inventory_record_count", {"count": count["id"], "physical": [
            {"balance": row["balance"], "quantity": "2.5"},
        ]})
        physical = recorded["physical"][0]
        self.assertEqual(D(physical["quantity"]), D(2500))
        self.assertEqual(D(physical["counted_quantity"]), D("2.5"))
        self.cmd("inventory_adjust_count", {
            "count": count["id"], "reason": "Reviewed 2.5kg physical stock",
            "unit_costs": {str(row["balance"]): "80"},
        })
        balance = KitchenBalance.objects.get(lot__item=item, location=self.store)
        self.assertEqual(balance.quantity, D(2500))
        self.assertEqual(balance.value, D(200))
        self.assertFalse(KitchenBalance.objects.filter(lot__item=item, location=self.kitchen).exists())
        item.inventory_item.refresh_from_db()
        self.assertEqual(item.inventory_item.current_stock, D("2.5"))
        self.assertEqual(item.inventory_item.valuation_rate, D(80))

    def test_inventory_packet_count_infers_unopened_packs_without_loose_controls(self):
        item = self.product("retail-packet", enabled=False)
        self.purchase_packs(item, 10)
        count = self.inventory_count(item)
        row = count["expected"][0]
        self.assertEqual(row["count_unit"], "packet")
        self.cmd("inventory_record_count", {"count": count["id"], "physical": [
            {"balance": row["balance"], "quantity": "8"},
        ]})
        self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "Two damaged packets counted"})
        self.balance(item, 8, 0, 8)

    def test_inventory_counts_product_master_items_and_production_counts_consumption_items(self):
        normal = self.product("retail", enabled=False)
        production = self.product("ingredient")
        inventory_count = self.inventory_count(mode="full")
        self.assertEqual({r["item"] for r in inventory_count["expected"]}, {normal.pk, production.pk})
        self.assertNotIn(self.rice.pk, {r["item"] for r in inventory_count["expected"]})
        production_count = self.cmd("start_count", {
            "location": self.store.pk, "mode": "full", "scope": "production",
        })
        self.assertIn(production.pk, {r["item"] for r in production_count["expected"]})
        self.assertNotIn(normal.pk, {r["item"] for r in production_count["expected"]})
        self.assertEqual(self.inventory_count(production)["expected"][0]["item"], production.pk)
        with self.assertRaises(ValidationError):
            self.cmd("start_count", {
                "location": self.store.pk, "mode": "single", "scope": "production", "item": normal.pk,
            })

    def test_inventory_aliases_cannot_record_or_adjust_a_production_count(self):
        item = self.product()
        count = self.cmd("start_count", {
            "location": self.store.pk, "mode": "single", "scope": "production", "item": item.pk,
        })
        physical = [{"balance": count["expected"][0]["balance"], "quantity": "0", "sealed_packages": 0}]
        with self.assertRaises(ValidationError):
            self.cmd("inventory_record_count", {"count": count["id"], "physical": physical})
        self.cmd("record_count", {"count": count["id"], "physical": physical})
        with self.assertRaises(ValidationError):
            self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "Wrong workspace"})
        self.assertIsNone(KitchenCount.objects.get(pk=count["id"]).adjustment_id)

    def test_inventory_aliases_cannot_take_over_an_older_all_products_count(self):
        item = self.product("normal", enabled=False)
        count = self.cmd("start_count", {"location": self.store.pk, "mode": "single", "item": item.pk})
        with self.assertRaises(ValidationError):
            self.cmd("inventory_record_count", {"count": count["id"], "physical": [
                {"balance": count["expected"][0]["balance"], "quantity": "0", "sealed_packages": 0},
            ]})

    def test_standalone_production_output_does_not_invalidate_full_inventory_count(self):
        normal = self.product("retail", enabled=False)
        count = self.inventory_count(mode="full")
        self.item("New cooked output", "prepared", "g")
        self.cmd("inventory_record_count", {"count": count["id"], "physical": [
            {"balance": row["balance"], "quantity": "0"} for row in count["expected"]
        ]})
        self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "All retail products counted"})
        self.balance(normal, 0, 0, 0)

    def test_sale_before_observation_is_not_deducted_twice_in_inventory_count(self):
        item = self.product("normal-packets", enabled=False)
        self.purchase_packs(item, 10)
        count = self.inventory_count(item)
        self.sale(item, 2)
        recorded = self.cmd("inventory_record_count", {"count": count["id"], "physical": [
            {"balance": count["expected"][0]["balance"], "quantity": "8"},
        ]})
        self.assertEqual(D(recorded["physical"][0]["variance"]), 0)
        self.assertEqual(recorded["physical"][0]["sealed_variance"], 0)
        result = self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "Eight packets verified after sale"})
        self.assertEqual(result["effects"], [])
        self.balance(item, 8, 0, 8)

    def test_sale_before_observation_preserves_production_pack_split(self):
        item = self.product()
        self.purchase_packs(item, 10)
        count = self.cmd("start_count", {
            "location": self.store.pk, "mode": "single", "scope": "production", "item": item.pk,
        })
        self.sale(item, 2)
        recorded = self.cmd("record_count", {"count": count["id"], "physical": [
            {"balance": count["expected"][0]["balance"], "quantity": "800", "sealed_packages": 8},
        ]})
        self.assertEqual(D(recorded["physical"][0]["variance"]), 0)
        self.assertEqual(recorded["physical"][0]["sealed_variance"], 0)
        result = self.cmd("adjust_count", {"count": count["id"], "reason": "Eight sealed 100g packs verified"})
        self.assertEqual(result["effects"], [])
        self.balance(item, 8, 0, 800)

    def test_inventory_role_can_count_retail_but_cannot_adjust_production(self):
        normal = self.product("retail", enabled=False)
        production = self.product("ingredient")
        staff = User.objects.create_user(username="inventory-counter", email="counter@example.test",
            user_type="inventory_manager", restaurant=self.restaurant)
        staff.branches.add(self.branch)
        SharedAppState.objects.update_or_create(state_key="vestora-stores", defaults={
            "state_value": [{"id": "A", "restaurantId": self.restaurant.pk}],
        })
        SharedAppState.objects.update_or_create(state_key="vestora-users", defaults={
            "state_value": [{"id": "counter", "email": staff.email, "status": "Active",
                "storeId": "A", "role": "Retail stock counter"}],
        })
        roles, _ = SharedAppState.objects.update_or_create(state_key="vestora-custom-roles", defaults={
            "state_value": [{"name": "Retail stock counter", "storeId": "A", "status": "Active",
                "modules": ["inventory"], "permissions": ["access:inventory:stock-count"]}],
        })
        client = APIClient()
        client.force_authenticate(staff)

        def call(command, data):
            return client.post("/api/production/A/command/", {
                "command": command, "key": str(uuid.uuid4()), "data": data,
            }, format="json")

        started = call("inventory_start_count", {"location": self.store.pk, "mode": "single", "item": normal.pk})
        self.assertEqual(started.status_code, 200, started.data)
        count = started.data
        recorded = call("inventory_record_count", {"count": count["id"], "physical": [
            {"balance": count["expected"][0]["balance"], "quantity": "0"},
        ]})
        self.assertEqual(recorded.status_code, 200, recorded.data)
        posted = call("inventory_adjust_count", {"count": count["id"], "reason": "Retail shelves counted"})
        self.assertEqual(posted.status_code, 200, posted.data)
        self.assertEqual(call("adjust_count", {"count": count["id"], "reason": "Not authorized"}).status_code, 403)

        for scope in ("production", "all"):
            other = self.cmd("start_count", {"location": self.store.pk, "mode": "single",
                "scope": scope, "item": production.pk})
            rejected = call("inventory_record_count", {"count": other["id"], "physical": [
                {"balance": other["expected"][0]["balance"], "quantity": "0"},
            ]})
            self.assertEqual(rejected.status_code, 400, rejected.data)
            rejected_adjust = call("inventory_adjust_count", {"count": other["id"], "reason": "Wrong scope"})
            self.assertEqual(rejected_adjust.status_code, 400, rejected_adjust.data)

        roles.state_value[0]["permissions"] = ["access:inventory:create"]
        roles.save()
        self.assertEqual(call("inventory_start_count", {
            "location": self.store.pk, "mode": "single", "item": normal.pk,
        }).status_code, 403)

    def test_production_role_cannot_bypass_inventory_access_with_generic_count_commands(self):
        normal = self.product("retail", enabled=False)
        ingredient = self.product("ingredient")
        production_user = User.objects.create_user(username="production-counter", email="chef@example.test",
            user_type="chef", restaurant=self.restaurant)
        production_user.branches.add(self.branch)
        SharedAppState.objects.update_or_create(state_key="vestora-stores", defaults={
            "state_value": [{"id": "A", "restaurantId": self.restaurant.pk}],
        })
        SharedAppState.objects.update_or_create(state_key="vestora-users", defaults={
            "state_value": [{"id": "chef", "email": production_user.email, "status": "Active",
                "storeId": "A", "role": "Production counter"}],
        })
        SharedAppState.objects.update_or_create(state_key="vestora-custom-roles", defaults={
            "state_value": [{"name": "Production counter", "storeId": "A", "status": "Active",
                "modules": ["production"], "permissions": ["production.post", "production.adjust"]}],
        })
        client = APIClient()
        client.force_authenticate(production_user)

        def call(command, data):
            return client.post("/api/production/A/command/", {
                "command": command, "key": str(uuid.uuid4()), "data": data,
            }, format="json")

        saved_counts = []
        for scope in ("inventory", "all"):
            rejected_start = call("start_count", {
                "location": self.store.pk, "mode": "single", "scope": scope, "item": normal.pk,
            })
            self.assertEqual(rejected_start.status_code, 403, rejected_start.data)
            original = self.cmd("inventory_start_count" if scope == "inventory" else "start_count", {
                "location": self.store.pk, "mode": "single", "scope": scope, "item": normal.pk,
            })
            physical = [{"balance": original["expected"][0]["balance"], "quantity": "0", "sealed_packages": 0}]
            rejected_record = call("record_count", {"count": original["id"], "physical": physical})
            self.assertEqual(rejected_record.status_code, 403, rejected_record.data)
            self.cmd("record_count", {"count": original["id"], "physical": physical})
            rejected_adjust = call("adjust_count", {"count": original["id"], "reason": "Missing Inventory permission"})
            self.assertEqual(rejected_adjust.status_code, 403, rejected_adjust.data)
            saved_counts.append((original, physical))

        allowed_start = call("start_count", {
            "location": self.store.pk, "mode": "single", "scope": "production", "item": ingredient.pk,
        })
        self.assertEqual(allowed_start.status_code, 200, allowed_start.data)
        production_count = allowed_start.data
        allowed_record = call("record_count", {"count": production_count["id"], "physical": [
            {"balance": production_count["expected"][0]["balance"], "quantity": "0", "sealed_packages": 0},
        ]})
        self.assertEqual(allowed_record.status_code, 200, allowed_record.data)
        allowed_post = call("adjust_count", {"count": production_count["id"], "reason": "Production ingredients counted"})
        self.assertEqual(allowed_post.status_code, 200, allowed_post.data)

        # Owners can still review and finish counts created before scope separation.
        client.force_authenticate(self.user)
        old_count, old_physical = saved_counts[1]
        owner_record = call("record_count", {"count": old_count["id"], "physical": old_physical})
        self.assertEqual(owner_record.status_code, 200, owner_record.data)
        owner_post = call("adjust_count", {"count": old_count["id"], "reason": "Owner reviewed older all-products count"})
        self.assertEqual(owner_post.status_code, 200, owner_post.data)
