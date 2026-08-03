# Architecture

VESTORA uses a shared-database multi-tenant architecture. Every tenant-owned model carries `restaurant` and, where relevant, `branch`. Querysets are scoped at the API layer so super admins can operate platform-wide while restaurant and branch users remain isolated.

## Backend

- Django handles domain models, admin, security middleware, and ORM.
- Django REST Framework exposes CRUD APIs and operational endpoints.
- Simple JWT secures API access.
- Django Channels provides WebSocket plumbing for KDS, table, and POS events.
- Celery and Redis run background jobs for report exports, subscription expiry, notifications, forecasts, and backups.
- Cloudflare R2 stores uploaded files through S3-compatible `django-storages`.

## Frontend

- React and Tailwind provide a responsive SaaS dashboard and touch POS.
- The PWA service worker caches the app shell.
- Offline POS orders are queued in `localStorage` and sync when connectivity returns.
- Screens are organized by operational workflows: dashboard, POS, KDS, tables, menu, inventory, CRM, HR, finance, reports, super admin, and settings.

## Security

- Passwords are hashed by Django.
- JWT access and refresh tokens protect APIs.
- Role permissions are editable per tenant.
- Audit logs capture actor, action, entity, and before/after payloads.
- HTTPS, Cloudflare WAF, CSRF, CORS, and rate limiting should be enforced in production.

## Data Isolation

Tenant isolation is implemented in `TenantScopedViewSet`. Additional hardening for very large deployments can move tenants to separate schemas or databases while preserving the same API contract.
