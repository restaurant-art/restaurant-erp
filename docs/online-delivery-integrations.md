# Online delivery integrations

Delivery outlet configuration is served by `/api/cloud/delivery` in Django. Non-secret configuration, mappings, test orders, logs, and retry state are stored in RDS. Credential bundles are written to AWS Secrets Manager under:

```text
${AWS_DELIVERY_SECRETS_PREFIX}/{storeId}/{provider}
```

The ECS task role needs `secretsmanager:CreateSecret`, `secretsmanager:PutSecretValue`, and `secretsmanager:DeleteSecret` only for that prefix. Deletes use a seven-day recovery window. Credentials are never returned to the browser or stored in synchronized JSON.

Test mode supports outlet setup, menu mapping, simulated orders, stock toggles, KOT results, and retry workflows. Live mode remains `live_pending_approval` until the restaurant has official provider access and the provider-specific outbound API implementation is approved.

Use separate provider credentials per branch and rotate them in Secrets Manager. CloudTrail should be enabled for secret writes.
