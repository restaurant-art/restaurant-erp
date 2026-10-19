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
- `CSRF_TRUSTED_ORIGINS`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `REDIS_URL`
- `AWS_STORAGE_BUCKET_NAME`
- `AWS_S3_REGION_NAME`

In ECS, `SECRET_KEY` and `DB_PASSWORD` are injected from Secrets Manager. The
remaining values come from the task definition. The application uses the ECS
task role for S3; do not set `AWS_ACCESS_KEY_ID` or
`AWS_SECRET_ACCESS_KEY` in production.

Local Docker continues to use `DATABASE_URL`, local Redis, and filesystem
media. AWS split database variables take precedence in the production task.

## Production Deployment

1. Provision the foundation with `deploy/aws/cloudformation.yml` while ECS
   desired counts remain zero.
2. Build and push an immutable image to the stack's ECR repository.
3. Run the dedicated migration task and require exit code zero.
4. Activate at least two web tasks and one Celery worker.
5. Point DNS to the ALB (the template can create the Route 53 alias).
6. Verify the health endpoint, authentication, a database write, an S3 upload,
   and background-task execution.

Follow [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) for exact commands, upgrades,
rollback, backups, and cost controls.

## Operational Hardening

- Rotate JWT signing secret if compromised.
- Enable database backups and object storage lifecycle rules.
- Add Sentry or OpenTelemetry for error reporting.
- Keep credentials in AWS Secrets Manager and use IAM roles for AWS services.
- Review AWS WAF sampled requests before tuning managed rules.
- Configure AWS Budgets, CloudWatch alarms, RDS restore drills, and S3 version
  recovery.
