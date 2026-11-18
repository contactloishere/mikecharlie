-- Stock-in dates. Already run in Supabase on Nov 18, 2026 (kept here as a record; safe to run again).
-- 1. The date the stock actually came in (separate from the moment someone typed it in)
alter table public.inventory_transactions
  add column if not exists stock_date date not null default ((now() at time zone 'Asia/Manila')::date);

-- 2. Existing inventory counts as received Nov 1, 2026 (written once; skipped if already there)
insert into public.inventory_transactions (sku_id, txn_type, quantity_change, location, notes, stock_date)
select s.id, 'restock', s.current_stock, s.location,
       'Opening stock (existing inventory, date set to Nov 1, 2026)', date '2026-11-01'
from public.skus s
where s.current_stock > 0
  and not exists (select 1 from public.inventory_transactions t
                  where t.sku_id = s.id and t.notes like 'Opening stock%');

-- 3. One row per item: when stock last came in and how many (for the Inventory tab)
create or replace view public.sku_stock_in_summary
with (security_invoker = true) as
select distinct on (sku_id)
       sku_id, stock_date as last_stock_in, quantity_change as last_qty
from public.inventory_transactions
where quantity_change > 0
order by sku_id, stock_date desc, created_at desc;
