"""Read-only schema and assignment checks; never prints tokens or user records."""
import argparse
from pathlib import Path
from urllib.parse import urlparse
from dotenv import dotenv_values
import psycopg

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--email", help="Inspect one account's safe login and shared-staff assignment fields.")
parser.add_argument("--inactive", action="store_true", help="List only logins marked inactive in their VESTORA assignment.")
args = parser.parse_args()
url = dotenv_values(root / "backend/.env.supabase")["DATABASE_URL"]
if "vqinmequtjkuzrtzkzsk" not in (urlparse(url).username or ""):
    raise SystemExit("Unexpected database project")
with psycopg.connect(url, connect_timeout=15, sslmode="require") as connection:
    connection.read_only = True
    with connection.cursor() as cursor:
        cursor.execute("select column_name from information_schema.columns where table_schema='public' and table_name='core_user'")
        columns = {row[0] for row in cursor.fetchall()}
        print({"missing_profile_columns": sorted({"id", "email", "restaurant_id", "user_type", "is_superuser", "is_active"} - columns)})
        cursor.execute("select count(*) from (select email from public.core_user group by email having count(*)>1) duplicates")
        print({"duplicate_profile_emails": cursor.fetchone()[0]})
        cursor.execute("select has_table_privilege('service_role','public.vestora_shared_app_state','SELECT')")
        print({"api_can_read_shared_state": cursor.fetchone()[0]})
        cursor.execute("select count(*) from auth.users a where not exists (select 1 from public.core_user c where lower(c.email)=lower(a.email)) and a.raw_app_meta_data->'vestora' is null")
        print({"auth_accounts_without_verified_profile": cursor.fetchone()[0]})
        if args.email:
            cursor.execute("select email, raw_app_meta_data->'vestora' from auth.users where lower(email)=lower(%s)", (args.email,))
            auth_rows = cursor.fetchall()
            cursor.execute("select email, user_type, is_superuser, is_active from public.core_user where lower(email)=lower(%s)", (args.email,))
            profile_rows = cursor.fetchall()
            cursor.execute("select state_value from public.vestora_shared_app_state where state_key='vestora-users'")
            row = cursor.fetchone()
            staff = [item for item in (row[0] if row and isinstance(row[0], list) else []) if str(item.get("email", "")).lower() == args.email.lower()]
            print({"account": {"auth": auth_rows, "core_profile": profile_rows, "shared_staff": staff}})
        if args.inactive:
            cursor.execute("select email, raw_app_meta_data->'vestora' from auth.users where raw_app_meta_data->'vestora'->>'active' = 'false'")
            print({"inactive_assignments": cursor.fetchall()})
