# Online delivery integrations

UVPRO's Zomato and Swiggy module currently supports branch-scoped outlet configuration, encrypted credential storage, UVPRO menu/add-on/GST/online-stock mappings, KOT routes, an HMAC-signed test simulator, order lifecycle actions, duplicate protection, audit logs, and retry records.

## Local setup

1. Start the local Supabase stack and apply migrations, including `20260922140000_online_delivery_integrations.sql`.
2. Set the frontend development URL to `http://127.0.0.1:54321` (or `http://localhost:54321`) and the local Supabase anon key in `frontend/.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The frontend only permits this local URL in Vite development; production builds remain pinned to UVPRO's project.
3. Generate a fresh 32-byte key for local credential-at-rest encryption and set it as `AGGREGATOR_ENCRYPTION_KEY` in an ignored local Edge Function env file. The function accepts base64 only. Do not commit the key or use a production key in local development.
4. Serve the `vestora-delivery` Edge Function against the local Supabase stack and run the frontend with `pnpm dev`.
5. In UVPRO, open **Settings → Integrations → Zomato** (or **Swiggy**), save a test outlet ID, add a menu mapping, then simulate an order. A QZ Tray connection and matching mapped printer are required for local KOT printing.

## Security and live access

- The browser sends credential JSON directly to the authenticated Edge Function. AES-256-GCM encrypts it with `AGGREGATOR_ENCRYPTION_KEY` before storage. The API returns only a configured/not-configured flag; it never returns ciphertext or plaintext credentials.
- Direct access to integration tables and order RPCs is revoked from `anon` and `authenticated`; service-role access is used only after the Edge Function verifies the UVPRO login, administrator role, and selected branch.
- The simulator uses a one-request ephemeral HMAC-SHA256 secret, checks the body signature and five-minute timestamp window, and routes the signed synthetic order through the transactional database ingest function.
- A unique `(provider, branch, external_order_id)` key and branch transaction lock make duplicate delivery retries idempotent. Stock is reserved only after all mapped lines validate; reject/cancel restores the reservation once.
- Zomato and Swiggy adapter entries are **test-only**. The module does not call real aggregator endpoints or assume their webhook schemas, signing rules, credentials, or status APIs. Live settings stay pending approval; real traffic must remain disabled until UVPRO receives official partner documentation and credentials. External live-status/stock sync retries are recorded as blocked and require the approved provider adapter before they can execute.
- The mapped online stock is the branch's delivery availability quantity. It is separate from UVPRO's physical inventory ledger until an approved stock synchronization contract is defined.

## Tests

Run the adapter, signature, order-state, stock-delta, and retry unit tests from `frontend/`:

```powershell
node --test src/lib/online-delivery.test.js
```

The database idempotency and stock rollback checks are in `supabase/tests/online_delivery.sql` and run with `supabase test db` after the local Supabase migrations are applied.
