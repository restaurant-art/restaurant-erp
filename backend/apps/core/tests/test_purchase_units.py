import copy
from decimal import Decimal as D
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from apps.core.models import SharedAppState
from apps.core.production_models import KitchenItem
from .test_production import KitchenFixture


class PurchaseUnitTests(KitchenFixture, TestCase):
    def test_product_master_units_flow_to_production_without_delivery_override(self):
        products = []
        lines = []
        expected = []
        definitions = [("rice", "kg", "g", 1000), ("oil", "ltr", "ml", 1000), ("masala", "pack", "g", 150), ("eggs", "box", "piece", 12)]
        for key, unit, base, factor in definitions:
            products.append({"id": key, "name": key, "unit": unit, "stock": 0, "cost": 0, "productionKind": "raw", "productionBaseUnit": base, "productionUnitFactor": factor})
        SharedAppState.objects.create(state_key="vestora-inventory-A", state_value=products)
        for key, unit, base, factor in definitions:
            mapped = self.cmd("item", {"name": key, "legacy_key": key, "kind": "raw", "base_unit": base, "measures": {unit: str(factor)} if unit in ("pack", "box") else {}})
            expected.append((KitchenItem.objects.get(pk=mapped["id"]), D(10 * factor)))
            lines.append({"itemId": key, "quantity": 10, "unit": unit})
        entry = {"lines": lines}
        SharedAppState.objects.create(state_key="vestora-purchase-drafts-A", state_value=[{"id": "master", "status": "PendingApproval", "entry": entry}])
        receipts = [{**copy.deepcopy(line), "id": str(index), "carryingValue": "300"} for index, line in enumerate(lines)]
        payload = {"source": "PUR-MASTER", "draft_id": "master", "entry": entry, "location": self.store.pk, "receipts": receipts}
        self.cmd("purchase", payload, "master-units")
        for item, quantity in expected:
            self.assertEqual(self.stock(item), (quantity, D(300)))
        projected = SharedAppState.objects.get(state_key="vestora-inventory-A").state_value
        self.assertEqual([(row["stock"], row["cost"]) for row in projected], [(10, 30)] * 4)

    def prepare(self):
        sizes = [{"id": "100", "name": "100 g pack", "quantity": 100, "unit": "g"}, {"id": "5", "name": "5 kg bag", "quantity": 5, "unit": "kg"}]
        SharedAppState.objects.create(state_key="vestora-inventory-A", state_value=[{"id": "chilli", "name": "Chilli", "unit": "kg", "stock": 0, "cost": 0, "purchaseUnits": sizes}])
        mapped = self.cmd("item", {"name": "Chilli", "legacy_key": "chilli", "kind": "raw", "base_unit": "g"})
        lines = [{"itemId": "chilli", "quantity": 10, "unit": sizes[0]["name"], "purchaseUnit": sizes[0]}, {"itemId": "chilli", "quantity": 2, "unit": sizes[1]["name"], "purchaseUnit": sizes[1]}, {"itemId": "chilli", "quantity": 0.5, "unit": "kg"}]
        entry = {"lines": lines}
        SharedAppState.objects.create(state_key="vestora-purchase-drafts-A", state_value=[{"id": "d", "status": "PendingApproval", "entry": entry}])
        receipts = [{**copy.deepcopy(line), "id": str(index), "carryingValue": str(value)} for index, (line, value) in enumerate(zip(lines, [200, 2000, 100]))]
        return KitchenItem.objects.get(pk=mapped["id"]), {"source": "PUR-SIZES", "draft_id": "d", "entry": entry, "location": self.store.pk, "receipts": receipts}

    def test_mixed_sizes_convert_once_and_preserve_value(self):
        item, payload = self.prepare()
        result = self.cmd("purchase", payload, "sizes")
        self.assertEqual(self.stock(item), (D(11500), D(2300)))
        self.assertEqual(self.cmd("purchase", payload, "sizes"), result)
        projected = SharedAppState.objects.get(state_key="vestora-inventory-A").state_value[0]
        self.assertEqual(projected["stock"], 11.5)
        self.assertEqual(projected["cost"], 200)
        receipts = SharedAppState.objects.get(state_key="vestora-inventory-transactions-A").state_value
        self.assertEqual(receipts[0]["quantity"], 10)
        self.assertEqual(receipts[0]["stockQuantity"], 1)
        self.assertEqual(receipts[0]["stockUnit"], "kg")

    def test_tampered_size_rolls_back_all_lines(self):
        item, payload = self.prepare()
        payload["receipts"][1]["purchaseUnit"]["quantity"] = 50
        with self.assertRaises(ValidationError): self.cmd("purchase", payload)
        self.assertEqual(self.stock(item), (D(0), D(0)))
        self.assertEqual(SharedAppState.objects.get(state_key="vestora-purchase-drafts-A").state_value[0]["status"], "PendingApproval")

    def test_removed_size_requires_draft_review(self):
        item, payload = self.prepare()
        products = SharedAppState.objects.get(state_key="vestora-inventory-A")
        products.state_value[0]["purchaseUnits"] = []
        products.save()
        with self.assertRaises(ValidationError): self.cmd("purchase", payload)
        self.assertEqual(self.stock(item), (D(0), D(0)))

    def test_delivery_weights_change_without_changing_old_receipts_or_master(self):
        item, _ = self.prepare()
        original_measures = copy.deepcopy(item.measures)
        products = SharedAppState.objects.get(state_key="vestora-inventory-A")
        products.state_value[0]["purchaseUnits"] = []
        products.save()
        for weight in (100, 120, 150):
            size = {"mode": "delivery", "name": "pack", "quantity": weight, "unit": "g"}
            line = {"itemId": "chilli", "quantity": 10, "unit": "pack", "purchaseUnit": size}
            entry = {"lines": [line]}
            drafts = SharedAppState.objects.get(state_key="vestora-purchase-drafts-A")
            drafts.state_value.append({"id": str(weight), "status": "PendingApproval", "entry": entry})
            drafts.save()
            payload = {"source": f"PUR-{weight}", "draft_id": str(weight), "entry": entry, "location": self.store.pk,
                       "receipts": [{**copy.deepcopy(line), "id": str(weight), "carryingValue": str(weight * 2)}]}
            self.cmd("purchase", payload, f"delivery-{weight}")
        self.assertEqual(self.stock(item), (D(3700), D(740)))
        item.refresh_from_db()
        self.assertEqual(item.measures, original_measures)
        receipts = SharedAppState.objects.get(state_key="vestora-inventory-transactions-A").state_value
        self.assertEqual(sorted(row["purchaseUnit"]["quantity"] for row in receipts), [100, 120, 150])
        self.assertEqual(SharedAppState.objects.get(state_key="vestora-inventory-A").state_value[0]["purchaseUnits"], [])

    def test_custom_product_without_fixed_pack_factor_receives_actual_delivery_weight(self):
        products = [{"id": "masala-box", "name": "Masala box", "unit": "box", "stock": 0, "cost": 0,
                     "productionKind": "raw", "productionBaseUnit": "g", "productionUnitFactor": ""}]
        SharedAppState.objects.create(state_key="vestora-inventory-A", state_value=products)
        item = self.cmd("item", {"name": "Masala box", "legacy_key": "masala-box", "kind": "raw", "base_unit": "g", "measures": {}})
        line = {"itemId": "masala-box", "quantity": 10, "unit": "box",
                "purchaseUnit": {"mode": "delivery", "name": "box", "quantity": 120, "unit": "g"}}
        entry = {"lines": [line]}
        SharedAppState.objects.create(state_key="vestora-purchase-drafts-A", state_value=[{"id": "variable-box", "status": "PendingApproval", "entry": entry}])
        payload = {"source": "PUR-VARIABLE-BOX", "draft_id": "variable-box", "entry": entry,
                   "location": self.store.pk, "receipts": [{**copy.deepcopy(line), "id": "variable-box-line", "carryingValue": "240"}]}
        self.cmd("purchase", payload, "variable-box")
        self.assertEqual(self.stock(KitchenItem.objects.get(pk=item["id"])), (D(1200), D(240)))
        product = SharedAppState.objects.get(state_key="vestora-inventory-A").state_value[0]
        self.assertEqual(product["productionUnitFactor"], "")

    def test_delivery_requires_positive_compatible_weight_and_exact_snapshot(self):
        item, payload = self.prepare()
        for weight, unit, receipt_weight in ((0, "g", 0), (-1, "g", -1), (120, "ml", 120), (120, "g", 150), (0.0000001, "g", 0.0000001)):
            with self.subTest(weight=weight, unit=unit, receipt_weight=receipt_weight):
                size = {"mode": "delivery", "name": "pack", "quantity": weight, "unit": unit}
                line = {"itemId": "chilli", "quantity": 10, "unit": "pack", "purchaseUnit": size}
                payload["entry"] = {"lines": [line]}
                drafts = SharedAppState.objects.get(state_key="vestora-purchase-drafts-A")
                drafts.state_value[0]["entry"] = payload["entry"]
                drafts.save()
                receipt = {**copy.deepcopy(line), "carryingValue": "200"}
                receipt["purchaseUnit"]["quantity"] = receipt_weight
                payload["receipts"] = [receipt]
                with self.assertRaises(ValidationError): self.cmd("purchase", payload)
                self.assertEqual(self.stock(item), (D(0), D(0)))
