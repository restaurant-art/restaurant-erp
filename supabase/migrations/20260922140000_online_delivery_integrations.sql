-- Branch-isolated online delivery configuration, test orders, stock mappings,
-- state transitions, retryable operations, and audit logs. Credentials are
-- encrypted by the Edge Function before they reach these tables.
create table if not exists public.vestora_delivery_connections (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  provider text not null check (provider in ('zomato', 'swiggy')),
  outlet_id text not null,
  mode text not null default 'test' check (mode in ('test', 'live')),
  status text not null default 'pending' check (status in ('pending', 'test_ready', 'live_pending_approval', 'error')),
  settings jsonb not null default '{}'::jsonb,
  credentials_ciphertext text,
  credential_key_version text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, store_id),
  unique (provider, outlet_id)
);

create table if not exists public.vestora_delivery_menu_mappings (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.vestora_delivery_connections(id) on delete cascade,
  provider_item_id text not null,
  provider_item_name text not null,
  local_item_id text not null default '',
  local_item_name text not null default '',
  addon_mapping jsonb not null default '{}'::jsonb,
  provider_price numeric(12,2) not null default 0 check (provider_price >= 0),
  gst_rate numeric(5,2) not null default 0 check (gst_rate >= 0 and gst_rate <= 100),
  online_stock numeric(12,3) not null default 0 check (online_stock >= 0),
  is_available boolean not null default true,
  kot_printer text not null default '',
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_item_id)
);

create table if not exists public.vestora_delivery_orders (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.vestora_delivery_connections(id) on delete restrict,
  store_id text not null,
  provider text not null check (provider in ('zomato', 'swiggy')),
  external_order_id text not null,
  customer_label text not null default 'Delivery customer',
  status text not null default 'new' check (status in ('new', 'accepted', 'preparing', 'ready', 'rejected', 'cancelled', 'needs_review')),
  prep_minutes integer check (prep_minutes between 1 and 240),
  currency text not null default 'INR',
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  items jsonb not null default '[]'::jsonb,
  kot_data jsonb not null default '{}'::jsonb,
  stock_deducted boolean not null default false,
  kot_print_status text not null default 'pending' check (kot_print_status in ('pending', 'printed', 'failed', 'not_configured')),
  cancel_reason text,
  raw_test_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, store_id, external_order_id)
);

create table if not exists public.vestora_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  connection_id uuid references public.vestora_delivery_connections(id) on delete set null,
  order_id uuid references public.vestora_delivery_orders(id) on delete set null,
  provider text not null check (provider in ('zomato', 'swiggy')),
  event_type text not null,
  outcome text not null check (outcome in ('success', 'warning', 'error', 'retry')),
  message text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vestora_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  connection_id uuid not null references public.vestora_delivery_connections(id) on delete cascade,
  order_id uuid references public.vestora_delivery_orders(id) on delete cascade,
  provider text not null check (provider in ('zomato', 'swiggy')),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'succeeded', 'retrying', 'blocked')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vestora_delivery_orders_branch_recent_idx on public.vestora_delivery_orders (store_id, received_at desc);
create index if not exists vestora_delivery_logs_branch_recent_idx on public.vestora_delivery_logs (store_id, created_at desc);
create index if not exists vestora_delivery_jobs_due_idx on public.vestora_delivery_jobs (status, next_attempt_at);

alter table public.vestora_delivery_connections enable row level security;
alter table public.vestora_delivery_menu_mappings enable row level security;
alter table public.vestora_delivery_orders enable row level security;
alter table public.vestora_delivery_logs enable row level security;
alter table public.vestora_delivery_jobs enable row level security;
revoke all on public.vestora_delivery_connections, public.vestora_delivery_menu_mappings,
  public.vestora_delivery_orders, public.vestora_delivery_logs, public.vestora_delivery_jobs
  from anon, authenticated;
grant all on public.vestora_delivery_connections, public.vestora_delivery_menu_mappings,
  public.vestora_delivery_orders, public.vestora_delivery_logs, public.vestora_delivery_jobs
  to service_role;

create or replace function public.vestora_delivery_ingest_test_order(
  p_provider text, p_outlet_id text, p_external_order_id text,
  p_payload jsonb, p_items jsonb, p_subtotal numeric
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  connection public.vestora_delivery_connections;
  saved_order public.vestora_delivery_orders;
  line jsonb;
  stock_line record;
  mapping public.vestora_delivery_menu_mappings;
  stock_issue text;
  kot_items jsonb := '[]'::jsonb;
  mapped_item jsonb;
begin
  select * into connection from public.vestora_delivery_connections
    where provider = p_provider and outlet_id = p_outlet_id and mode = 'test';
  if not found then raise exception 'Test-mode outlet configuration was not found'; end if;

  -- Serialize branch stock updates and retries. The unique external ID makes
  -- every delivery order idempotent across concurrent webhook deliveries.
  perform pg_advisory_xact_lock(hashtextextended(connection.store_id, 481516));
  insert into public.vestora_delivery_orders(connection_id, store_id, provider, external_order_id,
    customer_label, currency, subtotal, raw_test_payload, items, status)
    values(connection.id, connection.store_id, p_provider, p_external_order_id,
      coalesce(p_payload->>'customer', 'Test customer'), 'INR', greatest(coalesce(p_subtotal, 0), 0),
      p_payload, p_items, 'new')
    on conflict (provider, store_id, external_order_id) do nothing
    returning * into saved_order;
  if not found then
    select * into saved_order from public.vestora_delivery_orders
      where provider = p_provider and store_id = connection.store_id and external_order_id = p_external_order_id
      for update;
    if saved_order.status <> 'needs_review' or p_payload->>'retry' is distinct from 'true' then
      return jsonb_build_object('duplicate', true, 'order', to_jsonb(saved_order));
    end if;
  end if;

  -- Validate all mapped stock first; deduct only if every line is available.
  for stock_line in
    select value->>'providerItemId' as provider_item_id,
      sum((value->>'quantity')::numeric) as quantity, max(value->>'name') as item_name
    from jsonb_array_elements(p_items) as source(value)
    group by value->>'providerItemId' order by value->>'providerItemId'
  loop
    select * into mapping from public.vestora_delivery_menu_mappings
      where connection_id = connection.id and provider_item_id = stock_line.provider_item_id for update;
    if not found then
      stock_issue := 'No menu mapping for ' || coalesce(stock_line.provider_item_id, 'unknown item');
      exit;
    end if;
    if not mapping.is_available or mapping.online_stock < stock_line.quantity then
      stock_issue := coalesce(mapping.provider_item_name, stock_line.item_name) || ' is out of online stock';
      exit;
    end if;
  end loop;

  if stock_issue is null then
    for line in select value from jsonb_array_elements(p_items) loop
      select * into mapping from public.vestora_delivery_menu_mappings
        where connection_id = connection.id and provider_item_id = line->>'providerItemId';
      mapped_item := line || jsonb_build_object('localItemId', mapping.local_item_id,
      'localItemName', mapping.local_item_name, 'gstRate', mapping.gst_rate,
      'addonMapping', mapping.addon_mapping, 'kotPrinter', mapping.kot_printer,
      'mappedAddons', coalesce((select jsonb_agg(mapping.addon_mapping ->> addon.addon_id)
        from jsonb_array_elements_text(coalesce(line->'addons', '[]'::jsonb)) as addon(addon_id)
        where mapping.addon_mapping ? addon.addon_id), '[]'::jsonb));
    kot_items := kot_items || jsonb_build_array(mapped_item);
    end loop;
  end if;

  if stock_issue is not null then
    update public.vestora_delivery_orders set status = 'needs_review', raw_test_payload = p_payload,
      kot_data = jsonb_build_object('items', kot_items), updated_at = now()
      where id = saved_order.id returning * into saved_order;
    insert into public.vestora_delivery_logs(store_id, connection_id, order_id, provider, event_type, outcome, message, detail)
      values(connection.store_id, connection.id, saved_order.id, p_provider, 'order_ingest', 'error', stock_issue,
        jsonb_build_object('externalOrderId', p_external_order_id));
    return jsonb_build_object('duplicate', false, 'stockIssue', stock_issue, 'order', to_jsonb(saved_order));
  end if;

  for line in select value from jsonb_array_elements(p_items) loop
    update public.vestora_delivery_menu_mappings set online_stock = online_stock - (line->>'quantity')::numeric,
      is_available = (online_stock - (line->>'quantity')::numeric) > 0, updated_at = now()
      where connection_id = connection.id and provider_item_id = line->>'providerItemId';
  end loop;
  update public.vestora_delivery_orders set items = kot_items, raw_test_payload = p_payload,
    status = 'new', kot_data = jsonb_build_object('items', kot_items), stock_deducted = true, updated_at = now()
    where id = saved_order.id returning * into saved_order;
  insert into public.vestora_delivery_logs(store_id, connection_id, order_id, provider, event_type, outcome, message, detail)
    values(connection.store_id, connection.id, saved_order.id, p_provider, 'order_ingest', 'success', 'Signed test order accepted; mapped stock reserved once',
      jsonb_build_object('externalOrderId', p_external_order_id));
  return jsonb_build_object('duplicate', false, 'order', to_jsonb(saved_order));
end;
$$;

create or replace function public.vestora_delivery_change_order(
  p_order_id uuid, p_status text, p_prep_minutes integer default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  delivery_order public.vestora_delivery_orders;
  line jsonb;
begin
  select * into delivery_order from public.vestora_delivery_orders where id = p_order_id for update;
  if not found then raise exception 'Delivery order was not found'; end if;
  if not (
    (delivery_order.status in ('new','needs_review') and p_status in ('accepted','rejected','cancelled')) or
    (delivery_order.status = 'accepted' and p_status in ('preparing','ready','cancelled')) or
    (delivery_order.status = 'preparing' and p_status in ('ready','cancelled')) or
    (delivery_order.status = 'ready' and p_status = 'cancelled')
  ) then raise exception 'Invalid delivery order status transition'; end if;
  if p_status = 'cancelled' and length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Enter a cancellation reason'; end if;
  if p_prep_minutes is not null and p_prep_minutes not between 1 and 240 then raise exception 'Preparation time must be between 1 and 240 minutes'; end if;

  if p_status in ('cancelled', 'rejected') and delivery_order.stock_deducted then
    for line in select value from jsonb_array_elements(delivery_order.items) loop
      update public.vestora_delivery_menu_mappings set online_stock = online_stock + (line->>'quantity')::numeric,
        is_available = true, updated_at = now()
        where connection_id = delivery_order.connection_id and provider_item_id = line->>'providerItemId';
    end loop;
  end if;
  update public.vestora_delivery_orders set status = p_status,
    prep_minutes = coalesce(p_prep_minutes, prep_minutes), cancel_reason = case when p_status = 'cancelled' then p_reason else cancel_reason end,
    stock_deducted = case when p_status in ('cancelled', 'rejected') then false else stock_deducted end,
    updated_at = now() where id = p_order_id returning * into delivery_order;
  insert into public.vestora_delivery_logs(store_id, connection_id, order_id, provider, event_type, outcome, message, detail)
    values(delivery_order.store_id, delivery_order.connection_id, delivery_order.id, delivery_order.provider,
      'order_status', 'success', 'Order status changed to ' || p_status, jsonb_build_object('prepMinutes', p_prep_minutes, 'reason', p_reason));
  return to_jsonb(delivery_order);
end;
$$;

revoke all on function public.vestora_delivery_ingest_test_order(text,text,text,jsonb,jsonb,numeric) from public, anon, authenticated;
revoke all on function public.vestora_delivery_change_order(uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.vestora_delivery_ingest_test_order(text,text,text,jsonb,jsonb,numeric) to service_role;
grant execute on function public.vestora_delivery_change_order(uuid,text,integer,text) to service_role;
