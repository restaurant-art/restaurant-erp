-- Public table ordering stores only the customer order envelope.
-- The customer-facing Edge Function is the only writer; it validates menu
-- prices and table identifiers against the shared ordering state.
create table if not exists public.vestora_public_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  store_id text not null,
  table_id text not null,
  table_name text not null,
  floor text not null default 'Main',
  customer_name text not null default 'Guest',
  customer_note text not null default '',
  guest_count integer not null default 1 check (guest_count > 0),
  items jsonb not null default '[]'::jsonb,
  item_count integer not null default 0 check (item_count >= 0),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  status text not null default 'New',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vestora_public_orders enable row level security;
revoke all on table public.vestora_public_orders from anon, authenticated;
