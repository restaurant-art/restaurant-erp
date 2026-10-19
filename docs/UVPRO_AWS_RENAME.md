# UVPRO AWS resource rename

The customer-facing product name is **UVPRO**. Legacy `vestora` identifiers are retained only where changing them in place would break stored data or an active AWS endpoint.

## Completed in place

- Running EC2 instance Name tag: `uvpro-production`
- Stopped EC2 instance Name tag: `uvpro-legacy-stopped`
- ElastiCache description: `UVPRO production Redis`
- Application, manifest, API, admin, worker, documentation, and deployment workflow display names: `UVPRO`
- Public logo asset: `uvpro-mark.png`

## Legacy resources that require replacement or a coordinated cutover

The target is now the CloudFormation stack in `deploy/aws/cloudformation.yml`.
CloudFormation may generate physical IDs for resources whose names must be
globally unique; use stack outputs and tags instead of assuming a physical ID.

| Service | Current identifier | Target identifier | Migration requirement |
| --- | --- | --- | --- |
| ECS | `vestora-prod-cluster` | `uvpro-prod` | Create the stack, deploy an immutable image, migrate, verify, then drain the old services. |
| ECS | `vestora-prod-api` | `uvpro-prod-web` | Verify `/api/health/` and core transactions before moving traffic. |
| ECS | `vestora-prod-celery` | `uvpro-prod-worker` | Verify a test background job before stopping the old worker. |
| ECR | `vestora-prod-backend` | `uvpro-prod-app` | Push a new immutable image built from the intended release commit. |
| S3 | Legacy frontend bucket | Bundled frontend in the application image | The AWS Docker image contains the Vite build, so a separate public frontend bucket is not required. |
| S3 | Legacy media bucket | Stack `MediaBucketName` output | Copy objects while preserving keys, validate counts and checksums, then verify signed download URLs. |
| ALB | `vestora-prod-alb` | `uvpro-prod-alb` | Create a new load balancer and target group, verify HTTPS and health checks, then switch DNS. |
| Target group | `vestora-prod-api-tg` | `uvpro-prod-api-tg` | Register UVPRO service targets and verify them before the DNS cutover. |
| RDS | `vestora-prod-postgres` | `uvpro-prod-postgres` | Coordinate the identifier/endpoint change with ECS secrets and task definitions; a restart and brief interruption are possible. |
| ElastiCache | `vestora-prod-redis` | `uvpro-prod-redis` | Create/restore a replacement cache and update ECS configuration; the replication-group identifier is not renameable in place. |
| ElastiCache subnet group | `vestora-prod-cache-subnets` | `uvpro-prod-cache-subnets` | Create the target group and use it for the replacement cache. |
| Security group | `vestora-prod-redis-sg` | `uvpro-prod-redis-sg` | Create a replacement group and attach it during the cache cutover. |

## Safe cutover order

1. Deploy the CloudFormation foundation with both ECS service counts at zero.
2. Build and push a UVPRO image, then copy legacy media to the retained private bucket.
3. Migrate or restore PostgreSQL data and validate tenant/branch row counts.
4. Run the dedicated ECS migration task and require exit code zero.
5. Activate ECS web/worker services and verify API, worker, database, cache, and signed media access.
6. Change application DNS to the new load balancer.
7. Monitor production, then remove legacy resources only after a separate deletion approval.

See `docs/AWS_DEPLOYMENT.md` for exact deployment and rollback commands.

Parallel resources temporarily add AWS charges. Do not create the replacement stack until that cost has been approved.

## Legacy application identifiers

Existing database tables, authentication metadata, and browser storage keys still use `vestora` internally. They are data-format identifiers rather than visible branding. Renaming them without a compatibility migration would make existing users, orders, inventory, and settings appear missing. A future data migration must dual-read the legacy keys, write UVPRO keys, validate counts, and only then remove the old identifiers.
