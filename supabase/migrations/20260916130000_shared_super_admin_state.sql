-- The Super Admin store directory is platform data, not device-local data.
-- Keep it in one shared record so every Super Admin sees the same restaurants
-- and branches regardless of where they sign in.
create table if not exists public.vestora_shared_app_state (
  state_key text primary key,
  state_value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.vestora_shared_app_state enable row level security;

revoke all on table public.vestora_shared_app_state from anon, authenticated;

grant select, insert, update, delete on table public.vestora_shared_app_state to authenticated;

drop policy if exists "Authenticated users can read shared VESTORA state" on public.vestora_shared_app_state;
create policy "Authenticated users can read shared VESTORA state"
  on public.vestora_shared_app_state for select
  to authenticated
  using (true);

drop policy if exists "Super admins manage shared VESTORA state" on public.vestora_shared_app_state;
create policy "Super admins manage shared VESTORA state"
  on public.vestora_shared_app_state for all
  to authenticated
  using (public.vestora_is_superuser())
  with check (public.vestora_is_superuser());

-- Preserve the latest existing directory when upgrading from user-scoped state.
insert into public.vestora_shared_app_state (state_key, state_value, updated_at)
select state_key, state_value, updated_at
from public.vestora_app_state
where state_key = 'vestora-stores'
order by updated_at desc
limit 1
on conflict (state_key) do update
set state_value = excluded.state_value,
    updated_at = excluded.updated_at
where public.vestora_shared_app_state.updated_at < excluded.updated_at;
