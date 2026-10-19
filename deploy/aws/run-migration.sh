#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 STACK_NAME [AWS_REGION]" >&2
  exit 64
fi

STACK_NAME="$1"
AWS_REGION="${2:-${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-south-1}}}"

stack_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" \
    --output text
}

CLUSTER_NAME="$(stack_output ClusterName)"
TASK_DEFINITION="$(stack_output MigrationTaskDefinitionArn)"
PRIVATE_SUBNETS="$(stack_output PrivateSubnetIds)"
SECURITY_GROUP="$(stack_output AppSecurityGroupId)"
MIGRATION_LOG_GROUP="$(stack_output MigrationLogGroupName)"

if [[ -z "$CLUSTER_NAME" || "$CLUSTER_NAME" == "None" ]]; then
  echo "Stack outputs are unavailable for $STACK_NAME." >&2
  exit 1
fi

NETWORK_CONFIGURATION="awsvpcConfiguration={subnets=[$PRIVATE_SUBNETS],securityGroups=[$SECURITY_GROUP],assignPublicIp=DISABLED}"

TASK_ARN="$(aws ecs run-task \
  --cluster "$CLUSTER_NAME" \
  --task-definition "$TASK_DEFINITION" \
  --launch-type FARGATE \
  --network-configuration "$NETWORK_CONFIGURATION" \
  --region "$AWS_REGION" \
  --query 'tasks[0].taskArn' \
  --output text)"

if [[ -z "$TASK_ARN" || "$TASK_ARN" == "None" ]]; then
  echo "ECS did not start the migration task. Inspect ECS events and task-placement failures." >&2
  exit 1
fi

echo "Waiting for migration task $TASK_ARN"
aws ecs wait tasks-stopped \
  --cluster "$CLUSTER_NAME" \
  --tasks "$TASK_ARN" \
  --region "$AWS_REGION"

EXIT_CODE="$(aws ecs describe-tasks \
  --cluster "$CLUSTER_NAME" \
  --tasks "$TASK_ARN" \
  --region "$AWS_REGION" \
  --query 'tasks[0].containers[?name==`migration`].exitCode | [0]' \
  --output text)"

if [[ "$EXIT_CODE" != "0" ]]; then
  STOPPED_REASON="$(aws ecs describe-tasks \
    --cluster "$CLUSTER_NAME" \
    --tasks "$TASK_ARN" \
    --region "$AWS_REGION" \
    --query 'tasks[0].stoppedReason' \
    --output text)"
  echo "Migration failed (exit code: $EXIT_CODE). $STOPPED_REASON" >&2
  echo "Inspect $MIGRATION_LOG_GROUP in CloudWatch Logs." >&2
  exit 1
fi

echo "Migration completed successfully."
