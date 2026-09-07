-- Tenant-aware RLS for the existing Django tables. The Edge Function uses
-- the service role after validating the same tenant, while browser clients
-- can safely read/write only their linked restaurant's rows.

create or replace function public.vestora_current_restaurant_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select restaurant_id
  from public.core_user
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function public.vestora_is_superuser()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.core_user
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (is_superuser = true or user_type = 'super_admin')
  )
$$;

revoke all on function public.vestora_current_restaurant_id() from public;
revoke all on function public.vestora_is_superuser() from public;
grant execute on function public.vestora_current_restaurant_id() to authenticated;
grant execute on function public.vestora_is_superuser() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'core_branch', 'core_role', 'core_user', 'core_menucategory',
    'core_menuitem', 'core_table', 'core_customer', 'core_order',
    'core_inventoryitem', 'core_stockmovement', 'core_supplier',
    'core_purchaseorder', 'core_expense', 'core_employeeprofile',
    'core_attendance', 'core_supportticket', 'core_integrationsetting',
    'core_printer'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists vestora_tenant_access on public.%I', table_name);
    execute format(
      'create policy vestora_tenant_access on public.%I for all to authenticated using (public.vestora_is_superuser() or restaurant_id = public.vestora_current_restaurant_id()) with check (public.vestora_is_superuser() or restaurant_id = public.vestora_current_restaurant_id())',
      table_name
    );
  end loop;
end
$$;
