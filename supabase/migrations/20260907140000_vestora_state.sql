create table if not exists public.vestora_app_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  state_key text not null,
  state_value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, state_key)
);

alter table public.vestora_app_state enable row level security;

drop policy if exists "Users can read their own VESTORA state" on public.vestora_app_state;
create policy "Users can read their own VESTORA state"
  on public.vestora_app_state for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write their own VESTORA state" on public.vestora_app_state;
create policy "Users can write their own VESTORA state"
  on public.vestora_app_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
