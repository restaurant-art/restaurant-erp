import copy
import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.barcode_labels import DEFAULT_SETTINGS, barcode_format, purchase_label_count
from apps.core.models import BarcodePrintJob, Branch, Restaurant, SharedAppState, User
from apps.core.production_models import ProductionSite


class BarcodePrintingTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Label Store", slug="label-store")
        self.branch = Branch.objects.create(restaurant=self.restaurant, name="Label Branch", code="LABEL")
        ProductionSite.objects.create(store_id="LABEL", branch=self.branch)
        self.user = User.objects.create_user(username="label-owner", restaurant=self.restaurant, user_type="owner")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.root = "/api/barcodes/LABEL/"
        self.products = [
            {"id": str(n), "name": f"Label product {n:02}", "sku": f"S{n:02}", "barcode": f"PACK{n:02}",
             "stock": 24, "unit": "piece", "sellingPrice": 99, "mrp": 120, "brand": "Shelf", "category": "Food"}
            for n in range(50)
        ]
        self.inventory = SharedAppState.objects.create(state_key="vestora-inventory-LABEL", state_value=self.products)
        self.invoice = SharedAppState.objects.create(state_key="vestora-inventory-transactions-LABEL", state_value=[
            {"id": f"LINE{n}", "purchaseId": "PUR-50", "type": "Purchase", "itemId": str(n), "item": product["name"],
             "invoice": "INV-50", "supplier": "Label supplier", "date": "2026-11-12", "barcode": product["barcode"],
             "quantity": 2, "unit": "carton", "stockQuantity": 24, "stockUnit": "piece", "mrp": 120, "sellingPrice": 99}
            for n, product in enumerate(self.products)
        ])
        SharedAppState.objects.create(state_key="vestora-stores", state_value=[{"id": "LABEL", "name": "Label Store", "restaurantId": self.restaurant.pk}])

    def post(self, path, data):
        return self.client.post(self.root + path, data, format="json")

    def save_state(self, key, value, version=None):
        return self.client.put("/api/cloud/state/", {
            "key": key, "value": value, "expectedUpdatedAt": version, "mutationId": str(uuid.uuid4()),
        }, format="json")

    def specification(self, source, rows, quantity=1, **kwargs):
        return {"id": str(uuid.uuid4()), "action": "pdf", "source": source,
                "lines": [{"id": row["id"], "barcode": row["codes"][0]["barcode"],
                           "code_mrp": row["codes"][0]["mrp"], "quantity": quantity} for row in rows], **kwargs}

    def test_single_ten_bulk_across_pages_and_idempotent_reprint(self):
        first = self.client.get(self.root + "catalog/?q=Shelf&page=1").data
        second = self.client.get(self.root + "catalog/?q=Shelf&page=2").data
        self.assertEqual(first["total"], 50)
        self.assertEqual(len(first["rows"]), 25)
        self.assertFalse({r["id"] for r in first["rows"]} & {r["id"] for r in second["rows"]})
        for source, rows, count in (("single", first["rows"][:1], 1), ("single", first["rows"][:1], 10),
                                     ("bulk", first["rows"][-10:] + second["rows"][:10], 1)):
            spec = self.specification(source, rows, count)
            response = self.post("jobs/", spec)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["label_count"], count * len(rows))
            self.assertEqual(response.data["status"], "prepared")
            self.assertEqual(self.post("jobs/", spec).data["id"], response.data["id"])
        self.assertEqual(BarcodePrintJob.objects.count(), 3)
        handoff = self.post(f'jobs/{spec["id"]}/handoff/', {})
        self.assertEqual(handoff.data["status"], "pdf_download_started")
        reprint = self.post("jobs/", {"id": str(uuid.uuid4()), "action": "print", "reprint_of": spec["id"]})
        self.assertEqual(reprint.data["labels"], response.data["labels"])
        self.assertEqual(reprint.data["label_count"], 20)
        duplicate = {**spec, "id": str(uuid.uuid4()), "lines": [spec["lines"][0]] * 2}
        self.assertEqual(self.post("jobs/", duplicate).status_code, 400)

    def test_actual_50_line_purchase_five_selected_with_override_and_no_ledger_changes(self):
        inventory_before = copy.deepcopy(self.inventory.state_value)
        invoice_before = copy.deepcopy(self.invoice.state_value)
        bill = self.client.get(self.root + "purchases/?reference=PUR-50").data
        self.assertEqual(len(bill["rows"]), 50)
        self.assertEqual(bill["rows"][0]["default_quantity"], 24)
        self.assertEqual(bill["supplier"], "Label supplier")
        five = bill["rows"][::10]
        spec = self.specification("purchase", five, 24, purchase_reference="PUR-50", copies=2)
        spec["lines"][0]["quantity"] = 6
        response = self.post("jobs/", spec)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["label_count"], (4 * 24 + 6) * 2)
        self.assertEqual(response.data["labels"][0]["mrp"], 120)
        self.inventory.refresh_from_db()
        self.invoice.refresh_from_db()
        self.assertEqual(self.inventory.state_value, inventory_before)
        self.assertEqual(self.invoice.state_value, invoice_before)
        self.assertIsNone(purchase_label_count({"quantity": 10, "stockQuantity": 500, "stockUnit": "kg"}, None))
        self.assertIsNone(purchase_label_count({"quantity": 2, "unit": "carton", "stockUnit": "piece"}, None))

    def test_generation_manufacturer_validation_collision_and_preference_persistence(self):
        self.products[0]["barcode"] = ""
        self.products[1]["barcode"] = "4006381333931"
        self.products[2]["barcode"] = "4006381333930"
        self.products[3]["barcode"] = "PACK04"
        self.inventory.save()
        saved = self.post("generate/", {"item": "0"})
        self.assertEqual(saved.status_code, 200, saved.data)
        code = saved.data["codes"][0]
        self.assertEqual(code["format"], "CODE128")
        self.assertEqual(self.post("generate/", {"item": "0"}).data["codes"], [code])
        self.assertRegex(code["barcode"], r"^[1-9][0-9]{4}$")
        self.assertTrue(code["internal"])
        manufacturer = self.post("generate/", {"item": "1"}).data["codes"]
        self.assertEqual(manufacturer[1]["barcode"], "4006381333931")
        self.assertEqual(manufacturer[1]["format"], "EAN13")
        self.inventory.refresh_from_db()
        self.assertEqual(len({row["internalBarcode"] for row in self.inventory.state_value}), 50)
        self.assertEqual(self.inventory.state_value[0]["barcode"], "")
        self.assertEqual(self.inventory.state_value[1]["barcode"], "4006381333931")
        self.assertEqual(barcode_format("96385074"), "EAN8")
        self.assertEqual(barcode_format("036000291452"), "UPC")
        for item in ("2", "3"):
            row = self.client.get(self.root + f"catalog/?item={item}").data
            self.assertTrue(row["codes"][1]["issue"])
            self.assertEqual(self.post("jobs/", self.specification("single", [row])).status_code, 200)
            invalid = {**row, "codes": [row["codes"][1]]}
            self.assertEqual(self.post("jobs/", self.specification("single", [invalid])).status_code, 400)
        stored = self.client.get(self.root + "catalog/?q=" + code["barcode"]).data
        self.assertEqual([row["id"] for row in stored["rows"]], ["0"])
        a4 = {**DEFAULT_SETTINGS, "paper": "a4", "columns": 4, "margin": 3, "width": 40}
        response = self.client.put(self.root + "settings/", a4, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.client.get(self.root + "settings/").data["settings"], response.data["settings"])
        self.assertEqual(self.client.put(self.root + "settings/", {**a4, "columns": 10}, format="json").status_code, 400)

    def test_reserved_scan_values_and_new_products_receive_stable_codes(self):
        self.products[0]["sku"] = "10000"
        self.products[1]["plu"] = "10001"
        self.products[2]["barcode"] = "10002"
        self.products[3]["eanMrpOptions"] = [{"barcode": "10003"}]
        self.products[4]["status"] = "Inactive"
        self.inventory.save()
        SharedAppState.objects.create(state_key="vestora-menu-items-LABEL",
                                      state_value=[{"id": "menu", "barcode": "10004", "pluNumber": "10005"}])
        code = self.post("generate/", {"item": "0"}).data["internal_barcode"]
        self.assertEqual(code, "10006")
        self.inventory.refresh_from_db()
        original_codes = {row["id"]: row["internalBarcode"] for row in self.inventory.state_value}
        self.assertTrue(original_codes["4"])
        updated = [{key: val for key, val in row.items() if key != "internalBarcode"} for row in self.inventory.state_value]
        updated.append({"id": "legacy-new", "name": "Legacy path", "sku": "LEGACY", "unit": "piece", "internalBarcode": "99999"})
        response = self.save_state(self.inventory.state_key, updated, self.inventory.updated_at.isoformat())
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual({row["id"]: row["internalBarcode"] for row in response.data["state_value"][:-1]}, original_codes)
        self.assertNotEqual(response.data["state_value"][-1]["internalBarcode"], "99999")

        new = {"id": "production-new", "name": "Product Master path", "sku": "NEW", "unit": "piece",
               "barcode": "036000291452", "internalBarcode": code}
        payload = {"command": "product", "key": str(uuid.uuid4()), "data": {"product": new}}
        saved = self.client.post("/api/production/LABEL/command/", payload, format="json")
        self.assertEqual(saved.status_code, 200, saved.data)
        new_code = saved.data["product"]["internalBarcode"]
        self.assertRegex(new_code, r"^[1-9][0-9]{4}$")
        self.assertNotIn(new_code, original_codes.values())
        self.assertEqual(saved.data["product"]["barcode"], new["barcode"])
        payload["key"] = str(uuid.uuid4())
        payload["data"] = {"product": {**new, "name": "Renamed"}, "expected_updated_at": saved.data["product"]["updatedAt"]}
        renamed = self.client.post("/api/production/LABEL/command/", payload, format="json")
        self.assertEqual(renamed.status_code, 200, renamed.data)
        self.assertEqual(renamed.data["product"]["internalBarcode"], new_code)

        menu = SharedAppState.objects.get(state_key="vestora-menu-items-LABEL")
        collision = self.save_state(menu.state_key, [{"id": "menu", "barcode": code}], menu.updated_at.isoformat())
        self.assertEqual(collision.status_code, 400, collision.data)
        self.inventory.refresh_from_db()
        changed = copy.deepcopy(self.inventory.state_value)
        changed[1]["plu"] = code
        collision = self.save_state(self.inventory.state_key, changed, self.inventory.updated_at.isoformat())
        self.assertEqual(collision.status_code, 400, collision.data)

    def test_purchase_can_print_internal_code_even_when_invoice_ean_is_invalid(self):
        self.products[0]["barcode"] = "4006381333930"
        self.inventory.save()
        self.invoice.state_value[0]["barcode"] = self.products[0]["barcode"]
        self.invoice.save()
        internal = self.post("generate/", {"item": "0"}).data["internal_barcode"]
        bill = self.client.get(self.root + "purchases/?reference=PUR-50").data
        row = bill["rows"][0]
        code = next(code for code in row["codes"] if code.get("internal"))
        spec = self.specification("purchase", [{**row, "codes": [code]}], purchase_reference=bill["id"])
        result = self.post("jobs/", spec)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["labels"][0]["barcode"], internal)
        self.assertEqual(result.data["labels"][0]["price"], 99)

    def test_branch_and_source_permissions(self):
        staff = User.objects.create_user(username="label-staff", email="labels@example.test",
                                         user_type="purchase_manager", restaurant=self.restaurant)
        staff.branches.add(self.branch)
        SharedAppState.objects.create(state_key="vestora-users", state_value=[
            {"email": staff.email, "storeId": "LABEL", "role": "Purchase clerk", "status": "Active"}])
        SharedAppState.objects.create(state_key="vestora-custom-roles", state_value=[
            {"name": "Purchase clerk", "storeId": "LABEL", "status": "Active", "modules": ["inventory"],
             "permissions": ["access:inventory:purchase"]}])
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get(self.root + "catalog/").status_code, 403)
        self.assertEqual(self.post("generate/", {"item": "0"}).status_code, 403)
        self.assertEqual(self.client.get(self.root + "purchases/").status_code, 200)
        self.assertEqual(self.client.get("/api/barcodes/OTHER/purchases/").status_code, 403)
        staff.branches.clear()
        self.assertEqual(self.client.get(self.root + "purchases/").status_code, 403)
