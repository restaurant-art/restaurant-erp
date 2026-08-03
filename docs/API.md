# API Guide

Base URL: `/api/`

Interactive schema:

- OpenAPI JSON: `/api/schema/`
- Swagger UI: `/api/docs/`

## Authentication

```http
POST /api/auth/token/
Content-Type: application/json

{
  "username": "admin@demo.test",
  "password": "Demo@12345"
}
```

Use the returned access token:

```http
Authorization: Bearer <access_token>
```

## Tenant Scope

Restaurant users are automatically scoped to their `restaurant`. Super admins can view all tenants. Super admins may pass `X-Restaurant-ID` to operate in a restaurant context.

## Core Resources

- `/api/restaurants/`
- `/api/branches/`
- `/api/roles/`
- `/api/users/`
- `/api/subscription-plans/`
- `/api/subscriptions/`
- `/api/menu-categories/`
- `/api/menu-items/`
- `/api/tables/`
- `/api/customers/`
- `/api/orders/`
- `/api/inventory-items/`
- `/api/stock-movements/`
- `/api/suppliers/`
- `/api/purchase-orders/`
- `/api/expenses/`
- `/api/employees/`
- `/api/attendance/`
- `/api/support-tickets/`
- `/api/announcements/`
- `/api/integrations/`
- `/api/printers/`
- `/api/audit-logs/`
- `/api/report-exports/`

## POS Checkout

```http
POST /api/orders/checkout/
Content-Type: application/json

{
  "branch": 1,
  "bill_number": "BLR-0002",
  "order_type": "dine_in",
  "items": [
    {
      "menu_item": 1,
      "name": "Paneer Tikka Bowl",
      "quantity": "2.00",
      "rate": "249.00",
      "tax_rate": "5.00"
    }
  ],
  "payments": [
    {
      "mode": "upi",
      "amount": "522.90",
      "reference": "UPI123"
    }
  ]
}
```

## Kitchen Status

```http
POST /api/orders/{id}/kds-status/
Content-Type: application/json

{ "status": "ready" }
```

## Dashboards and Reports

- `/api/dashboard/`
- `/api/reports/summary/`

## Real-Time Events

WebSocket URL:

```text
ws://localhost:8000/ws/restaurants/{restaurant_id}/
```

Use this channel for KDS updates, table status changes, notifications, and POS sync events.
