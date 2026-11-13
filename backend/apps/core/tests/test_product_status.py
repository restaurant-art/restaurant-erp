import copy
import uuid
from decimal import Decimal as D

from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.core.models import AuditLog, InventoryItem, SharedAppState, User
from apps.core.production_compat import legacy_write_issue
from apps.core.production_models import KitchenCount, KitchenItem, KitchenMovement, ProductionSite
from .test_pack_stock import PackFixture


class ProductStatusTests(PackFixture, TestCase):
    def saved(self, item):
        return next(row for row in SharedAppState.objects.get(state_key="vestora-inventory-A").state_value
                    if str(row["id"]) == item.legacy_key)

    def status(self, item, enabled, **extra):
        return self.cmd("product_status", {"product_id": item.legacy_key, "enabled": enabled, **extra})

    def test_disable_enable_retains_stock_conversion_prices_flags_and_history(self):
        item = self.product()
        self.purchase_packs(item, 10)
        self.consume(item, 150)
        before = copy.deepcopy(self.saved(item))
        movements = list(KitchenMovement.objects.values_list("pk", "quantity", "value"))
        disabled = self.status(item, False)
        self.assertEqual(disabled["product"]["status"], "Inactive")
        self.assertEqual(disabled["effects"], [])
        self.balance(item, 8, 50, 850)
        enabled = self.status(item, True)
        self.assertEqual(enabled["product"]["status"], "Active")
        for field, value in before.items():
            if field not in ("updatedAt", "status"):
                self.assertEqual(enabled["product"][field], value, field)
        self.assertEqual(list(KitchenMovement.objects.values_list("pk", "quantity", "value")), movements)
        self.assertTrue(KitchenItem.objects.filter(pk=item.pk).exists())
        self.assertEqual(AuditLog.objects.filter(action="inventory.product_status", entity_id=item.legacy_key).count(), 2)

    def test_disabled_product_blocks_new_sales_purchases_and_recipes_then_reenables(self):
        item = self.product()
        self.purchase_packs(item, 4)
        self.status(item, False)
        with self.assertRaisesRegex(ValidationError, "disabled"):
            self.sale(item, 1)
        with self.assertRaisesRegex(ValidationError, "disabled"):
            self.purchase_packs(item, 1)
        with self.assertRaisesRegex(ValidationError, "disabled"):
            self.recipe([(item, 10)], [(self.rice, 10, 1)])
        self.balance(item, 4, 0, 400)
        self.status(item, True)
        self.sale(item, 1)
        self.balance(item, 3, 0, 300)

    def test_disabling_after_recipe_or_batch_draft_prevents_new_production(self):
        item = self.product()
        self.purchase_packs(item, 2)
        recipe = self.recipe([(item, 50)], [(self.rice, 50, 1)])
        draft = self.cmd("draft_batch", {"recipe": recipe["id"], "reference": "draft-before-disable", "scale": 1,
            "source_location": self.store.pk, "destination_location": self.kitchen.pk})
        self.status(item, False)
        with self.assertRaisesRegex(ValidationError, "disabled"):
            self.cmd("draft_batch", {"recipe": recipe["id"], "reference": "draft-after-disable", "scale": 1,
                "source_location": self.store.pk, "destination_location": self.kitchen.pk})
        with self.assertRaisesRegex(ValidationError, "disabled"):
            self.cmd("post_batch", {"batch": draft["id"], "inputs": [{"item": item.pk, "quantity": 50}],
                "outputs": [{"item": self.rice.pk, "quantity": 50}]})
        self.balance(item, 2, 0, 200)

    def test_disabled_stock_remains_countable_and_returnable(self):
        item = self.product()
        self.purchase_packs(item, 4)
        self.status(item, False)
        count = self.cmd("inventory_start_count", {"mode": "single", "item": item.pk, "location": self.store.pk})
        row = count["expected"][0]
        self.cmd("inventory_record_count", {"count": count["id"], "physical": [{"balance": row["balance"], "quantity": 4}]})
        self.cmd("inventory_adjust_count", {"count": count["id"], "reason": "Disabled stock still physically counted"})
        self.assertIsNotNone(KitchenCount.objects.get(pk=count["id"]).adjustment_id)
        self.cmd("purchase_return", {"source": "disabled-return", "reason": "Return discontinued stock", "location": self.store.pk,
            "receipts": [{"itemId": item.legacy_key, "quantity": 1, "unit": "packet"}]})
        self.balance(item, 3, 0, 300)
        self.assertEqual(self.saved(item)["status"], "Inactive")

    def test_parent_disable_blocks_child_without_overwriting_child_flags(self):
        parent = self.product("parent")
        child = self.product("child")
        saved = self.saved(child)
        self.cmd("product", {"product": {**saved, "parentProductId": parent.legacy_key, "variantLabel": "Batch 1"},
            "expected_updated_at": saved["updatedAt"]})
        before_child = copy.deepcopy(self.saved(child))
        self.purchase_packs(child, 2)
        self.status(parent, False)
        self.assertEqual(self.saved(child)["sellable"], before_child["sellable"])
        self.assertNotEqual(self.saved(child).get("status"), "Inactive")
        with self.assertRaisesRegex(ValidationError, "disabled"):
            self.sale(child, 1)
        with self.assertRaisesRegex(ValidationError, "disabled"):
            self.purchase_packs(child, 1)
        self.status(parent, True)
        self.sale(child, 1)
        self.balance(child, 1, 0, 100)

    def test_status_stale_update_validation_and_idempotency(self):
        item = self.product()
        before = self.saved(item)
        request = {"product_id": item.legacy_key, "enabled": False, "expected_updated_at": before["updatedAt"]}
        first = self.cmd("product_status", request, "disable-once")
        self.assertEqual(self.cmd("product_status", request, "disable-once"), first)
        with self.assertRaisesRegex(ValidationError, "changed"):
            self.status(item, True, expected_updated_at=before["updatedAt"])
        with self.assertRaises(ValidationError):
            self.status(item, 0)
        with self.assertRaises(ValidationError):
            self.cmd("product_status", {"product_id": "other-store-product", "enabled": False})

    def test_status_available_before_cutover_and_delete_is_always_blocked(self):
        item = self.product()
        ProductionSite.objects.filter(pk=self.site.pk).update(enabled=False)
        self.status(item, False)
        with self.assertRaisesRegex(ValidationError, "Disable or Enable"):
            self.cmd("delete_item", {"item": item.pk})
        self.assertTrue(InventoryItem.objects.filter(pk=item.inventory_item_id).exists())

    def test_legacy_sync_cannot_delete_or_silently_change_status(self):
        item = self.product()
        before = [copy.deepcopy(self.saved(item))]
        self.assertIn("cannot be deleted", legacy_write_issue("vestora-inventory-A", before, []))
        self.assertIn("Enable or Disable", legacy_write_issue("vestora-inventory-A", before, [{**before[0], "status": "Inactive"}]))
        self.assertIsNone(legacy_write_issue("vestora-inventory-categories-A", [{"id": "one"}], []))

    def test_rest_inventory_deletion_cannot_bypass_retention_policy(self):
        item = InventoryItem.objects.create(restaurant=self.restaurant, branch=self.branch,
            name="Never purchased", unit="piece", current_stock=0)
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.delete(f"/api/inventory-items/{item.pk}/")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertTrue(InventoryItem.objects.filter(pk=item.pk).exists())

    def test_product_master_role_can_toggle_but_count_only_role_cannot(self):
        item = self.product()
        staff = User.objects.create_user(username=str(uuid.uuid4()), email="inventory-status@example.test",
            user_type="inventory_manager", restaurant=self.restaurant)
        staff.branches.add(self.branch)
        SharedAppState.objects.update_or_create(state_key="vestora-stores", defaults={"state_value": [{"id": "A", "restaurantId": self.restaurant.pk}]})
        SharedAppState.objects.update_or_create(state_key="vestora-users", defaults={"state_value": [
            {"email": staff.email, "storeId": "A", "role": "Stock manager", "status": "Active"}]})
        roles, _ = SharedAppState.objects.update_or_create(state_key="vestora-custom-roles", defaults={"state_value": [
            {"name": "Stock manager", "storeId": "A", "status": "Active", "modules": ["inventory"],
             "permissions": ["access:inventory:create"]}]})
        client = APIClient()
        client.force_authenticate(staff)
        response = client.post("/api/production/A/command/", {"command": "product_status", "key": str(uuid.uuid4()),
            "data": {"product_id": item.legacy_key, "enabled": False}}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        roles.state_value[0]["permissions"] = ["access:inventory:stock-count"]
        roles.save()
        response = client.post("/api/production/A/command/", {"command": "product_status", "key": str(uuid.uuid4()),
            "data": {"product_id": item.legacy_key, "enabled": True}}, format="json")
        self.assertEqual(response.status_code, 403)
