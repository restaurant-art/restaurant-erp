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

## Supabase Postgres

The backend can use Supabase as its Postgres database through `DATABASE_URL`.

1. Copy `backend/.env.supabase.example` to `backend/.env.supabase`.
2. In Supabase Dashboard, open your project and click **Connect**.
3. Copy the session pooler connection string, replace `[YOUR-PASSWORD]`, and paste it into `DATABASE_URL`.
4. Run the stack with:

```bash
docker compose --env-file backend/.env.supabase up --build
```

The example is prefilled for project `vqinmequtjkuzrtzkzsk` in Tokyo (`ap-northeast-1`) and sets `DATABASE_SSL_REQUIRE=True`.

## Production Deployment

1. Point Cloudflare DNS to the server.
2. Terminate SSL with Cloudflare Full Strict or a local certificate.
3. Build and run the Docker stack on Oracle Cloud, AWS, or DigitalOcean.
4. Use managed PostgreSQL and Redis for high availability where possible.
5. Run `python manage.py collectstatic` if serving Django static files directly.
6. Run Celery workers and scheduled jobs for backups, reports, subscription expiry, and notifications.

## Operational Hardening

- Rotate JWT signing secret if compromised.
- Enable database backups and object storage lifecycle rules.
- Add Sentry or OpenTelemetry for error reporting.
- Store provider credentials in a secrets manager.
- Use Cloudflare WAF, rate limiting, bot protection, and access logs.
