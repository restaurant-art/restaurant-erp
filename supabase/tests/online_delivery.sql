begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(12);

insert into public.vestora_delivery_connections (store_id, provider, outlet_id, mode, status)
values ('TEST-BRANCH-ONLINE-DELIVERY', 'zomato', 'TEST-OUTLET-ONLINE-DELIVERY', 'test', 'test_ready');
insert into public.vestora_delivery_menu_mappings
  (connection_id, provider_item_id, provider_item_name, local_item_id, local_item_name, online_stock, is_available)
select id, 'TEST-ITEM-1', 'Simulator meal', 'LOCAL-ITEM-1', 'UVPRO meal', 10, true
from public.vestora_delivery_connections where outlet_id = 'TEST-OUTLET-ONLINE-DELIVERY';

select extensions.is(
  (public.vestora_delivery_ingest_test_order(
    'zomato', 'TEST-OUTLET-ONLINE-DELIVERY', 'TEST-ORDER-IDEMPOTENCY',
    '{"customer":"Test"}'::jsonb,
    '[{"providerItemId":"TEST-ITEM-1","name":"Simulator meal","quantity":2,"addons":[]}]'::jsonb,
    100
  )->>'duplicate')::boolean,
  false,
  'first signed simulator delivery is inserted'
);
select extensions.is(
  (select online_stock from public.vestora_delivery_menu_mappings where provider_item_id = 'TEST-ITEM-1'),
  8::numeric,
  'new order reserves mapped branch stock once'
);
select extensions.is(
  (public.vestora_delivery_ingest_test_order(
    'zomato', 'TEST-OUTLET-ONLINE-DELIVERY', 'TEST-ORDER-IDEMPOTENCY',
    '{"customer":"Test"}'::jsonb,
    '[{"providerItemId":"TEST-ITEM-1","name":"Simulator meal","quantity":2,"addons":[]}]'::jsonb,
    100
  )->>'duplicate')::boolean,
  true,
  'replayed external order ID is identified as a duplicate'
);
select extensions.is(
  (select online_stock from public.vestora_delivery_menu_mappings where provider_item_id = 'TEST-ITEM-1'),
  8::numeric,
  'duplicate delivery does not deduct stock again'
);
select extensions.is(
  (public.vestora_delivery_change_order(
    (select id from public.vestora_delivery_orders where external_order_id = 'TEST-ORDER-IDEMPOTENCY'),
    'rejected', null, 'Restaurant unavailable'
  )->>'stock_deducted')::boolean,
  false,
  'rejecting a reserved delivery releases its stock reservation'
);
select extensions.is(
  (select online_stock from public.vestora_delivery_menu_mappings where provider_item_id = 'TEST-ITEM-1'),
  10::numeric,
  'rejected order restores branch online stock exactly once'
);

select extensions.is(
  public.vestora_delivery_ingest_test_order(
    'zomato', 'TEST-OUTLET-ONLINE-DELIVERY', 'TEST-ORDER-RETRY',
    '{"customer":"Test"}'::jsonb,
    '[{"providerItemId":"TEST-ITEM-1","name":"Simulator meal","quantity":20,"addons":[]}]'::jsonb,
    1000
  )->>'stockIssue',
  'Simulator meal is out of online stock',
  'insufficient online stock puts the order in review without a partial deduction'
);
select extensions.is(
  (select status from public.vestora_delivery_orders where external_order_id = 'TEST-ORDER-RETRY'),
  'needs_review',
  'failed stock validation retains the unique order for retry'
);
update public.vestora_delivery_menu_mappings set online_stock = 25, is_available = true where provider_item_id = 'TEST-ITEM-1';
select extensions.is(
  (public.vestora_delivery_ingest_test_order(
    'zomato', 'TEST-OUTLET-ONLINE-DELIVERY', 'TEST-ORDER-RETRY',
    '{"customer":"Test","retry":true}'::jsonb,
    '[{"providerItemId":"TEST-ITEM-1","name":"Simulator meal","quantity":20,"addons":[]}]'::jsonb,
    1000
  )->'order'->>'status'),
  'new',
  'retry after correcting online stock reprocesses the same order'
);
select extensions.is(
  (select online_stock from public.vestora_delivery_menu_mappings where provider_item_id = 'TEST-ITEM-1'),
  5::numeric,
  'successful retry reserves stock once'
);
select extensions.is(
  (public.vestora_delivery_ingest_test_order(
    'zomato', 'TEST-OUTLET-ONLINE-DELIVERY', 'TEST-ORDER-RETRY',
    '{"customer":"Test","retry":true}'::jsonb,
    '[{"providerItemId":"TEST-ITEM-1","name":"Simulator meal","quantity":20,"addons":[]}]'::jsonb,
    1000
  )->>'duplicate')::boolean,
  true,
  'replaying a successful retry remains idempotent'
);
select extensions.is(
  (select online_stock from public.vestora_delivery_menu_mappings where provider_item_id = 'TEST-ITEM-1'),
  5::numeric,
  'replaying the successful retry does not deduct stock again'
);

select * from extensions.finish();
rollback;
