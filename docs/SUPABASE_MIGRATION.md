# Supabase-native migration

The target project is `restaurant-art's Project` (`vqinmequtjkuzrtzkzsk`). Its Postgres database contains the existing Django schema.

The first Edge Function boundary is scaffolded at `supabase/functions/vestora-api`. It currently provides an authenticated database health endpoint at `/health`; business endpoints must be migrated from `backend/apps/core/views.py` before the Django service can be retired.

The frontend client layer reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anon key is intentionally not committed. Add it to the GitHub Pages workflow as an Actions secret before enabling browser-side Supabase calls.

Migration order:

1. Create Supabase Auth users and tenant profiles with RLS policies.
2. Port read-only dashboard and menu endpoints.
3. Port orders, inventory, finance, and attendance mutations.
4. Replace localStorage stores with the migrated API.
5. Deploy the Edge Function and rebuild GitHub Pages.

## Super Admin login

Super Admin credentials are managed by Supabase Auth, not the frontend demo account.

1. Add `VITE_SUPABASE_URL` and either `VITE_SUPABASE_ANON_KEY` or `VITE_SUPABASE_PUBLISHABLE_KEY` to `frontend/.env`.
2. Apply the migrations, including `20260915123000_sync_auth_email.sql`.
3. In Supabase Dashboard, go to **Authentication → Users → Add user** and create `restaurant@vestanoretail.com` as the Super Admin email and set its initial password.
4. Set the user metadata to `role: super_admin`, `appRole: Super Admin`, and `storeId: GLOBAL`.
5. Ensure the matching `core_user` row uses the same email, has `user_type = 'super_admin'`, and `is_superuser = true`.

The Super Admin login email is controlled only in Supabase Auth. Store users cannot change it. To change the password, use **Forgot Super Admin password?** on the login screen; Supabase sends the reset link only to `restaurant@vestanoretail.com`.
