-- Partner Portal, stage 2: server-side pricing, multiple payments per order, revised invoices.
-- Re-runnable. Applied to Supabase as migration "partner_portal_stage2".
--
-- Item shape inside mcc_partner_orders.items (jsonb array):
--   kind 'product'  : { kind, sku_id, qty }                    partner sends this; server fills name/variant/price/weight
--   kind 'assorted' : { kind, product_name, qty }              Lois picks the variants later
--   kind 'custom'   : { kind, name, qty, unit_price }          only Lois can add these (e.g. "Label design fee")
-- Server-filled keys: name, variant, unit_price, line_total, weight_g, wholesale (true when a wholesale tier applied)

------------------------------------------------------------------
-- 1. New columns on orders
------------------------------------------------------------------
alter table public.mcc_partner_orders
  add column if not exists invoice_rev      int     not null default 1,
  add column if not exists amount_paid      numeric not null default 0,
  add column if not exists variants_assigned boolean not null default true,
  add column if not exists stock_deducted   boolean not null default false,
  add column if not exists revision_note    text;

alter table public.mcc_partner_orders drop constraint if exists mcc_partner_orders_pay_chk;
alter table public.mcc_partner_orders add constraint mcc_partner_orders_pay_chk
  check (pay_status in ('unpaid','proof_submitted','partial','paid'));

------------------------------------------------------------------
-- 2. Invoice history (one row per revision) and payments (many per order)
------------------------------------------------------------------
create table if not exists public.mcc_partner_invoices (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.mcc_partner_orders(id) on delete cascade,
  rev          int  not null,
  items        jsonb not null,
  subtotal     numeric not null,
  shipping_fee numeric not null,
  total        numeric not null,
  note         text,
  created_at   timestamptz not null default now(),
  unique (order_id, rev)
);
alter table public.mcc_partner_invoices enable row level security;
drop policy if exists "partner invoices read own" on public.mcc_partner_invoices;
drop policy if exists "partner invoices admin all" on public.mcc_partner_invoices;
create policy "partner invoices read own" on public.mcc_partner_invoices for select
  using (exists (select 1 from public.mcc_partner_orders o where o.id = order_id and o.partner_id = auth.uid()));
create policy "partner invoices admin all" on public.mcc_partner_invoices for all
  using (public.is_admin_or_staff()) with check (public.is_admin_or_staff());

create table if not exists public.mcc_partner_payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.mcc_partner_orders(id) on delete cascade,
  invoice_rev  int  not null,
  amount       numeric not null check (amount > 0),
  method       text not null check (method in ('gcash','maribank','gotyme','cimb','bdo')),
  proof_url    text,
  status       text not null default 'submitted' check (status in ('submitted','verified','rejected')),
  note         text,
  submitted_at timestamptz not null default now(),
  verified_at  timestamptz
);
create index if not exists mcc_partner_payments_order_idx on public.mcc_partner_payments(order_id);
alter table public.mcc_partner_payments enable row level security;
drop policy if exists "partner payments read own" on public.mcc_partner_payments;
drop policy if exists "partner payments admin all" on public.mcc_partner_payments;
create policy "partner payments read own" on public.mcc_partner_payments for select
  using (exists (select 1 from public.mcc_partner_orders o where o.id = order_id and o.partner_id = auth.uid()));
create policy "partner payments admin all" on public.mcc_partner_payments for all
  using (public.is_admin_or_staff()) with check (public.is_admin_or_staff());

------------------------------------------------------------------
-- 3. Helpers
------------------------------------------------------------------
-- Pieces of one product across all lines of an order (a variant filter is used only for variant-specific tiers).
create or replace function public.mcc_partner_pool_qty(p_items jsonb, p_product text, p_variant text)
returns int language sql stable security definer set search_path to 'public' as $$
  select coalesce(sum((i->>'qty')::int), 0)::int
  from jsonb_array_elements(p_items) i
  left join public.skus s on s.id = nullif(i->>'sku_id','')::uuid
  where coalesce(s.product_name, i->>'product_name') = p_product
    and (p_variant is null or s.variant ilike p_variant);
$$;

create or replace function public.mcc_partner_pay_status(p_order uuid, p_total numeric, p_paid numeric)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when p_paid > 0 and p_paid >= p_total then 'paid'
    when exists (select 1 from public.mcc_partner_payments where order_id = p_order and status = 'submitted') then 'proof_submitted'
    when p_paid > 0 then 'partial'
    else 'unpaid' end;
$$;

------------------------------------------------------------------
-- 4. Price, total and invoice computing on every order insert/update
------------------------------------------------------------------
create or replace function public.mcc_partner_order_compute()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  admin boolean := public.is_admin_or_staff();
  it jsonb; out jsonb := '[]'::jsonb;
  s public.skus%rowtype;
  k text; q int; pn text; vr text; w numeric; base numeric; unit numeric; tier numeric;
  wsum numeric := 0;
begin
  if tg_op = 'INSERT' and not admin then
    if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0 then
      raise exception 'Your order is empty.';
    end if;
    for it in select * from jsonb_array_elements(new.items) loop
      k := coalesce(it->>'kind', 'product');
      q := nullif(it->>'qty','')::int;
      if q is null or q < 1 then raise exception 'Invalid quantity.'; end if;
      if k = 'product' then
        select * into s from public.skus where id = nullif(it->>'sku_id','')::uuid and is_active and is_sellable;
        if not found then raise exception 'An item in your order is no longer available.'; end if;
        vr := s.variant;
      elsif k = 'assorted' then
        pn := it->>'product_name';
        select * into s from public.skus where product_name = pn and is_active and is_sellable
          order by retail_price_direct limit 1;
        if not found then raise exception 'An item in your order is no longer available.'; end if;
        vr := null;
      else
        raise exception 'Invalid item in order.';
      end if;
      pn := s.product_name;
      w := coalesce(s.weight_g, 0);
      base := case when s.is_on_sale and s.sale_price is not null then s.sale_price else s.retail_price_direct end;
      -- Tier rows may carry a variant pattern (ILIKE), e.g. '%with Pouch'; pieces are pooled per pattern.
      select t.unit_price into tier from public.mcc_partner_price_tiers t
       where t.product_name = pn
         and (t.variant is null or vr ilike t.variant)
         and public.mcc_partner_pool_qty(new.items, pn, t.variant) >= t.min_qty
       order by t.min_qty desc limit 1;
      unit := coalesce(tier, base);
      out := out || jsonb_build_object(
        'kind', k, 'sku_id', case when k = 'product' then s.id else null end,
        'name', pn, 'variant', vr, 'qty', q, 'unit_price', unit, 'line_total', unit * q,
        'weight_g', w, 'wholesale', tier is not null);
      wsum := wsum + w * q;
    end loop;
    new.items := out;
    new.total_weight_kg := round(wsum / 1000.0, 3);
  elsif tg_op = 'INSERT' and admin then
    -- Lois adding an order for a partner: trust her lines, fill in line totals if missing
    new.items := coalesce((select jsonb_agg(
        case when i ? 'line_total' then i
             else i || jsonb_build_object('line_total', coalesce((i->>'unit_price')::numeric, 0) * coalesce((i->>'qty')::numeric, 1)) end)
      from jsonb_array_elements(new.items) i), '[]'::jsonb);
  end if;

  if tg_op = 'UPDATE' and not admin then
    -- partners never change orders directly (payments go through mcc_partner_submit_payment)
    if new.items is distinct from old.items or new.shipping_fee is distinct from old.shipping_fee
       or new.total is distinct from old.total then
      raise exception 'Please ask Mike Charlie Co. to change an order.';
    end if;
  end if;

  new.subtotal := coalesce((select sum((i->>'line_total')::numeric) from jsonb_array_elements(new.items) i), 0);
  new.shipping_fee := coalesce(new.shipping_fee, 0);
  new.total := new.subtotal + new.shipping_fee;
  new.variants_assigned := not exists (select 1 from jsonb_array_elements(new.items) i where i->>'kind' = 'assorted');

  if tg_op = 'UPDATE' then
    if new.total is distinct from old.total then
      new.invoice_rev := old.invoice_rev + 1;
      new.pay_status := public.mcc_partner_pay_status(new.id, new.total, new.amount_paid);
    end if;
    if new.pay_status = 'paid' and old.pay_status is distinct from 'paid' and new.current_stage = 'placed' then
      new.current_stage := 'paid';
      new.stage_dates := jsonb_set(coalesce(new.stage_dates, '{}'::jsonb), '{paid}', to_jsonb(now()));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists mcc_partner_order_compute_trg on public.mcc_partner_orders;
create trigger mcc_partner_order_compute_trg before insert or update on public.mcc_partner_orders
  for each row execute function public.mcc_partner_order_compute();

-- Keep a snapshot of every invoice (first one at order time, then one per revision)
create or replace function public.mcc_partner_invoice_snapshot()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' or new.invoice_rev is distinct from old.invoice_rev then
    insert into public.mcc_partner_invoices (order_id, rev, items, subtotal, shipping_fee, total, note)
      values (new.id, new.invoice_rev, new.items, new.subtotal, new.shipping_fee, new.total,
              case when tg_op = 'INSERT' then null else new.revision_note end)
      on conflict (order_id, rev) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists mcc_partner_invoice_snapshot_trg on public.mcc_partner_orders;
create trigger mcc_partner_invoice_snapshot_trg after insert or update on public.mcc_partner_orders
  for each row execute function public.mcc_partner_invoice_snapshot();

------------------------------------------------------------------
-- 5. Payments: partner submits proof; Lois verifies; order totals follow
------------------------------------------------------------------
drop function if exists public.mcc_partner_submit_payment(uuid, text, text);
create or replace function public.mcc_partner_submit_payment(p_order_id uuid, p_method text, p_proof_url text default null, p_amount numeric default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare o public.mcc_partner_orders%rowtype; pending numeric; due numeric; amt numeric; pid uuid;
begin
  select * into o from public.mcc_partner_orders where id = p_order_id and partner_id = auth.uid() for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.is_cancelled then raise exception 'This order was cancelled.'; end if;
  if p_method is null or p_method not in ('gcash','maribank','gotyme','cimb','bdo') then
    raise exception 'Please choose a payment method.';
  end if;
  select coalesce(sum(amount), 0) into pending from public.mcc_partner_payments where order_id = o.id and status = 'submitted';
  due := o.total - o.amount_paid - pending;
  if due <= 0 then raise exception 'Nothing more is due on this order.'; end if;
  amt := coalesce(p_amount, due);
  if amt <= 0 or amt > due then raise exception 'Amount must be between 0 and the balance due.'; end if;
  insert into public.mcc_partner_payments (order_id, invoice_rev, amount, method, proof_url)
    values (o.id, o.invoice_rev, amt, p_method, p_proof_url) returning id into pid;
  return pid;
end $$;
revoke all on function public.mcc_partner_submit_payment(uuid, text, text, numeric) from public, anon;
grant execute on function public.mcc_partner_submit_payment(uuid, text, text, numeric) to authenticated;

create or replace function public.mcc_partner_payment_sync()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare paid numeric; o public.mcc_partner_orders%rowtype;
begin
  select * into o from public.mcc_partner_orders where id = new.order_id for update;
  select coalesce(sum(amount), 0) into paid from public.mcc_partner_payments where order_id = new.order_id and status = 'verified';
  update public.mcc_partner_orders
     set amount_paid = paid,
         pay_status = public.mcc_partner_pay_status(new.order_id, o.total, paid)
   where id = new.order_id;
  if new.status = 'verified' and new.verified_at is null then
    update public.mcc_partner_payments set verified_at = now() where id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists mcc_partner_payment_sync_trg on public.mcc_partner_payments;
create trigger mcc_partner_payment_sync_trg after insert or update of status on public.mcc_partner_payments
  for each row execute function public.mcc_partner_payment_sync();

-- Telegram: now fires for every payment proof (the old alert fired once per order)
drop trigger if exists notify_partner_payment_trg on public.mcc_partner_orders;
create or replace function public.notify_partner_payment()
returns trigger language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare o public.mcc_partner_orders%rowtype; detail text;
begin
  begin
    select * into o from public.mcc_partner_orders where id = new.order_id;
    detail := concat_ws(' · ', o.business_name, o.order_code, '₱' || to_char(new.amount, 'FM999,999,990.00'), 'via ' || upper(new.method));
    insert into public.notifications (kind, title, body)
      values ('partner_payment', 'Partner payment proof submitted, please verify', detail);
    perform public.mcc_telegram(
      E'💳 Partner payment proof received\n' || o.business_name || E'\nOrder: ' || o.order_code ||
      E'\nPaid via: ' || upper(new.method) ||
      E'\nAMOUNT TO VERIFY: ₱' || to_char(new.amount, 'FM999,999,990.00') ||
      E'\nInvoice total: ₱' || to_char(o.total, 'FM999,999,990.00') ||
      E'\n\nPlease verify it in the admin.');
  exception when others then
    null;
  end;
  return null;
end $$;
drop trigger if exists notify_partner_payment_trg on public.mcc_partner_payments;
create trigger notify_partner_payment_trg after insert on public.mcc_partner_payments
  for each row execute function public.notify_partner_payment();

------------------------------------------------------------------
-- 6. Lock internal functions away from the browser
------------------------------------------------------------------
revoke all on function public.mcc_partner_order_compute() from public, anon, authenticated;
revoke all on function public.mcc_partner_invoice_snapshot() from public, anon, authenticated;
revoke all on function public.mcc_partner_payment_sync() from public, anon, authenticated;
revoke all on function public.notify_partner_payment() from public, anon, authenticated;
revoke all on function public.mcc_partner_pool_qty(jsonb, text, text) from public, anon;
revoke all on function public.mcc_partner_pay_status(uuid, numeric, numeric) from public, anon;
