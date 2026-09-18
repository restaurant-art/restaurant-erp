"""Restore the verified platform administrator after an accidental staff reassignment."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from dotenv import dotenv_values
import psycopg

parser = argparse.ArgumentParser()
parser.add_argument("--email", required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
url = dotenv_values(root / "backend/.env.supabase")["DATABASE_URL"]
if "vqinmequtjkuzrtzkzsk" not in (urlparse(url).username or ""):
    raise SystemExit("Unexpected database project")

with psycopg.connect(url, connect_timeout=15, sslmode="require") as connection:
    with connection.cursor() as cursor:
        cursor.execute("select email from auth.users where lower(email)=lower(%s) for update", (args.email,))
        if not cursor.fetchone():
            raise SystemExit("The requested login does not exist; no changes made")
        cursor.execute("select is_superuser, user_type, is_active from public.core_user where lower(email)=lower(%s)", (args.email,))
        profile = cursor.fetchone()
        if not profile or not profile[0] or profile[1] != "super_admin" or not profile[2]:
            raise SystemExit("The requested login is not an active platform administrator; no changes made")
        assignment = json.dumps({"storeId": "GLOBAL", "role": "super_admin", "appRole": "Super Admin", "active": True})
        cursor.execute("update auth.users set raw_app_meta_data=jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{vestora}', %s::jsonb, true) where lower(email)=lower(%s)", (assignment, args.email))
        cursor.execute("select state_value from public.vestora_shared_app_state where state_key='vestora-users' for update")
        state = cursor.fetchone()
        staff = state[0] if state and isinstance(state[0], list) else []
        cleaned = [entry for entry in staff if str(entry.get("email", "")).lower() != args.email.lower()]
        if len(cleaned) != len(staff):
            cursor.execute("update public.vestora_shared_app_state set state_value=%s::jsonb, updated_at=clock_timestamp() where state_key='vestora-users'", (json.dumps(cleaned),))
        print({"restored_platform_admin": args.email.lower(), "removed_mistaken_staff_records": len(staff) - len(cleaned)})
