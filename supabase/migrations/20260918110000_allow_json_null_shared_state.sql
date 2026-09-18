-- JSON null is a valid empty snapshot. Convert SQL null parameters before the
-- NOT NULL shared-state table and idempotency journal see them.
create or replace function public.vestora_write_shared_state(
  p_user_id uuid, p_operation_id uuid, p_key text, p_value jsonb,
  p_request_value jsonb, p_expected timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  old_operation public.vestora_sync_operations;
  current_row public.vestora_shared_app_state;
  saved public.vestora_shared_app_state;
  fingerprint text := md5(p_key || coalesce(p_request_value, 'null'::jsonb)::text || coalesce(p_expected::text, ''));
begin
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
    values(p_key, coalesce(p_value, 'null'::jsonb), greatest(clock_timestamp(), coalesce(p_expected, '-infinity'::timestamptz) + interval '1 millisecond'))
    on conflict(state_key) do update set state_value = excluded.state_value, updated_at = excluded.updated_at
    returning * into saved;
  insert into public.vestora_sync_operations(user_id, operation_id, request_hash, result)
    values(p_user_id, p_operation_id, fingerprint, to_jsonb(saved));
  return to_jsonb(saved);
end;
$$;

revoke all on function public.vestora_write_shared_state(uuid, uuid, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.vestora_write_shared_state(uuid, uuid, text, jsonb, jsonb, timestamptz) to service_role;
