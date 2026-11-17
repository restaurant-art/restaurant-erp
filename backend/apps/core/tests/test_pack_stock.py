import copy
import uuid
from datetime import timedelta
from decimal import Decimal as D
from django.test import TestCase, TransactionTestCase
from django.db import connection, close_old_connections, connections, OperationalError
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone
from concurrent.futures import ThreadPoolExecutor
from rest_framework.exceptions import ValidationError
from apps.core.models import SharedAppState, Branch
from apps.core.production_models import KitchenItem, KitchenBalance, KitchenMovement, KitchenTransaction, ProductionSite, KitchenLocation, KitchenOrderLine, KitchenReservation
from apps.core.production_service import allocate, execute, last_known_unit_cost
from .test_production import KitchenFixture


class PackFixture(KitchenFixture):
    def product(self, key="chilli", size=100, enabled=True, unit="packet", base="g"):
        product = {"id": key, "name": key, "sku": key, "barcode": key, "unit": unit,
                   "stock": 0, "cost": 20, "price": 18, "gstRate": 5, "mrp": 30, "sellingPrice": 25,
                   "productionConsumption": enabled, "productionBaseUnit": base, "productionUnitFactor": str(size),
                   "sellable": True, "purchasable": True}
        result = self.cmd("product", {"product": product})
        return KitchenItem.objects.get(pk=result["item"])

    def purchase_packs(self, item, count=10, location=None, expires=None):
        key = str(uuid.uuid4())
        line = {"itemId": item.legacy_key, "quantity": count, "unit": item.inventory_item.unit}
        if item.pack_size:
            line["purchaseUnit"] = {"mode": "configured", "name": item.inventory_item.unit,
                                    "quantity": str(item.pack_size), "unit": item.base_unit}
        if expires:
            line["expires_at"] = expires
        entry = {"lines": [line]}
        drafts, _ = SharedAppState.objects.get_or_create(state_key="vestora-purchase-drafts-A", defaults={"state_value": []})
        drafts.state_value.append({"id": key, "status": "PendingApproval", "entry": entry})
        drafts.save()
        data = {"source": key, "draft_id": key, "entry": entry, "location": (location or self.store).pk,
                "receipts": [{**line, "id": key, "carryingValue": str(count * 20)}]}
        return self.cmd("purchase", data, key), data

    def sale(self, item, count, reference="sale", location=None, fulfill=True):
        data = {"reference": reference, "location": (location or self.store).pk, "lines": [
            {"key": "line", "menu_key": item.legacy_key, "product_id": item.legacy_key,
             "sales_unit": item.inventory_item.unit, "quantity": str(count)}]}
        self.cmd("confirm", data)
        return self.cmd("fulfill", {"reference": reference, "targets": {"line": str(count)}}) if fulfill else data

    def consume(self, item, amount, location=None):
        recipe = self.recipe([(item, amount)], [(self.rice, amount, 1)])
        draft = self.cmd("draft_batch", {"recipe": recipe["id"], "reference": str(uuid.uuid4()), "scale": "1",
            "source_location": (location or self.store).pk, "destination_location": self.kitchen.pk})
        return self.cmd("post_batch", {"batch": draft["id"], "inputs": [{"item": item.pk, "quantity": str(amount)}],
            "outputs": [{"item": self.rice.pk, "quantity": str(amount)}]})

    def balance(self, item, sealed, opened, total, location=None):
        rows = KitchenBalance.objects.filter(lot__item=item, location=location or self.store)
        self.assertEqual(sum(b.sealed_packages for b in rows), sealed)
        self.assertEqual(sum(b.open_quantity for b in rows), D(opened))
        self.assertEqual(sum(b.quantity for b in rows), D(total))
        for b in rows:
            if b.lot.reference.startswith("__negative_stock__:"):
                self.assertLessEqual(b.quantity, 0)
                self.assertEqual((b.open_quantity, b.sealed_packages), (D(0), 0))
            else:
                self.assertEqual(b.quantity, b.open_quantity + b.sealed_packages * (b.lot.pack_size or 0))
            movements = KitchenMovement.objects.filter(balance=b)
            self.assertEqual(sum(m.sealed_delta for m in movements), b.sealed_packages)
            self.assertEqual(sum(m.open_delta for m in movements), b.open_quantity)


class PackStockTests(PackFixture, TestCase):
    def test_single_product_correction_counts_stock_missing_from_ledger(self):
        item = self.product()
        count = self.cmd("start_count", {"location": self.store.pk, "mode": "single", "item": item.pk})
        self.assertEqual(count["mode"], "single")
        self.assertEqual(len(count["expected"]), 1)
        row = count["expected"][0]
        self.assertTrue(row["new"])
        self.cmd("record_count", {"count": count["id"], "physical": [
            {"balance": row["balance"], "quantity": "250", "sealed_packages": 2}]})
        self.balance(item, 0, 0, 0)  # recording alone never changes stock
        with self.assertRaisesRegex(ValidationError, "Count gain unit cost"):
            self.cmd("adjust_count", {"count": count["id"], "reason": "Incomplete valuation"})
        self.balance(item, 0, 0, 0)  # an incomplete posting rolls back atomically
        self.cmd("adjust_count", {"count": count["id"], "reason": "Verified 2 unopened packs and 50g loose",
            "unit_costs": {row["balance"]: "0.2"}})
        self.balance(item, 2, 50, 250)
        self.consume(item, 30)
        self.balance(item, 2, 20, 220)

    def test_full_stock_take_requires_every_item_and_includes_zero_stock(self):
        item = self.product()
        self.purchase_packs(item, 10)
        count = self.cmd("start_count", {"location": self.store.pk, "mode": "full"})
        self.assertGreater(len(count["expected"]), 1)
        item_row = next(row for row in count["expected"] if row["item"] == item.pk)
        self.assertTrue(any(row["new"] for row in count["expected"] if row["item"] != item.pk))
        with self.assertRaisesRegex(ValidationError, "every listed batch"):
            self.cmd("record_count", {"count": count["id"], "physical": [
                {"balance": item_row["balance"], "quantity": "850", "sealed_packages": 8}]})
        physical = [{"balance": row["balance"], "quantity": "850" if row == item_row else "0",
            **({"sealed_packages": 8 if row == item_row else 0} if row["pack_size"] else {})}
            for row in count["expected"]]
        self.cmd("record_count", {"count": count["id"], "physical": physical})
        self.cmd("adjust_count", {"count": count["id"], "reason": "Reviewed full Store count"})
        self.balance(item, 8, 50, 850)

    def test_single_product_count_restarts_if_new_lot_arrives(self):
        item = self.product()
        count = self.cmd("start_count", {"location": self.store.pk, "mode": "single", "item": item.pk})
        self.purchase_packs(item, 1)
        with self.assertRaisesRegex(ValidationError, "new stock lot"):
            self.cmd("record_count", {"count": count["id"], "physical": [
                {"balance": count["expected"][0]["balance"], "quantity": "0", "sealed_packages": 0}]})

    def test_full_count_restarts_when_new_product_is_created(self):
        count = self.cmd("start_count", {"location": self.store.pk, "mode": "full"})
        self.product("new-chilli")
        physical = [{"balance": row["balance"], "quantity": "0",
            **({"sealed_packages": 0} if row["pack_size"] else {})} for row in count["expected"]]
        with self.assertRaisesRegex(ValidationError, "new stock item"):
            self.cmd("record_count", {"count": count["id"], "physical": physical})

    def test_nonpack_correction_restarts_if_stock_moves_after_count(self):
        count = self.cmd("start_count", {"location": self.kitchen.pk, "mode": "single", "item": self.flour.pk})
        row = count["expected"][0]
        self.cmd("record_count", {"count": count["id"], "physical": [
            {"balance": row["balance"], "quantity": "9900"}]})
        self.cmd("usage", {"item": self.flour.pk, "location": self.kitchen.pk,
            "quantity": "20", "category": "waste", "source": "waste-after-count",
            "reason": "Measured waste"})
        with self.assertRaisesRegex(ValidationError, "Stock moved after"):
            self.cmd("adjust_count", {"count": count["id"], "reason": "Physical count reviewed"})

    def test_legacy_packet_product_cannot_sell_unverified_loose_weight(self):
        item = self.product()
        KitchenItem.objects.filter(pk=item.pk).update(pack_size=None)
        self.cmd("receipt", {"item": item.pk, "location": self.store.pk, "quantity": 1000, "unit": "g",
            "total_cost": 200, "source": "legacy-stock", "reason": "Historical unverified weight"})
        with self.assertRaisesRegex(ValidationError, "verify its unopened stock"):
            self.sale(item, 1)
        self.balance(item, 0, 1000, 1000)
        self.assertFalse(KitchenReservation.objects.exists())

    def test_older_retail_reservation_requires_refresh_before_fulfillment(self):
        item = self.product()
        self.purchase_packs(item, 2)
        self.sale(item, 1, fulfill=False)
        line = KitchenOrderLine.objects.get(order__reference="sale")
        line.snapshot["components"][0].pop("sealed")
        line.snapshot["components"][0].pop("pack_size")
        line.save(update_fields=["snapshot"])
        line.reservations.update(sealed_packages=0)
        with self.assertRaisesRegex(ValidationError, "older pack configuration"):
            self.cmd("fulfill", {"reference": "sale", "targets": {"line": 1}})
        self.balance(item, 2, 0, 200)
        self.cmd("confirm", {"reference": "sale", "location": self.store.pk, "lines": [
            {"key": "line", "menu_key": item.legacy_key, "quantity": 1,
             "refresh_recipe": True, "expected_revision": line.revision}]})
        self.cmd("fulfill", {"reference": "sale", "targets": {"line": 1}})
        self.balance(item, 1, 0, 100)

    def test_physical_count_records_sealed_and_loose_without_creating_packs(self):
        item = self.product()
        self.purchase_packs(item, 10)
        b = KitchenBalance.objects.get(lot__item=item)
        count = self.cmd("start_count", {"location": self.store.pk})
        self.cmd("record_count", {"count": count["id"], "physical": [
            {"balance": b.pk, "quantity": "950", "sealed_packages": 9}]})
        self.balance(item, 10, 0, 1000)  # observation alone is not a write
        self.cmd("adjust_count", {"count": count["id"], "reason": "Measured damaged pack loss"})
        self.balance(item, 9, 50, 950)
        self.consume(item, 30)
        self.balance(item, 9, 20, 920)

    def test_physical_count_does_not_overwrite_intervening_sale(self):
        item = self.product()
        self.purchase_packs(item, 10)
        b = KitchenBalance.objects.get(lot__item=item)
        count = self.cmd("start_count", {"location": self.store.pk})
        self.cmd("record_count", {"count": count["id"], "physical": [{"balance": b.pk, "quantity": 1000, "sealed_packages": 10}]})
        self.sale(item, 1)
        with self.assertRaises(ValidationError):
            self.cmd("adjust_count", {"count": count["id"], "reason": "Count checked"})
        self.balance(item, 9, 0, 900)

    def test_saved_measure_cannot_disagree_with_pack_size(self):
        item = self.product()
        with self.assertRaises(ValidationError):
            self.cmd("item", {"id": item.pk, "name": "Chilli", "kind": "raw", "base_unit": "g", "measures": {"packet": "500"}})
        item.refresh_from_db()
        self.assertEqual(D(item.measures["packet"]), D(100))

    def test_retail_resale_recipe_requires_sealed_packs(self):
        item = self.product()
        self.purchase_packs(item, 2, self.kitchen)
        self.consume(item, 50, self.kitchen)
        self.serving("packet-menu", [(item, 100)], method="resale")
        self.confirm("too-many", [("packet-menu", 2)])
        self.fulfill("too-many", **{"packet-menu": 2})
        # One real sealed pack was issued. The second is recorded as a
        # measured shortage; the loose 50 g is never treated as a packet.
        self.balance(item, 0, 50, -50, self.kitchen)

    def test_opened_stock_in_later_lot_used_before_earlier_sealed_lot(self):
        item = self.product()
        self.purchase_packs(item, 2)
        self.purchase_packs(item, 1)
        last = KitchenBalance.objects.filter(lot__item=item).latest("pk")
        self.cmd("usage", {"item": item.pk, "location": self.store.pk, "quantity": 20, "unit": "g",
            "category": "sample", "reason": "Sample", "selected_lots": [last.lot_id]})
        self.consume(item, 30)
        self.balance(item, 2, 50, 250)

    def test_retail_and_closing_reports_expose_package_balances(self):
        from apps.core.production_reports import availability, report
        item = self.product()
        self.purchase_packs(item)
        self.sale(item, 2)
        self.consume(item, 150)
        row = next(r for r in availability(self.site)["balances"] if r["item"] == item.pk)
        self.assertEqual(row["saleable_packs"], 6)
        self.assertEqual(D(row["loose_quantity"]), D(50))
        self.assertTrue(row["pack_tracking_required"])
        bulk = next(r for r in availability(self.site)["balances"] if r["item"] == self.raw_rice.pk)
        self.assertFalse(bulk["pack_tracking_required"])
        row = next(r for r in report(self.site, timezone.localdate())["closing"] if r["item"] == item.pk)
        self.assertEqual(row["unopened_packs"], 6)
        self.assertEqual(D(row["loose_quantity"]), D(50))

    def test_sealed_reservation_does_not_hide_free_loose_stock_in_later_lot(self):
        item = self.product()
        self.purchase_packs(item, 2)
        self.purchase_packs(item, 3)
        last = KitchenBalance.objects.filter(lot__item=item).latest("pk")
        self.cmd("usage", {"item": item.pk, "location": self.store.pk, "quantity": 50, "unit": "g",
            "category": "sample", "reason": "Sample", "selected_lots": [last.lot_id]})
        self.cmd("confirm", {"reference": "reserved-later-packs", "location": self.store.pk, "lines": [
            {"key": "line", "menu_key": item.legacy_key, "product_id": item.legacy_key,
             "quantity": 2, "selected_lots": {str(item.pk): [last.lot_id]}}]})
        self.consume(item, 30)
        self.balance(item, 4, 20, 420)
        last.refresh_from_db()
        self.assertEqual((last.sealed_packages, last.open_quantity), (2, D(20)))
        self.cmd("fulfill", {"reference": "reserved-later-packs", "targets": {"line": 2}})
        self.balance(item, 2, 20, 220)

    def test_old_draft_requires_explicit_size_review(self):
        item = self.product()
        result, payload = self.purchase_packs(item)
        payload = copy.deepcopy(payload)
        payload["source"] = payload["draft_id"] = "older-draft"
        payload["entry"]["lines"][0].pop("purchaseUnit")
        payload["receipts"][0].pop("purchaseUnit")
        row = SharedAppState.objects.get(state_key="vestora-purchase-drafts-A")
        row.state_value.append({"id": "older-draft", "status": "PendingApproval", "entry": payload["entry"]})
        row.save()
        with self.assertRaises(ValidationError): self.cmd("purchase", payload)
        self.balance(item, 10, 0, 1000)

    def test_exact_ten_packet_example_through_purchase_pos_and_production_recipe(self):
        item = self.product()
        result, payload = self.purchase_packs(item)
        self.balance(item, 10, 0, 1000)
        self.assertEqual(self.cmd("purchase", payload, payload["source"]), result)
        self.sale(item, 2)
        self.balance(item, 8, 0, 800)
        self.cmd("fulfill", {"reference": "sale", "targets": {"line": "2"}})
        self.balance(item, 8, 0, 800)
        self.consume(item, 150)
        self.balance(item, 6, 50, 650)
        self.consume(item, 30)
        self.balance(item, 6, 20, 620)
        self.assertEqual(self.stock(item)[1], D(124))
        master = SharedAppState.objects.get(state_key="vestora-inventory-A").state_value[0]
        self.assertEqual((master["unopenedPacks"], master["looseStock"], master["totalBaseStock"]), (6, 20, 620))
        self.assertEqual((master["barcode"], master["mrp"], master["sellingPrice"], master["gstRate"]), ("chilli", 30, 25, 5))

    def test_loose_contents_never_sell_as_sealed(self):
        item = self.product()
        self.purchase_packs(item, 2)
        self.consume(item, 50)
        self.sale(item, 2)
        # The real unopened pack is sold; the loose 50 g remains and the
        # missing second packet is held as negative stock.
        self.balance(item, 0, 50, -50)
        with self.assertRaises(ValidationError): self.sale(item, D("0.5"))

    def test_checkout_can_sell_into_shortage_and_future_purchase_clears_it(self):
        item = self.product(key="masala-shortage", size=100)
        # Product Master cost alone is not purchase history, even if an older
        # cached valuation still happens to be present.
        item.inventory_item.valuation_rate = D("20.00")
        item.inventory_item.save(update_fields=["valuation_rate"])
        self.assertEqual(last_known_unit_cost(self.site, item, self.store), D("0"))
        self.sale(item, 12, reference="short-checkout")
        self.balance(item, 0, 0, -1200, self.store)
        self.assertEqual(self.stock(item, self.store), (D(-1200), D(0)))
        result, payload = self.purchase_packs(item, 10)
        self.assertEqual(D(self.stock(item)[0]), D(-200))
        self.assertEqual(self.stock(item, self.store), (D(-200), D(0)))
        result, payload = self.purchase_packs(item, 3)
        self.assertEqual(D(self.stock(item)[0]), D(100))
        self.balance(item, 1, 0, 100, self.store)
        self.assertEqual(D(self.stock(item)[1]), D(60))

    def test_master_cost_and_nonpurchase_receipt_do_not_enable_shortage_cost(self):
        item = self.product(key="masala-weighted-shortage", size=100)
        # Simulate stale catalogue/cache cost with no approved purchase.
        item.inventory_item.valuation_rate = D("20.00")
        item.inventory_item.save(update_fields=["valuation_rate"])
        self.assertEqual(last_known_unit_cost(self.site, item, self.store), D("0"))

        self.sale(item, 1, reference="weighted-shortage-sale")
        self.balance(item, 0, 0, -100, self.store)
        self.assertEqual(self.stock(item, self.store), (D(-100), D(0)))

        # A generic valued receipt clears the zero-cost debt but still does
        # not establish an approved-purchase cost for a later shortage.
        self.cmd("receipt", {"item": item.pk, "location": self.store.pk, "quantity": "200",
            "unit": "g", "total_cost": "60", "source": "weighted-shortage-receipt",
            "reason": "Verified supplier invoice"})
        self.balance(item, 0, 100, 100, self.store)
        self.assertEqual(self.stock(item, self.store), (D(100), D(60)))
        self.consume(item, 100)
        self.assertEqual(self.stock(item, self.store), (D(0), D(0)))
        self.assertEqual(last_known_unit_cost(self.site, item, self.store), D("0"))
        self.sale(item, 1, reference="weighted-shortage-sale-again")
        self.assertEqual(self.stock(item, self.store), (D(-100), D(0)))

    def test_prior_approved_purchase_costs_a_later_retail_shortage(self):
        item = self.product(key="masala-purchased-shortage", size=100)
        self.purchase_packs(item, 10)
        self.sale(item, 10, reference="sell-all-purchased-stock")
        self.assertEqual(last_known_unit_cost(self.site, item, self.store), D("0.2"))
        self.sale(item, 1, reference="sell-beyond-purchased-stock")
        self.assertEqual(self.stock(item, self.store), (D(-100), D(-20)))

    def test_checkout_records_the_10500g_shortage_shown_in_pos(self):
        item = self.product(key="masala-pos-shortage", size=250)
        self.purchase_packs(item, 4)
        self.sale(item, 46, reference="pos-short-10500g")
        self.balance(item, 0, 0, -10500, self.store)
        self.assertEqual(D(self.stock(item)[0]), D(-10500))
        self.purchase_packs(item, 42)
        self.balance(item, 0, 0, 0, self.store)

    def test_production_serves_without_ingredient_and_receipts_settle_debt_first(self):
        item = self.product(key="production-shortage", size=100)
        self.serving("shortage-dish", [(item, 150)], method="cook_on_order")
        self.cmd("confirm", {"reference": "shortage-order", "location": self.store.pk,
            "lines": [{"key": "shortage-dish", "menu_key": "shortage-dish", "quantity": 1}]})
        self.fulfill("shortage-order", **{"shortage-dish": 1})
        self.balance(item, 0, 0, -150, self.store)
        for index in range(2):
            self.cmd("receipt", {"item": item.pk, "location": self.store.pk, "quantity": 100,
                "unit": "g", "total_cost": 20, "source": f"restock-{index}", "reason": "Received sealed pack",
                "sealed_packages": 1})
        # The first 100 g pays down the shortage. Of the next packet, 50 g
        # clears the remaining debt and 50 g is left loose in the opened pack.
        self.balance(item, 0, 50, 50, self.store)
        # With no approved purchase before this production run, the shortage
        # carries zero cost; subsequent generic receipts retain their own value.
        self.assertEqual(D(self.stock(item)[1]), D(20))

    def test_reservations_protect_unopened_packages_and_cancel_releases(self):
        item = self.product()
        self.purchase_packs(item, 2)
        self.sale(item, 2, fulfill=False)
        with self.assertRaises(ValidationError): self.consume(item, 1)
        self.cmd("cancel", {"reference": "sale", "reason": "Customer cancelled"})
        self.consume(item, 1)
        self.balance(item, 1, 99, 199)

    def test_transfer_preserves_package_state_and_reversal_restores_it(self):
        item = self.product()
        self.purchase_packs(item, 10)
        result = self.cmd("usage", {"item": item.pk, "location": self.store.pk, "destination": self.kitchen.pk,
            "quantity": "250", "unit": "g", "category": "transfer", "reason": "Kitchen supply", "source": "transfer"})
        self.balance(item, 7, 50, 750)
        self.balance(item, 2, 50, 250, self.kitchen)
        self.cmd("reverse", {"transaction": result["transaction"], "no_physical_consumption": True, "reason": "Wrong location"})
        self.balance(item, 10, 0, 1000)
        self.balance(item, 0, 0, 0, self.kitchen)

    def test_customer_return_sealed_or_loose_and_no_duplicate_return(self):
        item = self.product()
        self.purchase_packs(item)
        sold = self.sale(item, 2)["fulfillments"][0]
        data = {"fulfillment": sold["id"], "outcome": "usable_return", "reason": "Inspected sealed return",
            "location": self.store.pk, "returns": [{"movement": sold["allocations"][0]["movement"], "quantity": "100", "sealed_packages": 1}]}
        self.cmd("disposition", data)
        self.balance(item, 9, 0, 900)
        with self.assertRaises(ValidationError): self.cmd("disposition", data)

    def test_supplier_return_requires_unopened_packages_and_reverses(self):
        item = self.product()
        self.purchase_packs(item, 2)
        self.consume(item, 50)
        with self.assertRaises(ValidationError):
            self.cmd("usage", {"item": item.pk, "location": self.store.pk, "quantity": 2,
                "unit": "packet", "category": "supplier_return", "reason": "Return", "source": "return"})
        returned = self.cmd("purchase_return", {"source": "return-one", "reason": "Damaged pack", "location": self.store.pk,
            "receipts": [{"itemId": item.legacy_key, "quantity": 1, "unit": "packet", "id": "return-one"}]})
        self.balance(item, 0, 50, 50)
        self.cmd("reverse", {"transaction": returned["transaction"], "no_physical_consumption": True, "reason": "Return not collected"})
        self.balance(item, 1, 50, 150)

    def test_recipe_reversal_restores_opening_exactly(self):
        item = self.product()
        self.purchase_packs(item)
        batch = self.consume(item, 150)
        self.cmd("reverse", {"transaction": batch["transaction"], "no_physical_consumption": True, "reason": "Posting error"})
        self.balance(item, 10, 0, 1000)

    def test_purchase_reversal_and_downstream_guard(self):
        item = self.product()
        result, _ = self.purchase_packs(item)
        self.cmd("reverse", {"transaction": result["transaction"], "no_physical_consumption": True, "reason": "Duplicate document"})
        self.balance(item, 0, 0, 0)
        result, _ = self.purchase_packs(item)
        self.consume(item, 10)
        with self.assertRaises(ValidationError):
            self.cmd("reverse", {"transaction": result["transaction"], "no_physical_consumption": True, "reason": "Wrong entry"})

    def test_optional_normal_product_needs_no_weight(self):
        item = self.product("soap", size="", enabled=False)
        self.purchase_packs(item, 10)
        self.sale(item, 2)
        self.balance(item, 8, 0, 8)
        with self.assertRaises(ValidationError): self.consume(item, 1)

    def test_distinct_sizes_and_barcodes_and_frozen_receipts(self):
        small, big = self.product(), self.product("chilli500", size=500)
        self.purchase_packs(small, 2)
        self.purchase_packs(big, 2)
        self.sale(small, 1)
        self.balance(small, 1, 0, 100)
        self.balance(big, 2, 0, 1000)
        row = SharedAppState.objects.get(state_key="vestora-inventory-A").state_value
        product = next(p for p in row if p["id"] == "chilli")
        with self.assertRaises(ValidationError):
            self.cmd("product", {"product": {**product, "productionUnitFactor": 500}, "expected_updated_at": product["updatedAt"]})
        self.balance(small, 1, 0, 100)

    def test_sold_out_sku_keeps_historical_pack_size_for_returns(self):
        item = self.product()
        self.purchase_packs(item, 1)
        sold = self.sale(item, 1)["fulfillments"][0]
        self.balance(item, 0, 0, 0)
        product = SharedAppState.objects.get(state_key="vestora-inventory-A").state_value[0]
        with self.assertRaises(ValidationError):
            self.cmd("product", {"product": {**product, "productionUnitFactor": 500},
                                 "expected_updated_at": product["updatedAt"]})
        item.refresh_from_db()
        self.assertEqual(item.pack_size, D(100))
        self.cmd("disposition", {"fulfillment": sold["id"], "outcome": "usable_return",
            "reason": "Inspected sealed return", "location": self.store.pk,
            "returns": [{"movement": sold["allocations"][0]["movement"], "quantity": 100, "sealed_packages": 1}]})
        self.balance(item, 1, 0, 100)
        self.sale(item, 1, reference="returned-pack-sale")
        self.balance(item, 0, 0, 0)

    def test_pack_size_can_be_corrected_before_stock_history(self):
        item = self.product()
        product = SharedAppState.objects.get(state_key="vestora-inventory-A").state_value[0]
        self.cmd("product", {"product": {**product, "productionUnitFactor": 500},
                             "expected_updated_at": product["updatedAt"]})
        item.refresh_from_db()
        self.assertEqual(item.pack_size, D(500))
        self.purchase_packs(item, 1)
        self.balance(item, 1, 0, 500)

    def test_setup_cannot_change_or_remove_historical_pack_size_after_sellout(self):
        item = self.product()
        self.purchase_packs(item, 1)
        self.sale(item, 1)
        for size in (500, None):
            with self.subTest(pack_size=size), self.assertRaises(ValidationError):
                self.cmd("item", {"id": item.pk, "name": item.inventory_item.name,
                    "kind": item.kind, "base_unit": item.base_unit,
                    "measures": {"packet": "500"}, "pack_size": size})
            item.refresh_from_db()
            self.assertEqual(item.pack_size, D(100))
            self.assertEqual(D(item.measures["packet"]), D(100))
        self.balance(item, 0, 0, 0)

    def test_ml_litre_conversion_and_kg(self):
        item = self.product("oil", size=1000, unit="bottle", base="ml")
        self.purchase_packs(item, 3)
        self.cmd("usage", {"item": item.pk, "location": self.store.pk, "quantity": "1.25", "unit": "L",
            "category": "sample", "source": "oil-test", "reason": "Measured sample"})
        self.balance(item, 1, 750, 1750)

    def test_expired_quarantined_and_other_locations_not_available(self):
        item = self.product()
        self.purchase_packs(item, 2, self.kitchen)
        with self.assertRaises(ValidationError): allocate(self.site, item, self.store, D(100), sealed=True, pack_size=D(100))
        self.purchase_packs(item, 2, expires=(timezone.now() - timedelta(days=1)).isoformat())
        with self.assertRaises(ValidationError): allocate(self.site, item, self.store, D(100), sealed=True, pack_size=D(100))
        self.purchase_packs(item, 2)
        b = KitchenBalance.objects.filter(lot__item=item, location=self.store, lot__expires_at=None).first()
        b.lot.quarantined = True
        b.lot.save()
        with self.assertRaises(ValidationError): allocate(self.site, item, self.store, D(100), sealed=True, pack_size=D(100))

    def test_failed_multiline_confirmation_is_atomic(self):
        item = self.product()
        self.purchase_packs(item, 2)
        with self.assertRaises(ValidationError):
            self.cmd("confirm", {"reference": "multi", "location": self.store.pk, "lines": [
                {"key": "ok", "menu_key": "chilli", "product_id": "chilli", "quantity": 1},
                {"key": "bad", "menu_key": "missing", "product_id": "missing", "quantity": 1}]})
        self.sale(item, 2)
        self.balance(item, 0, 0, 0)

    def test_cross_branch_location_rejected(self):
        item = self.product()
        branch = Branch.objects.create(restaurant=self.restaurant, name="Other", code="B")
        site = ProductionSite.objects.create(branch=branch, store_id="B", enabled=True)
        location = KitchenLocation.objects.create(site=site, name="Other")
        with self.assertRaises(ValidationError): self.purchase_packs(item, location=location)
        self.balance(item, 0, 0, 0)


class PackConcurrencyTests(PackFixture, TransactionTestCase):
    def test_two_cashiers_cannot_sell_same_packs(self):
        item = self.product()
        self.purchase_packs(item, 10)
        def sell(n):
            close_old_connections()
            try:
                self.sale(item, 7, reference=f"cashier-{n}")
                return True
            except (ValidationError, OperationalError):
                return False  # SQLite contention is retried by the same durable envelope.
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(sell, (1, 2)))
        self.assertEqual(sum(outcomes), 1)
        self.balance(item, 3, 0, 300)


class PackMigrationTests(PackFixture, TransactionTestCase):
    def test_upgrade_preserves_quantity_value_and_history_without_inventing_sealed_packs(self):
        item = self.product()
        self.purchase_packs(item, 10)
        executor = MigrationExecutor(connection)
        executor.migrate([("core", "0009_pine_cloud_payments")])
        try:
            old = executor.loader.project_state([("core", "0009_pine_cloud_payments")]).apps
            balances = list(old.get_model("core", "KitchenBalance").objects.order_by("pk").values_list("pk", "quantity", "value"))
            movements = list(old.get_model("core", "KitchenMovement").objects.order_by("pk").values_list("pk", "quantity", "value"))
            history = list(old.get_model("core", "KitchenTransaction").objects.order_by("pk").values_list("pk", "result"))
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
            self.assertEqual(balances, list(KitchenBalance.objects.order_by("pk").values_list("pk", "quantity", "value")))
            self.assertEqual(movements, list(KitchenMovement.objects.order_by("pk").values_list("pk", "quantity", "value")))
            self.assertEqual(history, list(KitchenTransaction.objects.order_by("pk").values_list("pk", "result")))
            for b in KitchenBalance.objects.all():
                self.assertEqual(b.sealed_packages, 0)
                self.assertEqual(b.open_quantity, b.quantity)
                self.assertIsNone(b.lot.pack_size)
            for m in KitchenMovement.objects.all():
                self.assertEqual(m.open_delta, m.quantity)
                self.assertEqual(m.sealed_delta, 0)
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())

    def test_historical_loose_stock_only_becomes_sealed_after_reviewed_count(self):
        item = self.product()
        self.cmd("receipt", {"item": item.pk, "location": self.store.pk, "quantity": 1000, "unit": "g",
                             "total_cost": 200, "source": "old-stock", "reason": "Historical stock"})
        with self.assertRaises(ValidationError): allocate(self.site, item, self.store, D(100), sealed=True, pack_size=D(100))
        b = KitchenBalance.objects.get(lot__item=item)
        count = self.cmd("start_count", {"location": self.store.pk})
        self.cmd("record_count", {"count": count["id"], "physical": [{"balance": b.pk, "quantity": 1000, "sealed_packages": 10}]})
        self.cmd("adjust_count", {"count": count["id"], "reason": "Counted 10 sealed 100g packs"})
        self.sale(item, 2)
        self.balance(item, 8, 0, 800)
