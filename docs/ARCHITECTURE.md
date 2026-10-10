# Architecture

VESTORA is an AWS-hosted, shared-database multi-tenant application. Every tenant-owned Django model carries a restaurant and, where relevant, a branch. API querysets and the shared-state gateway enforce that scope.

## Request path

The Application Load Balancer terminates TLS. It routes application pages to the React/Nginx frontend and API, admin, and WebSocket requests to Django on ECS/Fargate. Django reads relational and synchronized browser state from RDS PostgreSQL, uses ElastiCache Redis for Channels and Celery, and stores files in S3.

## Authentication and synchronization

- Django owns staff identities and password hashes.
- Simple JWT issues access and rotating refresh tokens through `/api/auth/`.
- The React cloud adapter calls `/api/cloud/` and keeps the session device-local.
- `CloudState` stores versioned business snapshots in RDS. Conditional writes use a revision and mutation UUID so retries are idempotent and conflicting edits are not silently overwritten.
- QR orders are guest-write-only through a narrow public endpoint; restaurant reads and status changes require an authorized JWT.

## AWS responsibilities

- RDS PostgreSQL: tenants, users, business models, synchronized state, QR orders.
- ElastiCache Redis: WebSockets, Celery broker, and result backend.
- S3: private media and generated files through `django-storages`.
- Secrets Manager: delivery integration credentials and application secrets.
- ECS/Fargate and ECR: runtime and immutable images.
- ALB, ACM, Route 53, and WAF: routing, certificates, DNS, and edge protection.
- CloudWatch and CloudTrail: application logs and control-plane auditing.

No browser receives database credentials, S3 credentials, signing keys, or delivery-provider secrets.
