# UVPRO

Production-oriented multi-tenant restaurant ERP and POS platform inspired by Petpooja and Posist workflows.

## Stack

- Frontend: React, Vite, Tailwind CSS, PWA service worker
- Backend: Django, Django REST Framework, Simple JWT, Channels, Celery
- Database/cache: PostgreSQL and Redis
- Storage: private Amazon S3 via IAM task roles and `django-storages`
- Deployment: AWS ECS/Fargate, RDS, ElastiCache, ECR, ALB/WAF, CloudWatch, Docker, and CloudFormation

## Apps

- Super Admin platform control
- Restaurant admin and branch operations
- POS billing with offline queue
- Kitchen Display System
- Table, order, menu, inventory, purchase, CRM, HR, finance, report, notification, subscription, and settings modules

## Quick Start

For the existing Windows local setup with `backend/.venv`, its database, and a
built frontend, run `./start-local.ps1` from PowerShell. It starts the backend
and serves the app together at http://localhost:8000 using the existing data.
Run it again after restarting Windows; it reuses an already-running service.
See [docs/INSTALLATION.md](docs/INSTALLATION.md) for the local demo login.

For a Docker installation:

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

Then open:

- Frontend: http://localhost:5173
- API: http://localhost:8000/api/
- Admin: http://localhost:8000/admin/

Seed demo data:

```bash
docker compose exec backend python manage.py seed_demo
```

Local development does not require an AWS account. Production is AWS-only and
does not depend on Supabase, Cloudflare, or long-lived AWS access keys.

See [docs/INSTALLATION.md](docs/INSTALLATION.md),
[docs/AWS_DEPLOYMENT.md](docs/AWS_DEPLOYMENT.md), and
[docs/API.md](docs/API.md).
