# Architecture

UVPRO uses a shared-database multi-tenant architecture. Every tenant-owned model carries `restaurant` and, where relevant, `branch`. Querysets are scoped at the API layer so super admins can operate platform-wide while restaurant and branch users remain isolated.

## Backend

- Django handles domain models, admin, security middleware, and ORM.
- Django REST Framework exposes CRUD APIs and operational endpoints.
- Simple JWT secures API access.
- Django Channels provides session-authenticated WebSocket plumbing with origin
  validation and restaurant authorization. JWT clients use the HTTP sync APIs.
- Celery and Redis provide a worker for explicitly queued jobs. Periodic jobs
  require a scheduler; forecasts and backup jobs are not implemented here.
- A private Amazon S3 bucket stores uploaded files through `django-storages`.
  ECS authorizes requests with an IAM task role, so no static AWS access key is
  present in application configuration.

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
- The AWS Application Load Balancer redirects HTTP to HTTPS and uses an ACM
  certificate. AWS WAF managed rules, Django CSRF/CORS checks, tenant checks,
  provide layered controls.

## Data Isolation

Tenant isolation is implemented in `TenantScopedViewSet`. Additional hardening for very large deployments can move tenants to separate schemas or databases while preserving the same API contract.

## AWS Production Topology

The load balancer is the only public application component. Web and Celery
tasks run in private subnets and connect to private RDS and ElastiCache
endpoints through security-group references. RDS, Redis, and S3 are encrypted;
S3 blocks every form of public access and issues time-limited signed URLs.

The same immutable ECR image supplies the web, worker, and one-off migration
tasks. Database migrations run in a dedicated ECS task before a rolling release,
never in the web container startup command. CloudWatch captures separate web,
worker, and migration logs.

The canonical infrastructure definition and operational procedure are in
`deploy/aws/cloudformation.yml` and `docs/AWS_DEPLOYMENT.md`.
