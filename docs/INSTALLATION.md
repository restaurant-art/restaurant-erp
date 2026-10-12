# Installation Guide

## Local Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build
docker compose exec backend python manage.py seed_demo
```

Demo login:

- Username: `admin@demo.test`
- Password: `Demo@12345`

## Backend Environment

Set these values for production:

- `SECRET_KEY`
- `DEBUG=False`
- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `DATABASE_URL`
- `REDIS_URL`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_ENDPOINT_URL`
- `R2_PUBLIC_URL`

Cloudflare R2 is configured through `django-storages` using the S3-compatible API. Uploaded menu images, restaurant logos, employee photos, customer images, bill PDFs, reports, purchase bills, backups, and QR images use the configured storage backend when R2 credentials are present.

## Production Deployment

1. Point the domain to the AWS load balancer.
2. Use the managed PostgreSQL and Redis services configured for the production stack.
3. Deploy the Docker image through the AWS build pipeline.
4. Run `python manage.py collectstatic` if serving Django static files directly.
5. Run Celery workers and scheduled jobs for backups, reports, subscription expiry, and notifications.

## Operational Hardening

- Rotate JWT signing secret if compromised.
- Enable database backups and object storage lifecycle rules.
- Add Sentry or OpenTelemetry for error reporting.
- Store provider credentials in a secrets manager.
- Use Cloudflare WAF, rate limiting, bot protection, and access logs.
