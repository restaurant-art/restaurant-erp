# UVPRO AWS resource rename

The customer-facing product name is **UVPRO**. Legacy `vestora` identifiers are retained only where changing them in place would break stored data or an active AWS endpoint.

## Completed in place

- Running EC2 instance Name tag: `uvpro-production`
- Stopped EC2 instance Name tag: `uvpro-legacy-stopped`
- ElastiCache description: `UVPRO production Redis`
- Application, manifest, API, admin, worker, documentation, and deployment workflow display names: `UVPRO`
- Public logo asset: `uvpro-mark.png`

## AWS resources that require replacement or a coordinated cutover

| Service | Current identifier | Target identifier | Migration requirement |
| --- | --- | --- | --- |
| ECS | `vestora-prod-cluster` | `uvpro-prod-cluster` | Create a new cluster and services, deploy the same task definitions with UVPRO images/configuration, then drain the old services. |
| ECS | `vestora-prod-api` | `uvpro-prod-api` | Create in the UVPRO cluster, verify health checks, then move traffic. |
| ECS | `vestora-prod-celery` | `uvpro-prod-celery` | Create in the UVPRO cluster and verify jobs before stopping the old worker. |
| ECR | `vestora-prod-backend` | `uvpro-prod-backend` | Create the repository and copy/re-tag all required images. |
| S3 | `vestora-prod-frontend-042396229639-ap-south-1` | `uvpro-prod-frontend-042396229639-ap-south-1` | Create, copy objects and bucket configuration, deploy, then update the origin. |
| S3 | `vestora-prod-media-042396229639-ap-south-1` | `uvpro-prod-media-042396229639-ap-south-1` | Create, copy objects and permissions, update application configuration, and verify uploads/downloads. |
| ALB | `vestora-prod-alb` | `uvpro-prod-alb` | Create a new load balancer and target group, verify HTTPS and health checks, then switch DNS. |
| Target group | `vestora-prod-api-tg` | `uvpro-prod-api-tg` | Register UVPRO service targets and verify them before the DNS cutover. |
| RDS | `vestora-prod-postgres` | `uvpro-prod-postgres` | Coordinate the identifier/endpoint change with ECS secrets and task definitions; a restart and brief interruption are possible. |
| ElastiCache | `vestora-prod-redis` | `uvpro-prod-redis` | Create/restore a replacement cache and update ECS configuration; the replication-group identifier is not renameable in place. |
| ElastiCache subnet group | `vestora-prod-cache-subnets` | `uvpro-prod-cache-subnets` | Create the target group and use it for the replacement cache. |
| Security group | `vestora-prod-redis-sg` | `uvpro-prod-redis-sg` | Create a replacement group and attach it during the cache cutover. |

## Safe cutover order

1. Create the UVPRO ECR repository and copy the current backend images.
2. Create UVPRO S3 buckets, copy data and settings, and verify object access.
3. Prepare the UVPRO database/cache endpoints and update secrets without exposing credentials.
4. Create the UVPRO ECS cluster and services and verify API, worker, database, and cache health.
5. Create the UVPRO ALB and target group, then verify the application through the load-balancer endpoint.
6. Change `uvpro.in` DNS to the UVPRO load balancer.
7. Monitor production, then remove legacy resources only after a separate deletion approval.

Parallel resources temporarily add AWS charges. Do not create the replacement stack until that cost has been approved.

## Legacy application identifiers

Existing database tables, authentication metadata, and browser storage keys still use `vestora` internally. They are data-format identifiers rather than visible branding. Renaming them without a compatibility migration would make existing users, orders, inventory, and settings appear missing. A future data migration must dual-read the legacy keys, write UVPRO keys, validate counts, and only then remove the old identifiers.
