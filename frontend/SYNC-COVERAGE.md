# Shared store data

All saved business state passes through `businessStorage` and the authenticated
`vestora-api/state` endpoint. The registry in `business-state.js` explicitly
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

Hardware printer choices, camera frames, auth sessions and unsaved form/cart
drafts remain device-local. Staff credentials use Supabase Auth, not shared JSON.
Users made by the old browser-only account form need to be saved once in Admin
with a password to establish a secure cloud login.

## Save behavior

Writes are queued immediately, with a local working copy retained on failure.
Every mounted business screen subscribes to shared-state changes. Polling runs
every five seconds and when a device regains focus/connectivity. A common status
banner reports pending or failed changes.

The API validates store access for explicit keys, list reads and writes, filters
multi-store ledgers, strips credentials, and preserves other stores' records.
All writes require a version and operation ID. A database function checks the
version and records the result in one transaction, so a lost acknowledgement can
be replayed without applying a stock deduction twice.

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
- `node scripts/sync-browser-check.cjs`: isolated Chrome sessions against a
  local preview and mocked cloud; no production test records.
- Parent repo `scripts/apply-cloud-state-security.py --prepare` adds retry support
  without changing existing app permissions. `--verify` exercises the real
  database function in a rolled-back transaction.
- Deploy the API and frontend before `--apply` revokes direct browser access
  to shared snapshots. Existing business records are retained.

Actual production account/device acceptance must be checked with the user's
store logins; automated browser checks use isolated test sessions.
