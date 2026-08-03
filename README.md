# VESTORA

Production-oriented multi-tenant restaurant ERP and POS platform inspired by Petpooja and Posist workflows.

## Stack

- Frontend: React, Vite, Tailwind CSS, PWA service worker
- Backend: Django, Django REST Framework, Simple JWT, Channels, Celery
- Database/cache: PostgreSQL and Redis
- Storage: Cloudflare R2 via S3-compatible `django-storages`
- Deployment: Docker, Gunicorn, Nginx, GitHub Actions

## Apps

- Super Admin platform control
- Restaurant admin and branch operations
- POS billing with offline queue
- Kitchen Display System
- Table, order, menu, inventory, purchase, CRM, HR, finance, report, notification, subscription, and settings modules

## Quick Start

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

See [docs/INSTALLATION.md](docs/INSTALLATION.md) and [docs/API.md](docs/API.md).
