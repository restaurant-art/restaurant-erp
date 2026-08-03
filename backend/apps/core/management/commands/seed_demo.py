from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.core.models import (
    Branch,
    Customer,
    Expense,
    IntegrationSetting,
    InventoryItem,
    MenuCategory,
    MenuItem,
    Order,
    OrderItem,
    Payment,
    Printer,
    Restaurant,
    RestaurantSubscription,
    Role,
    StockMovement,
    SubscriptionPlan,
    Supplier,
    Table,
)


class Command(BaseCommand):
    help = "Create demo data for VESTORA."

    def handle(self, *args, **options):
        User = get_user_model()
        plan, _ = SubscriptionPlan.objects.get_or_create(
            name="Professional",
            defaults={
                "monthly_price": 4999,
                "annual_price": 49999,
                "max_branches": 10,
                "max_users": 100,
                "features": ["pos", "kds", "inventory", "crm", "reports", "ai_insights"],
            },
        )
        restaurant, _ = Restaurant.objects.get_or_create(
            slug="demo-spice-house",
            defaults={
                "name": "Demo Spice House",
                "legal_name": "Demo Spice House Pvt Ltd",
                "owner_name": "Anaya Rao",
                "owner_email": "owner@demo.test",
                "owner_mobile": "+91 90000 00001",
                "gst_number": "27ABCDE1234F1Z5",
                "fssai_number": "10019064001234",
                "address": "MG Road, Bengaluru",
                "status": "active",
                "features": {"offline_pos": True, "ai_forecast": True, "qr_ordering": True},
            },
        )
        branch, _ = Branch.objects.get_or_create(
            restaurant=restaurant,
            code="BLR-01",
            defaults={"name": "Indiranagar", "city": "Bengaluru", "phone": "+91 90000 00002"},
        )
        RestaurantSubscription.objects.get_or_create(
            restaurant=restaurant,
            defaults={
                "plan": plan,
                "status": "trial",
                "trial_ends_at": timezone.now() + timedelta(days=14),
                "current_period_ends_at": timezone.now() + timedelta(days=30),
            },
        )
        admin_role, _ = Role.objects.get_or_create(
            restaurant=restaurant,
            name="Restaurant Admin",
            defaults={"permissions": ["dashboard.view", "pos.bill", "reports.export", "settings.manage"]},
        )
        cashier_role, _ = Role.objects.get_or_create(
            restaurant=restaurant,
            name="Cashier",
            defaults={"permissions": ["dashboard.view", "pos.bill", "orders.manage"]},
        )
        if not User.objects.filter(username="admin@demo.test").exists():
            user = User.objects.create_user(
                username="admin@demo.test",
                email="admin@demo.test",
                password="Demo@12345",
                restaurant=restaurant,
                role=admin_role,
                user_type="restaurant_admin",
                first_name="Demo",
                last_name="Admin",
                mobile="+91 90000 00003",
            )
            user.branches.add(branch)
        if not User.objects.filter(username="cashier@demo.test").exists():
            cashier = User.objects.create_user(
                username="cashier@demo.test",
                email="cashier@demo.test",
                password="Demo@12345",
                restaurant=restaurant,
                role=cashier_role,
                user_type="cashier",
                first_name="Counter",
                last_name="One",
                mobile="+91 90000 00004",
            )
            cashier.branches.add(branch)

        food = MenuCategory.objects.get_or_create(restaurant=restaurant, branch=branch, name="Mains")[0]
        drinks = MenuCategory.objects.get_or_create(restaurant=restaurant, branch=branch, name="Beverages")[0]
        paneer = MenuItem.objects.get_or_create(
            restaurant=restaurant,
            branch=branch,
            name="Paneer Tikka Bowl",
            defaults={"category": food, "base_price": Decimal("249.00"), "tax_rate": Decimal("5.00"), "favourite": True},
        )[0]
        biryani = MenuItem.objects.get_or_create(
            restaurant=restaurant,
            branch=branch,
            name="Hyderabadi Biryani",
            defaults={"category": food, "base_price": Decimal("329.00"), "tax_rate": Decimal("5.00"), "favourite": True},
        )[0]
        MenuItem.objects.get_or_create(
            restaurant=restaurant,
            branch=branch,
            name="Masala Chaas",
            defaults={"category": drinks, "base_price": Decimal("79.00"), "tax_rate": Decimal("5.00")},
        )
        for index in range(1, 9):
            Table.objects.get_or_create(
                restaurant=restaurant,
                branch=branch,
                name=f"T{index}",
                defaults={"seats": 2 + (index % 3) * 2, "position": {"x": 80 * index, "y": 80}},
            )
        customer, _ = Customer.objects.get_or_create(
            restaurant=restaurant,
            branch=branch,
            mobile="+91 98888 77777",
            defaults={"name": "Rohan Mehta", "loyalty_points": 420, "wallet_balance": 250},
        )
        order, created = Order.objects.get_or_create(
            restaurant=restaurant,
            branch=branch,
            bill_number="BLR-0001",
            defaults={
                "order_type": "dine_in",
                "status": "preparing",
                "customer": customer,
                "subtotal": Decimal("578.00"),
                "tax_total": Decimal("28.90"),
                "grand_total": Decimal("607.00"),
            },
        )
        if created:
            OrderItem.objects.create(order=order, menu_item=paneer, name=paneer.name, quantity=1, rate=paneer.base_price, tax_rate=5)
            OrderItem.objects.create(order=order, menu_item=biryani, name=biryani.name, quantity=1, rate=biryani.base_price, tax_rate=5)
            Payment.objects.create(order=order, mode="upi", amount=Decimal("607.00"), reference="DEMO-UPI-1")
        rice, _ = InventoryItem.objects.get_or_create(
            restaurant=restaurant,
            branch=branch,
            name="Basmati Rice",
            defaults={"unit": "kg", "current_stock": Decimal("18.500"), "reorder_level": Decimal("25.000"), "valuation_rate": 120},
        )
        StockMovement.objects.get_or_create(
            restaurant=restaurant,
            branch=branch,
            item=rice,
            movement_type="in",
            quantity=Decimal("20.000"),
            reference="GRN-DEMO-1",
        )
        supplier, _ = Supplier.objects.get_or_create(
            restaurant=restaurant,
            branch=branch,
            name="FreshKart Supplies",
            defaults={"mobile": "+91 97777 66666", "gst_number": "29AAACF1234A1Z1", "rating": Decimal("4.50")},
        )
        Expense.objects.get_or_create(
            restaurant=restaurant,
            branch=branch,
            category="Electricity",
            amount=Decimal("2450.00"),
            expense_date=timezone.localdate(),
        )
        IntegrationSetting.objects.get_or_create(restaurant=restaurant, branch=branch, provider="cloudflare_r2")
        Printer.objects.get_or_create(restaurant=restaurant, branch=branch, name="Counter 80mm", target="billing")
        self.stdout.write(self.style.SUCCESS("Demo tenant ready: admin@demo.test / Demo@12345"))
