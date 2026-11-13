import copy

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from apps.core.models import SharedAppState
from apps.core.production_models import KitchenItem
from .test_pack_stock import PackFixture


class PackVariantTests(PackFixture, TestCase):
    def variant(self, parent, **overrides):
        row = SharedAppState.objects.get(state_key="vestora-inventory-A")
        master = next(p for p in row.state_value if p["id"] == parent.legacy_key)
        child = {**copy.deepcopy(master), "id": "child", "sku": "child", "name": "Chilli batch 2",
                 "parentProductId": parent.legacy_key, "stock": 0, **overrides}
        return self.cmd("product", {"product": child})

    def test_same_size_batch_keeps_barcode_prices_and_its_own_stock(self):
        parent = self.product()
        self.purchase_packs(parent, 10)
        result = self.variant(parent, mrp=35, sellingPrice=28)
        child = KitchenItem.objects.get(pk=result["item"])
        self.assertNotEqual(child.pk, parent.pk)
        self.assertEqual(result["product"]["barcode"], parent.legacy_key)
        self.assertEqual(result["product"]["mrp"], 35)
        self.assertEqual(result["product"]["sellingPrice"], 28)
        self.sale(child, 1, "unreceived-child")
        self.balance(child, 0, 0, -100)
        self.balance(parent, 10, 0, 1000)
        self.purchase_packs(child, 2)
        self.sale(child, 1, "received-child")
        self.balance(child, 0, 0, 0)
        self.balance(parent, 10, 0, 1000)

    def test_different_size_cannot_reuse_parent_barcode_or_batch_identity(self):
        parent = self.product()
        with self.assertRaises(ValidationError):
            self.variant(parent, productionUnitFactor="500")
        self.assertFalse(KitchenItem.objects.filter(legacy_key="child").exists())
        with self.assertRaises(ValidationError):
            self.variant(parent, parentProductId="", productionUnitFactor="500")

    def test_unique_sku_is_required_even_between_batches(self):
        parent = self.product()
        self.variant(parent)
        with self.assertRaises(ValidationError):
            self.variant(parent, id="other-child")

    def test_legacy_parent_uses_existing_ledger_measure_without_rewriting_it(self):
        parent = self.product()
        row = SharedAppState.objects.get(state_key="vestora-inventory-A")
        for product in row.state_value:
            for key in ("productionConsumption", "productionBaseUnit", "productionUnitFactor"):
                product.pop(key, None)
        row.save()
        before = copy.deepcopy(row.state_value[0])
        result = self.variant(parent, productionConsumption=True, productionBaseUnit="g", productionUnitFactor="100")
        child = KitchenItem.objects.get(pk=result["item"])
        self.assertEqual(child.base_unit, "g")
        self.assertEqual(child.pack_size, 100)
        row.refresh_from_db()
        original = next(p for p in row.state_value if p["id"] == parent.legacy_key)
        # Projections may refresh stock fields, but historical configuration is
        # not inferred into the parent's editable metadata by creating a child.
        self.assertNotIn("productionUnitFactor", original)
        self.assertEqual(original["barcode"], before["barcode"])
