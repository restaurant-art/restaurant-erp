# Installation guide

## Local Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build
docker compose exec backend python manage.py seed_demo
```

Open `http://localhost`. The demo login is `admin@demo.test` / `Demo@12345`.

## AWS production services

Use these managed services in one VPC:

- ECS/Fargate for the backend, frontend, and Celery worker containers.
- RDS PostgreSQL 16 with automated backups and TLS required.
- ElastiCache for Redis with in-transit encryption enabled.
- S3 for private uploads, reports, and media.
- Secrets Manager for `SECRET_KEY`, database credentials, QZ keys, and delivery-provider credentials.
- An Application Load Balancer that routes `/api/*`, `/admin/*`, and `/ws/*` to the backend service and all other paths to the frontend service.
- ACM for TLS and Route 53 for DNS.

The ECS task role should grant only the required S3 object operations and access to the delivery secret prefix. Do not put long-lived AWS keys in the task environment.

## Backend environment

Required production values:

- `SECRET_KEY`
- `DEBUG=False`
- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `DATABASE_URL` using the RDS endpoint
- `DATABASE_SSL_REQUIRE=True`
- `REDIS_URL` using the ElastiCache endpoint
- `AWS_REGION`
- `AWS_STORAGE_BUCKET_NAME`
- `AWS_DELIVERY_SECRETS_PREFIX`
- `QZ_CERTIFICATE` and `QZ_KMS_KEY_ID` when QZ Tray signing is enabled

Set `VITE_API_URL=/api` when building the frontend.

## First deployment

1. Create ECR repositories and push the backend and frontend images.
2. Create the RDS database and ElastiCache replication group in private subnets.
3. Create ECS task definitions named with `backend` and `frontend` containers.
4. Run `python manage.py migrate` as a one-off backend task.
5. Create a superuser with `python manage.py createsuperuser`.
6. Configure the ALB path rules and health checks (`/api/health/` and `/health`).
7. Add the repository variables documented in `.github/workflows/deploy-aws.yml` and configure GitHub OIDC trust on the deployment role.

The deployment workflow assumes the ECS services and task families already exist; it builds immutable images, pushes them to ECR, registers new task revisions, and waits for stable services.

## Operational hardening

- Keep RDS, Redis, and ECS tasks private; expose only the ALB.
- Enable RDS point-in-time recovery, S3 versioning, and lifecycle rules.
- Restrict Secrets Manager resources to the ECS task and deployment roles.
- Enable CloudWatch logs, alarms, AWS WAF, GuardDuty, and CloudTrail.
- Rotate JWT and provider secrets after any suspected compromise.
