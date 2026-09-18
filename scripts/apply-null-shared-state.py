"""Apply and verify the JSON-null shared-state function repair."""
import argparse
import json
import uuid
from pathlib import Path
from urllib.parse import urlparse
from dotenv import dotenv_values
import psycopg

parser = argparse.ArgumentParser()
parser.add_argument("--apply", action="store_true")
parser.add_argument("--verify", action="store_true")
args = parser.parse_args()
if not args.apply and not args.verify:
    raise SystemExit("Use --apply or --verify")
root = Path(__file__).resolve().parents[1]
url = dotenv_values(root / "backend/.env.supabase")["DATABASE_URL"]
if "vqinmequtjkuzrtzkzsk" not in (urlparse(url).username or ""):
    raise SystemExit("Unexpected database project")
with psycopg.connect(url, connect_timeout=15, sslmode="require") as connection:
    with connection.cursor() as cursor:
        if args.apply:
            cursor.execute((root / "supabase/migrations/20260918110000_allow_json_null_shared_state.sql").read_text())
            print({"json_null_shared_state_repair": "applied"})
        if args.verify:
            key = "vestora-null-state-test-" + str(uuid.uuid4())
            cursor.execute("select public.vestora_write_shared_state(%s,%s,%s,%s::jsonb,%s::jsonb,%s::timestamptz)", (uuid.uuid4(), uuid.uuid4(), key, None, None, None))
            result = cursor.fetchone()[0]
            assert result["state_value"] is None
            cursor.execute("select state_value is null, state_value = 'null'::jsonb from public.vestora_shared_app_state where state_key=%s", (key,))
            sql_null, json_null = cursor.fetchone()
            assert not sql_null and json_null
            connection.rollback()
            print({"json_null_shared_state_write": "passed", "test_data": "rolled_back"})
