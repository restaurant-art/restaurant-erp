-- Shared JSON snapshots are served through the authenticated API, which checks
-- the user's store and removes credentials. Direct browser access would bypass
-- those checks. This migration changes privileges only; no records are removed.
revoke all on table public.vestora_shared_app_state from anon, authenticated;
drop policy if exists "Authenticated users can read shared VESTORA state" on public.vestora_shared_app_state;
drop policy if exists "Super admins manage shared VESTORA state" on public.vestora_shared_app_state;

-- Retrying after a lost response must not apply a stock deduction twice.
create table if not exists public.vestora_sync_operations (
  user_id uuid not null,
  operation_id uuid not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
alter table public.vestora_sync_operations enable row level security;
revoke all on table public.vestora_sync_operations from anon, authenticated;

create or replace function public.vestora_write_shared_state(
  p_user_id uuid, p_operation_id uuid, p_key text, p_value jsonb,
  p_request_value jsonb, p_expected timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  old_operation public.vestora_sync_operations;
  current_row public.vestora_shared_app_state;
  saved public.vestora_shared_app_state;
  fingerprint text := md5(p_key || p_request_value::text || coalesce(p_expected::text, ''));
begin
  -- Serialize writes to one key, including first inserts and repeat requests.
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));
  select * into old_operation from public.vestora_sync_operations
    where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    if old_operation.request_hash <> fingerprint then
      return jsonb_build_object('conflict', true);
    end if;
    return old_operation.result;
  end if;
  select * into current_row from public.vestora_shared_app_state where state_key = p_key;
  if (found and current_row.updated_at is distinct from p_expected)
     or (not found and p_expected is not null) then
    return jsonb_build_object('conflict', true);
  end if;
  insert into public.vestora_shared_app_state(state_key, state_value, updated_at)
    values(p_key, p_value, greatest(clock_timestamp(), coalesce(p_expected, '-infinity'::timestamptz) + interval '1 millisecond'))
    on conflict(state_key) do update set state_value = excluded.state_value, updated_at = excluded.updated_at
    returning * into saved;
  insert into public.vestora_sync_operations(user_id, operation_id, request_hash, result)
    values(p_user_id, p_operation_id, fingerprint, to_jsonb(saved));
  return to_jsonb(saved);
end;
$$;
revoke all on function public.vestora_write_shared_state(uuid, uuid, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.vestora_write_shared_state(uuid, uuid, text, jsonb, jsonb, timestamptz) to service_role;
