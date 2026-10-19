# AWS production deployment

UVPRO's production path is AWS-only. The CloudFormation template at
`deploy/aws/cloudformation.yml` provisions:

- two public and two private subnets across two Availability Zones;
- an Application Load Balancer with HTTPS redirect, TLS 1.2/1.3, and AWS WAF;
- private ECS/Fargate web and Celery services;
- private, encrypted RDS PostgreSQL with automated backups;
- private, encrypted ElastiCache Redis;
- a private, versioned S3 media bucket;
- an immutable ECR repository;
- Secrets Manager secrets, CloudWatch logs, and scoped ECS IAM roles.

No AWS access key is injected into the application. ECS uses its task role to
access the stack's media bucket and its restricted database secret. Web and
worker connections use `uvpro_app`, which has data access but no schema-creation
or role-management privileges. Only the migration task can read the RDS-managed
master secret. Database connections fetch the current secret when connecting
and verify the RDS TLS certificate using the trust store in the image.

## Before deployment

You need:

1. An AWS account and an IAM deployment role allowed to manage the resources
   in this template. Do not deploy with the account root user.
2. AWS CLI v2 and Docker, or an AWS CodeBuild project configured to use the
   repository's `buildspec.yml` with privileged Docker mode enabled.
3. A DNS name such as `pos.example.com`.
4. A validated ACM certificate for that name in the same AWS Region as the
   load balancer.
5. A Route 53 public hosted-zone ID if CloudFormation should create the DNS
   alias. DNS can instead be managed outside Route 53.

Use a release-specific image tag, normally the first 12 characters of the Git
commit. Never reuse a tag: the ECR repository intentionally rejects mutable
tags.

The examples use `ap-south-1`, stack `uvpro-prod`, and tag `abc123def456`.
Replace every example value before running it.

## 1. Create the foundation

The first deployment deliberately sets both ECS service counts to zero. This
lets CloudFormation create ECR before an image exists and prevents an
application task from touching the database before migrations succeed.
Keep `PublishDns=false` until the final cutover. Initial creation disables
deletion protection so a failed stack creation can roll back; activation
enables it again.

```bash
aws cloudformation deploy \
  --region ap-south-1 \
  --stack-name uvpro-prod \
  --template-file deploy/aws/cloudformation.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    ApplicationDomain=pos.example.com \
    AcmCertificateArn=arn:aws:acm:ap-south-1:111122223333:certificate/REPLACE_ME \
    HostedZoneId=Z0123456789EXAMPLE \
    PublishDns=false \
    DatabaseDeletionProtection=false \
    AlbDeletionProtection=false \
    ImageTag=abc123def456 \
    MigrationImageTag=abc123def456 \
    DesiredWebCount=0 \
    DesiredWorkerCount=0
```

For a domain hosted elsewhere, omit `HostedZoneId` and create a DNS
ALIAS/ANAME (or CNAME where allowed) to the `LoadBalancerDnsName` stack output
only after verification in step 4.

The production defaults create Multi-AZ RDS, two Redis nodes, WAF, and one NAT
gateway in each Availability Zone. For a non-production sandbox, explicitly set
`DatabaseMultiAZ=false`, `RedisNodeCount=1`, and
`DatabaseDeletionProtection=false` to reduce cost. Do not use those reduced
settings for a production cutover.

## 2. Build and push the image

Read the generated ECR URI and push the exact tag referenced above:

```bash
ECR_URI="$(aws cloudformation describe-stacks \
  --region ap-south-1 \
  --stack-name uvpro-prod \
  --query "Stacks[0].Outputs[?OutputKey=='EcrRepositoryUri'].OutputValue | [0]" \
  --output text)"

aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin "${ECR_URI%%/*}"

docker build --platform linux/amd64 --file deploy/Dockerfile.aws --tag "$ECR_URI:abc123def456" .
docker push "$ECR_URI:abc123def456"
```

CodeBuild can perform the same build with `buildspec.yml`. Set
`ECR_REPOSITORY` to the repository name from the stack and optionally set
`IMAGE_TAG`; otherwise the build uses a source- and build-number-based release
tag. Its
`imageDetail.json` artifact records the exact image URI.

## 3. Run the one-off migration

The image never runs migrations during web or worker startup. Run the
dedicated migration task and require exit code zero before enabling services:

```bash
bash deploy/aws/run-migration.sh uvpro-prod ap-south-1
```

The script obtains private subnet, security group, cluster, and task-definition
values from CloudFormation. It waits for completion and returns a failure if
the migration container fails. Logs are written to the migration log group in
CloudWatch.
The task also provisions the restricted database role and, when configured,
creates the first administrator. Web and worker containers run as a non-root
user and never receive the master database secret.

### Fresh installation: first login

Before running the migration, add `BootstrapAdminEmail=owner@example.com` to
the stack parameters with your actual administrator email. CloudFormation
generates a password in `BootstrapAdministratorSecretArn`. After migration,
retrieve it through the Secrets Manager console, log in, and change it. Do not
paste it in chat, CLI command arguments, or source files. Re-running migration
never resets an existing administrator or promotes an existing ordinary user.
Do not run `seed_demo` against production.

### Existing installation: transfer business data and media

For an existing installation, leave `BootstrapAdminEmail` empty while importing.
First stop writes on the source and wait until every device reports its pending
cloud changes as synchronized. Export from the actual source database, not an
empty development checkout. Run these commands in the source backend environment:

```bash
mkdir -p private-backups
python manage.py transfer_data export private-backups/uvpro.json
python manage.py media_manifest --output private-backups/media.json
```

Record the printed SHA256 in a trusted deployment record. The JSON contains
business data and password hashes. Store and transfer it encrypted, outside
source control and outside the runtime media bucket. `private-backups` is
excluded from Git and Docker images. The export is a point-in-time snapshot
only while source writes are paused.

Use an operator environment inside the VPC (for example a controlled
maintenance task or VPC-connected CodeBuild job) with access to the migration
database secret. Supply the target `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_SECRET_ARN`, `DATABASE_SSL_ROOT_CERT`, S3 bucket and region from stack
outputs. Bring the encrypted snapshot and manifest to that environment, then:

```bash
python manage.py transfer_data import private-backups/uvpro.json --sha256 SOURCE_SHA256
python manage.py provision_runtime_database
python manage.py media_manifest --verify private-backups/media.json
```

Run the schema migration task before import. Import refuses a nonempty target
and rolls back on an error; it preserves IDs, password hashes, relationships,
and shared application state. Cloud storage credentials in old integration
rows are scrubbed. Keep a secured source backup if rollback needs the old
configuration. Source and target must use compatible application schemas.
This tool imports Django exports; a legacy Supabase database needs an explicit
schema mapping/export first. `import_legacy_auth` imports authentication only,
not all business data.

Copy media before verification while preserving every object key. For local
media, an authorized operator can use `aws s3 sync backend/media/ s3://BUCKET/`.
For legacy R2, use a separate source profile to download to a staging directory,
then sync that directory to S3; keep source credentials out of app configuration.
Never use `--delete`. The manifest checks referenced FileField keys, lengths and
SHA256 hashes. Files represented by external URLs inside JSON business state
need a separate URL inventory and migration; they are not covered by FileField
verification. Do not delete the source account or storage before verification.

Compare source and target tenant, user, purchase, stock and sales totals, log in
as an existing user, and verify records from a second device before DNS cutover.

For a high-risk schema migration, take a manual RDS snapshot first and verify
that the migration is backwards-compatible with the currently running image.

## 4. Activate the services

After a successful migration, update the stack with at least two web tasks and
one worker:

```bash
aws cloudformation deploy \
  --region ap-south-1 \
  --stack-name uvpro-prod \
  --template-file deploy/aws/cloudformation.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    ApplicationDomain=pos.example.com \
    AcmCertificateArn=arn:aws:acm:ap-south-1:111122223333:certificate/REPLACE_ME \
    HostedZoneId=Z0123456789EXAMPLE \
    PublishDns=false \
    DatabaseDeletionProtection=true \
    AlbDeletionProtection=true \
    ImageTag=abc123def456 \
    MigrationImageTag=abc123def456 \
    DesiredWebCount=2 \
    DesiredWorkerCount=1
```

Verify all of the following before accepting traffic:

```bash
curl --fail --connect-to pos.example.com:443:LOAD_BALANCER_DNS:443 https://pos.example.com/api/ready/
aws ecs describe-services --region ap-south-1 \
  --cluster uvpro-prod \
  --services uvpro-prod-web uvpro-prod-worker
aws rds describe-db-instances --region ap-south-1
aws elasticache describe-replication-groups --region ap-south-1
```

Also log in with a non-production test account, create a disposable record,
upload and retrieve a test file, confirm a Celery task runs, and inspect ALB,
WAF, ECS, and database metrics.
Replace `LOAD_BALANCER_DNS` with the stack output. This verifies the real
certificate and Host header before DNS changes. `/api/health/` is process
liveness; `/api/ready/` also checks PostgreSQL and is the ALB target check.
After all checks pass, update the stack with `PublishDns=true`, preserving the
other parameters, or switch external DNS. Retain the old environment for the
agreed rollback window.

The common WAF body's size-only rule runs in count mode because synchronized
business state and report requests can exceed the ALB inspection window. Other
managed-rule protections remain blocking. Review sampled requests before
changing this override; application authorization and request-size limits must
still be enforced by Django and the load balancer.

## Later releases

Use two separate image parameters so migrations can finish before the ECS
services roll forward:

1. Build and push a new immutable ECR tag.
2. Update only `MigrationImageTag` to the new tag. Keep `ImageTag` on the
   currently running release.
3. Run `deploy/aws/run-migration.sh` and require exit code zero.
4. Update `ImageTag` to the new tag. ECS performs a circuit-breaker protected
   rolling deployment.
5. Verify health, logs, and core transactions before considering the release
   complete.

Database migrations must be backwards-compatible for a no-downtime rolling
release. For a breaking migration, schedule a maintenance window and scale the
web and worker services to zero before running it.

## Rollback

If containers fail before a deployment stabilizes, the ECS deployment circuit
breaker automatically rolls back to the previous task definition. For a
manual application rollback, set `ImageTag` to the previous immutable tag and
deploy the stack again.

Do not reverse a database migration blindly. Restore is appropriate only when
the business accepts losing data written after the snapshot. Prefer a forward
fix for schema and data migrations. Test RDS point-in-time recovery and S3
version recovery in a separate environment.

## Backups and retention

- RDS keeps 14 days of point-in-time backups by default, is encrypted, and
  takes a final snapshot when replaced or deleted through CloudFormation.
- The S3 media bucket is encrypted, private, versioned, retained on stack
  deletion, and removes noncurrent versions after 90 days.
- Redis keeps seven daily snapshots. Redis is a cache and task transport, not
  the system of record.
- ECR and retained secrets/buckets/snapshots remain billable after stack
  deletion and must be reviewed deliberately.

For disaster recovery, add cross-Region RDS snapshot copy and S3 replication
according to the organization's recovery-point and recovery-time objectives.

## Secret rotation

RDS rotates its managed master password independently of the application.
The custom PostgreSQL backend reads `AWSCURRENT` on each new connection, so it
does not retain a startup-only password. Web and worker tasks cannot read the
master secret. The runtime secret is generated separately; this template does
not enable automatic rotation for that separate database role. To rotate it,
pause application traffic, update its secret, run the migration task (which
updates the database role password), verify readiness, then resume traffic.
For automatic runtime-role rotation, configure and test a Secrets Manager
PostgreSQL rotation function before enabling its schedule. Never copy passwords
into source files, build arguments, logs or CloudFormation parameters.

Rotate the Django application secret only with a planned logout window because
existing signed sessions and tokens may be invalidated. Unlike database
credentials, the Django secret is injected at task startup; force new ECS
deployments after changing it.

## Validation limits and integrations

CI runs backend tests against PostgreSQL, frontend tests/build, CloudFormation
linting and shell syntax checks. Run that pipeline and a staging deployment
before production. A local SQLite test run does not validate live IAM, RDS,
ElastiCache, DNS, certificates or data cutover. Docker and cloud credentials are
required to verify the full deployed image.

The AWS storage/database conversion does not supply third-party delivery
aggregator contracts or QZ signing certificates. The existing delivery and
QZ-signing cloud handlers remain explicitly unavailable until those integrations
are implemented/configured. The Celery worker can execute queued tasks; this
template does not schedule periodic low-stock or subscription jobs.

## Cost controls

The main continuous charges are NAT gateways, ALB, WAF, RDS, Redis, Fargate,
CloudWatch logs, and storage. Multi-AZ database/cache defaults prioritize
availability over cost. Configure AWS Budgets and billing alarms before
activation, review CloudWatch log retention, and tag the stack through your
deployment pipeline for cost allocation.

## Safe teardown

Production resources are intentionally protected. Before deleting a disposable
stack, first update it with `DesiredWebCount=0`, `DesiredWorkerCount=0`,
`AlbDeletionProtection=false`, and `DatabaseDeletionProtection=false`. Export
or snapshot required data. CloudFormation retains S3, ECR, application secrets,
and database snapshots; delete those only after independently verifying that
their data is no longer required.
