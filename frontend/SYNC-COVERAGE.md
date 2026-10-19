# Shared store data

All saved business state passes through `businessStorage` and the authenticated
AWS endpoint at `/api/cloud/state/`. The registry in `business-state.js` explicitly
defines shared data. New modules must register their keys and use
`useBusinessState`; do not add independent browser-only business caches.

## Coverage

| Area | Shared records / live consumers |
| --- | --- |
| Store administration | Store directory, users, roles; server-verified store assignment |
| Menu / POS | Menu items, categories, modifiers, combinations and other menu setup; live POS catalog and offers |
| Dining / kitchen | Tables, floors, table orders, KDS tickets and statuses |
| Inventory | Materials, stock, categories, movements; dashboard and inventory reports |
| Production | Recipes, categories, batches, wastage, finished goods and food stock |
| Sales / reports | Sales, voids, refunds, cashier shifts, closed-shift history; reports derived from these records |
| Finance | Expenses, ledgers, journals, receipts, bank accounts, vendor payments; live report totals |
| People | Attendance employees/enrollments, logs, settings, leave and payroll inputs |
| Customers | Sales-derived CRM and saved customer edits/deletions |
| Suppliers | Existing purchase-order records and document metadata |
| Settings | Store settings, bill layout and theme preferences |

Hardware printer choices, camera frames, AWS auth sessions and unsaved form/cart
drafts remain device-local. Staff credentials are managed by the AWS-backed Django auth service, not shared JSON.
Users made by the old browser-only account form need to be saved once in Admin
with a password to establish a secure cloud login.

## Save behavior

Writes are queued immediately, with a local working copy retained on failure.
Every mounted business screen subscribes to shared-state changes. Polling runs
every five seconds and when a device regains focus/connectivity. A common status
banner reports pending or failed changes.

The API validates store access for explicit keys, list reads and writes, filters
multi-store ledgers, strips credentials, and preserves other stores' records.
All writes require a version and operation ID. Django checks the version and
claims the operation ID before changing shared state, and records the result in
the same database transaction. A concurrent replay therefore waits for and
returns the original result instead of applying a stock deduction twice.

Disjoint record/field changes merge; conflicting edits to the same business
field remain local and report an error. Stock quantities merge by change amount,
with negative totals rejected. Cross-record business operations (for example a
bill plus several separate production/stock snapshots) are still separate saves,
not one database transaction. This synchronization change does not constitute
an overselling lock across offline cashiers.

## Validation / deployment

- `node --test src/lib/*.test.js`: two-device cases for the complete registry,
  object settings, nested menu setup, offline/reload recovery, stale writes,
  deletion, secrets, store denial and lost responses.
- `python manage.py test apps.core.tests.test_cloud_sync`: API regression cases
  for exact mutation replay, mutation-ID misuse and retrying version conflicts.
- `node scripts/sync-browser-check.cjs`: isolated Chrome sessions against a
  local preview and mocked AWS API; no production test records.
- Apply backend schema changes through Django migrations. Do not run ad hoc SQL
  against production without a backup and a reviewed migration.

Actual production account/device acceptance must be checked with the user's
store logins; automated browser checks use isolated test sessions.
