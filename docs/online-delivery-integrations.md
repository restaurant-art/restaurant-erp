# Online delivery integrations

The Zomato/Swiggy integration screens are present, but the current AWS backend does not implement the delivery API yet. Calls to `/api/cloud/delivery/` return HTTP 501. Do not enter live aggregator credentials or rely on the screen for production orders until the AWS integration has been implemented and tested.

## AWS implementation requirements

Implement this feature in the Django API and AWS PostgreSQL. Use branch-scoped access checks, encrypt credentials with AWS KMS/Secrets Manager, make order ingestion transactional and idempotent, and add AWS-backed tests before enabling live traffic.

The JavaScript domain tests validate payload normalization, order-state rules, stock deltas, and simulator signatures. They do not mean the AWS endpoints are live or that Zomato/Swiggy connections have been established.

## Tests

Run the adapter, signature, order-state, stock-delta, and retry unit tests from `frontend/`:

```powershell
node --test src/lib/online-delivery.test.js
```
