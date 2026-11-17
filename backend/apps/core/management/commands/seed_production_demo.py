"""Opt-in demonstration only; refuses any database containing business data."""
import os
import uuid

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Branch, Restaurant, SharedAppState, User
from apps.core.production_models import KitchenLocation, ProductionSite
from apps.core.production_service import execute


class Command(BaseCommand):
    help = "Create configurable production examples in an EMPTY, disposable database only. Never run on a business database."

    def add_arguments(self, parser):
        parser.add_argument("--confirm-empty-database", action="store_true")

    @transaction.atomic
    def handle(self, *args, **options):
        if not options["confirm_empty_database"] or Restaurant.objects.exists() or SharedAppState.objects.exists() or User.objects.exists():
            raise CommandError("Requires --confirm-empty-database and a completely empty database. Existing records are never reset.")
        restaurant = Restaurant.objects.create(name="Production Lab", slug="production-lab", status="active")
        branch = Branch.objects.create(restaurant=restaurant, name="Demo Kitchen", code="LAB")
        user = User.objects.create_user(username="production-demo", email="production@demo.test",
            password=os.environ.get("UVPRO_DEMO_PASSWORD", "LocalDemoOnly-2026"), user_type="restaurant_admin", restaurant=restaurant)
        user.branches.add(branch)
        cashier = User.objects.create_user(username="production-cashier", email="cashier@demo.test",
            password=os.environ.get("UVPRO_DEMO_PASSWORD", "LocalDemoOnly-2026"), user_type="cashier", restaurant=restaurant)
        cashier.branches.add(branch)
        store_id = "PRODUCTION-LAB"
        SharedAppState.objects.create(state_key="vestora-stores", state_value=[{
            "id": store_id, "name": "Production Lab", "restaurantId": restaurant.pk, "branch": "Demo Kitchen", "branchCode": "LAB",
            "adminEmail": user.email, "status": "Active", "subscriptionExpiresAt": "2099-12-31", "address": "Isolated demonstration database"}])
        SharedAppState.objects.create(state_key="vestora-users", state_value=[{
            "id": str(user.pk), "name": "Demo Operator", "email": user.email, "storeId": store_id, "role": "Restaurant Admin", "status": "Active"},
            {"id": str(cashier.pk), "name": "Demo Cashier", "email": cashier.email, "storeId": store_id, "role": "Cashier", "status": "Active"}])
        menu = [{"id": key, "name": name, "category": "Demo menu", "price": price, "tax": 5, "status": "Active"} for key, name, price in [
            ("full", "Full biriyani", 180), ("half", "Half biriyani", 140), ("extra", "Extra rice", 40),
            ("chapathi", "Chapathi", 15), ("chapathi-set", "Two chapathi set", 30), ("free-extra", "Complimentary extra rice", 0)]]
        SharedAppState.objects.create(state_key=f"vestora-menu-items-{store_id}", state_value=menu)
        site = ProductionSite.objects.create(store_id=store_id, branch=branch)
        KitchenLocation.objects.create(site=site, name="Main store")
        kitchen = KitchenLocation.objects.create(site=site, name="Kitchen")
        def cmd(action, data):
            return execute(site, user, action, str(uuid.uuid4()), data)
        items = {}
        for key, name, kind, unit in [("flour", "Flour", "raw", "g"), ("raw-rice", "Raw basmati rice", "raw", "g"),
            ("raw-chicken", "Raw chicken portions", "raw", "piece"), ("rice", "Cooked biriyani rice (net, excludes chicken)", "prepared", "g"),
            ("chicken", "Cooked chicken", "prepared", "piece"), ("chapathi", "Chapathi", "prepared", "piece"), ("dough", "Dough", "intermediate", "g")]:
            items[key] = cmd("item", {"name": name, "kind": kind, "base_unit": unit})["id"]
        for key, qty, value in [("flour", 10000, 1000), ("raw-rice", 10000, 500), ("raw-chicken", 40, 800)]:
            cmd("receipt", {"item": items[key], "quantity": str(qty), "total_cost": str(value), "location": kitchen.pk,
                "category": "opening", "source": f"demo-opening-{key}", "reason": "Isolated configurable test opening"})
        def component(key, qty, weight=None):
            return {"item": items[key], "quantity": str(qty), **({"weight": str(weight)} if weight is not None else {})}
        recipes = {}
        for key, name, inputs, outputs in [
            ("biriyani", "Biriyani with separate rice and chicken", [component("raw-rice", 2000), component("raw-chicken", 20)], [component("rice", 6000, 1), component("chicken", 20, 4)]),
            ("chapathi", "Chapathi standard batch", [component("flour", 2000)], [component("chapathi", 40, 1)])]:
            recipes[key] = cmd("recipe", {"key": key, "name": name, "kind": "production", "inputs": inputs, "outputs": outputs,
                "instructions": "Demonstration quantities only. Weigh actual inputs and good output; portions and yield are independently configurable."})
        for key, components in [("full", [component("rice", 300), component("chicken", 1)]),
            ("half", [component("rice", 200), component("chicken", 1)]), ("extra", [component("rice", 150)]),
            ("chapathi", [component("chapathi", 1)]), ("chapathi-set", [component("chapathi", 2)]), ("free-extra", [component("rice", 150)])]:
            cmd("recipe", {"key": key, "name": next(m["name"] for m in menu if m["id"] == key), "kind": "serving", "stock_method": "prepared", "components": components})
        cmd("activate", {"openings_reviewed": True, "legacy_wip_reconciled": True, "reason": "Isolated demonstration cutover; no historic business records"})
        for reference, key, outputs in [("DEMO-BIR-01", "biriyani", [component("rice", 6000), component("chicken", 20)]),
            ("DEMO-CHAP-A", "chapathi", [component("chapathi", 40)]), ("DEMO-CHAP-B", "chapathi", [component("chapathi", 45)])]:
            recipe = recipes[key]
            batch = cmd("draft_batch", {"recipe": recipe["id"], "reference": reference, "scale": 1,
                "source_location": kitchen.pk, "destination_location": kitchen.pk})
            cmd("post_batch", {"batch": batch["id"], "inputs": recipe["inputs"], "outputs": outputs})
        self.stdout.write(self.style.SUCCESS("Created isolated Production Lab. Login: production@demo.test (UVPRO_DEMO_PASSWORD or LocalDemoOnly-2026). No production database may use this fixture."))
