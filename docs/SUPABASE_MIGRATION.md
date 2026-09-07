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
