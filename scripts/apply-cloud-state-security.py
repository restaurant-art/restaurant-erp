"""Apply the narrowly scoped shared-state access migration to the verified project."""
import argparse
import json
import uuid
from pathlib import Path
from urllib.parse import urlparse
from dotenv import dotenv_values
import psycopg

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--apply", action="store_true")
parser.add_argument("--prepare", action="store_true", help="Add retry support only; do not change existing application privileges or policies.")
parser.add_argument("--verify", action="store_true")
args = parser.parse_args()
url = dotenv_values(root / "backend/.env.supabase")["DATABASE_URL"]
if "vqinmequtjkuzrtzkzsk" not in (urlparse(url).username or ""):
    raise SystemExit("Database project does not match uvpro.in; no changes made.")
with psycopg.connect(url, connect_timeout=15, sslmode="require") as connection:
    with connection.cursor() as cursor:
        if args.apply:
            cursor.execute((root / "supabase/migrations/20260918070000_scoped_cloud_state.sql").read_text())
        elif args.prepare:
            migration = (root / "supabase/migrations/20260918070000_scoped_cloud_state.sql").read_text()
            cursor.execute(migration[migration.index("-- Retrying after a lost response"):])
        cursor.execute("select has_table_privilege('authenticated', 'public.vestora_shared_app_state', 'SELECT'), has_table_privilege('authenticated', 'public.vestora_shared_app_state', 'UPDATE')")
        read, update = cursor.fetchone()
        print({"direct_browser_read": read, "direct_browser_write": update, "migration_applied": args.apply, "additive_retry_support": args.prepare})
        cursor.execute("select count(*) from public.vestora_shared_app_state")
        print({"shared_records_retained": cursor.fetchone()[0]})
        if args.verify:
            if args.apply or args.prepare:
                raise SystemExit("Run verification separately from migration application.")
            key = "vestora-sync-test-" + str(uuid.uuid4())
            account, operation = uuid.uuid4(), uuid.uuid4()
            def save(value, expected, operation_id):
                cursor.execute("select public.vestora_write_shared_state(%s,%s,%s,%s::jsonb,%s::jsonb,%s::timestamptz)", (account, operation_id, key, json.dumps(value), json.dumps(value), expected))
                return cursor.fetchone()[0]
            first = save([{"id": "test", "stock": 10}], None, operation)
            replay = save([{"id": "test", "stock": 10}], None, operation)
            assert first == replay
            stale = save([], None, uuid.uuid4())
            assert stale.get("conflict") is True
            second = save([{"id": "test", "stock": 8}], first["updated_at"], uuid.uuid4())
            assert second["state_value"][0]["stock"] == 8
            assert save([{"id": "test", "stock": 10}], None, operation) == first
            connection.rollback()
            print({"database_conditional_writes": "passed", "repeat_request": "applied_once", "test_data": "rolled_back"})
