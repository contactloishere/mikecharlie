-- Partner Portal setup (Nov 20, 2026). Safe to run again.
-- A "partner" is a hotel, a retail store, or both. They sign up on /partner-portal,
-- save up to 5 shipping addresses, place orders, send payment proof and track production.
--
-- What this file creates:
--   mcc_partners           one row per partner (business name, Hotel and/or Retail, allowed couriers)
--   mcc_partner_addresses  up to 5 saved shipping addresses per partner
--   mcc_partner_orders     partner orders (items, shipping, payment status, production stages, tracking)
--   Telegram alerts for: partner sign-up, partner order, payment proof submitted
--   Row-level security: each partner only ever sees their own rows. Admin and staff see everything.

------------------------------------------------------------------
-- 0. Helper: send a Telegram message through the website's own /api/notify-telegram
--    (the bot token stays in Vercel, never in the database or the repo).
--    Nobody can call this from the browser: it is for the triggers below only.
------------------------------------------------------------------
create or replace function public.mcc_telegram(p_message text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  begin
    perform net.http_post(
      url     := 'https://www.mikecharlieco.com/api/notify-telegram',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := jsonb_build_object('message', p_message)
    );
  exception when others then
    null;   -- an alert problem must never block a sign-up or an order
  end;
end $$;
revoke all on function public.mcc_telegram(text) from public, anon, authenticated;

------------------------------------------------------------------
-- 1. Partners
------------------------------------------------------------------
create table if not exists public.mcc_partners (
  id             uuid primary key references auth.users(id) on delete cascade,
  business_name  text not null,
  contact_name   text,
  contact_number text,
  is_hotel       boolean not null default false,
  is_retail      boolean not null default false,
  couriers       text[]  not null default array['spx','jnt'],   -- set by admin only
  is_active      boolean not null default true,                 -- set by admin only
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint mcc_partners_type_chk check (is_hotel or is_retail),
  constraint mcc_partners_couriers_chk check (couriers <@ array['spx','jnt','lbc'])
);
alter table public.mcc_partners enable row level security;

drop policy if exists "partners read own"   on public.mcc_partners;
drop policy if exists "partners insert own" on public.mcc_partners;
drop policy if exists "partners update own" on public.mcc_partners;
drop policy if exists "partners admin all"  on public.mcc_partners;
create policy "partners read own"   on public.mcc_partners for select using (id = auth.uid());
create policy "partners insert own" on public.mcc_partners for insert
  with check (id = auth.uid() and couriers = array['spx','jnt'] and is_active);
create policy "partners update own" on public.mcc_partners for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy "partners admin all"  on public.mcc_partners for all
  using (public.is_admin_or_staff()) with check (public.is_admin_or_staff());

-- A partner can edit their own details, but not which couriers they get or whether they are active.
create or replace function public.mcc_partners_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null and not public.is_admin_or_staff() then
    if new.id is distinct from old.id
       or new.couriers is distinct from old.couriers
       or new.is_active is distinct from old.is_active then
      raise exception 'Only Mike Charlie Co. can change courier or account status.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists mcc_partners_guard_trg on public.mcc_partners;
create trigger mcc_partners_guard_trg before update on public.mcc_partners
  for each row execute function public.mcc_partners_guard();

------------------------------------------------------------------
-- 2. Saved addresses (5 per partner at most)
------------------------------------------------------------------
create table if not exists public.mcc_partner_addresses (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.mcc_partners(id) on delete cascade,
  label          text,                 -- e.g. "Main property", "Branch 2"
  recipient_name text not null,
  contact_number text,
  address        text not null,
  region_id      text,                 -- matches an id in partials/shipping-rates.js
  region_label   text,
  created_at     timestamptz not null default now()
);
create index if not exists mcc_partner_addresses_partner_idx on public.mcc_partner_addresses(partner_id);
alter table public.mcc_partner_addresses enable row level security;

drop policy if exists "partner addresses own"   on public.mcc_partner_addresses;
drop policy if exists "partner addresses admin" on public.mcc_partner_addresses;
create policy "partner addresses own" on public.mcc_partner_addresses for all
  using (partner_id = auth.uid()) with check (partner_id = auth.uid());
create policy "partner addresses admin" on public.mcc_partner_addresses for all
  using (public.is_admin_or_staff()) with check (public.is_admin_or_staff());

create or replace function public.mcc_partner_address_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (select count(*) from public.mcc_partner_addresses where partner_id = new.partner_id) >= 5 then
    raise exception 'You can save up to 5 addresses. Please delete one first.';
  end if;
  return new;
end $$;
drop trigger if exists mcc_partner_address_limit_trg on public.mcc_partner_addresses;
create trigger mcc_partner_address_limit_trg before insert on public.mcc_partner_addresses
  for each row execute function public.mcc_partner_address_limit();

------------------------------------------------------------------
-- 3. Partner orders
------------------------------------------------------------------
create sequence if not exists public.mcc_partner_order_seq;

create table if not exists public.mcc_partner_orders (
  id              uuid primary key default gen_random_uuid(),
  order_code      text unique,                         -- friendly number like PO-2611-0001 (set by trigger)
  partner_id      uuid not null references public.mcc_partners(id),
  business_name   text,                                -- copied at order time (set by trigger)
  recipient_name  text,
  contact_number  text,
  address         text,
  region_id       text,
  region_label    text,
  items           jsonb not null default '[]'::jsonb,  -- [{name, variant, qty, unit_price, line_total, weight_g}]
  subtotal        numeric not null default 0,
  shipping_fee    numeric not null default 0,
  total           numeric not null default 0,
  total_weight_kg numeric,
  courier         text not null,
  notes           text,
  payment_method  text,
  proof_url       text,
  pay_status      text not null default 'unpaid',
  current_stage   text not null default 'placed',
  stages          jsonb not null default '[]'::jsonb,  -- the timeline for this order, in order
  stage_dates     jsonb not null default '{}'::jsonb,
  tracking        jsonb,
  is_cancelled    boolean not null default false,
  created_at      timestamptz not null default now(),
  constraint mcc_partner_orders_courier_chk check (courier in ('spx','jnt','lbc')),
  constraint mcc_partner_orders_pay_chk check (pay_status in ('unpaid','proof_submitted','paid')),
  constraint mcc_partner_orders_method_chk check (payment_method is null or payment_method in ('gcash','maribank','gotyme','cimb','bdo'))
);
create index if not exists mcc_partner_orders_partner_idx on public.mcc_partner_orders(partner_id, created_at desc);
alter table public.mcc_partner_orders enable row level security;

drop policy if exists "partner orders read own"    on public.mcc_partner_orders;
drop policy if exists "partner orders insert own"  on public.mcc_partner_orders;
drop policy if exists "partner orders admin all"   on public.mcc_partner_orders;
create policy "partner orders read own" on public.mcc_partner_orders for select
  using (partner_id = auth.uid());
-- Partners can place an order. They cannot edit one afterwards (payment proof goes through the function below).
create policy "partner orders insert own" on public.mcc_partner_orders for insert
  with check (partner_id = auth.uid() and pay_status = 'unpaid' and current_stage = 'placed'
              and not is_cancelled and proof_url is null and tracking is null);
create policy "partner orders admin all" on public.mcc_partner_orders for all
  using (public.is_admin_or_staff()) with check (public.is_admin_or_staff());

-- On every new order: stamp the order number and time, copy the business name,
-- and make sure the courier is one that Mike Charlie Co. assigned to this partner.
create or replace function public.mcc_partner_order_before_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare p public.mcc_partners%rowtype;
begin
  select * into p from public.mcc_partners where id = new.partner_id;
  if not found or not p.is_active then
    raise exception 'This partner account is not active.';
  end if;
  if not (new.courier = any (p.couriers)) then
    raise exception 'That courier is not available for your account.';
  end if;
  new.business_name := p.business_name;
  if new.order_code is null then
    new.order_code := 'PO-' || to_char(now() at time zone 'Asia/Manila', 'YYMM') || '-' ||
                      lpad(nextval('public.mcc_partner_order_seq')::text, 4, '0');
  end if;
  new.stage_dates := jsonb_set(coalesce(new.stage_dates, '{}'::jsonb), '{placed}', to_jsonb(now()));
  return new;
end $$;
drop trigger if exists mcc_partner_order_before_insert_trg on public.mcc_partner_orders;
create trigger mcc_partner_order_before_insert_trg before insert on public.mcc_partner_orders
  for each row execute function public.mcc_partner_order_before_insert();

-- A partner sends payment proof through this function (it only allows the partner's own unpaid order).
create or replace function public.mcc_partner_submit_payment(p_order_id uuid, p_method text, p_proof_url text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare o public.mcc_partner_orders%rowtype;
begin
  select * into o from public.mcc_partner_orders where id = p_order_id and partner_id = auth.uid() for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.is_cancelled then raise exception 'This order was cancelled.'; end if;
  if o.pay_status <> 'unpaid' then raise exception 'Payment proof was already sent for this order.'; end if;
  if p_method is null or p_method not in ('gcash','maribank','gotyme','cimb','bdo') then
    raise exception 'Please choose a payment method.';
  end if;
  update public.mcc_partner_orders
     set pay_status     = 'proof_submitted',
         payment_method = p_method,
         proof_url      = p_proof_url,
         stage_dates    = jsonb_set(coalesce(stage_dates, '{}'::jsonb), '{paid}', to_jsonb(now())),
         current_stage  = case when current_stage = 'placed' then 'paid' else current_stage end
   where id = p_order_id;
end $$;
revoke all on function public.mcc_partner_submit_payment(uuid, text, text) from public, anon;
grant execute on function public.mcc_partner_submit_payment(uuid, text, text) to authenticated;

------------------------------------------------------------------
-- 4. Create the partner record when someone signs up from the partner page by email
--    (the page sends account_type = 'partner' with the sign-up). Google sign-ups finish
--    a short "set up your partner account" form on the page instead.
------------------------------------------------------------------
create or replace function public.mcc_create_partner_on_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
        hotel boolean; retail boolean; bname text;
begin
  if coalesce(m->>'account_type', '') <> 'partner' then return new; end if;
  begin
    hotel  := coalesce(m->'partner_types' ? 'hotel', false);
    retail := coalesce(m->'partner_types' ? 'retail', false);
    bname  := nullif(btrim(coalesce(m->>'business_name', '')), '');
    if bname is not null and (hotel or retail) then
      insert into public.mcc_partners (id, business_name, contact_name, contact_number, is_hotel, is_retail)
      values (new.id, bname, nullif(btrim(coalesce(m->>'full_name', '')), ''),
              nullif(btrim(coalesce(m->>'contact_number', '')), ''), hotel, retail)
      on conflict (id) do nothing;
    end if;
  exception when others then
    null;   -- never block someone from signing up
  end;
  return new;
end $$;
drop trigger if exists mcc_create_partner_on_signup_trg on auth.users;
create trigger mcc_create_partner_on_signup_trg after insert on auth.users
  for each row execute function public.mcc_create_partner_on_signup();

------------------------------------------------------------------
-- 5. Telegram alerts + Updates tab entries
------------------------------------------------------------------
create or replace function public.notify_new_partner()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'auth'
as $$
declare em text; kinds text; detail text;
begin
  begin
    select email into em from auth.users where id = new.id;
    kinds  := case when new.is_hotel and new.is_retail then 'Hotel + Retail'
                   when new.is_hotel then 'Hotel' else 'Retail' end;
    detail := concat_ws(' · ', new.business_name, nullif(new.contact_name, ''), em);
    insert into public.notifications (kind, title, body)
      values ('partner_signup', 'Partner sign up (' || kinds || ')', detail);
    perform public.mcc_telegram(E'🤝 Partner sign-up (' || kinds || E')\n' || detail);
  exception when others then
    null;
  end;
  return new;
end $$;
drop trigger if exists notify_new_partner_trg on public.mcc_partners;
create trigger notify_new_partner_trg after insert on public.mcc_partners
  for each row execute function public.notify_new_partner();

create or replace function public.notify_new_partner_order()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare lines text; detail text;
begin
  begin
    select string_agg('- ' || concat_ws(' ', i->>'variant', i->>'name') || ' x' || (i->>'qty'), E'\n')
      into lines from jsonb_array_elements(new.items) i;
    detail := concat_ws(' · ', new.business_name, new.order_code,
                        '₱' || to_char(new.total, 'FM999,999,990.00'), upper(new.courier), new.region_label);
    insert into public.notifications (kind, title, body)
      values ('partner_order', 'New PARTNER order, waiting for payment', detail);
    perform public.mcc_telegram(
      E'📦 New partner order\n' || new.business_name || E'\nOrder: ' || new.order_code || E'\n\n' ||
      coalesce(lines, '') || E'\n\nShipping (' || upper(new.courier) || '): ₱' || to_char(new.shipping_fee, 'FM999,999,990.00') ||
      E'\nTOTAL: ₱' || to_char(new.total, 'FM999,999,990.00') ||
      case when coalesce(new.notes, '') <> '' then E'\nNotes: ' || new.notes else '' end ||
      E'\nPayment: UNPAID');
  exception when others then
    null;
  end;
  return new;
end $$;
drop trigger if exists notify_new_partner_order_trg on public.mcc_partner_orders;
create trigger notify_new_partner_order_trg after insert on public.mcc_partner_orders
  for each row execute function public.notify_new_partner_order();

create or replace function public.notify_partner_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare detail text;
begin
  begin
    detail := concat_ws(' · ', new.business_name, new.order_code,
                        '₱' || to_char(new.total, 'FM999,999,990.00'), 'via ' || upper(coalesce(new.payment_method, '?')));
    insert into public.notifications (kind, title, body)
      values ('partner_payment', 'Partner payment proof submitted, please verify', detail);
    perform public.mcc_telegram(
      E'💳 Partner payment proof received\n' || new.business_name || E'\nOrder: ' || new.order_code ||
      E'\nPaid via: ' || upper(coalesce(new.payment_method, '?')) ||
      E'\nTOTAL TO VERIFY: ₱' || to_char(new.total, 'FM999,999,990.00') ||
      E'\n\nPlease verify and mark it paid in the admin.');
  exception when others then
    null;
  end;
  return new;
end $$;
drop trigger if exists notify_partner_payment_trg on public.mcc_partner_orders;
create trigger notify_partner_payment_trg after update of pay_status on public.mcc_partner_orders
  for each row when (old.pay_status is distinct from new.pay_status and new.pay_status = 'proof_submitted')
  execute function public.notify_partner_payment();

------------------------------------------------------------------
-- 6. Keep the member sign-up alert for members only, and point it at the live website.
--    (Email sign-ups from the partner page carry account_type = 'partner' and get the
--    "Partner sign-up" alert instead. Google sign-ups cannot carry that flag, so a Google
--    partner also triggers one "New member sign up" alert before they finish setup.)
------------------------------------------------------------------
create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare nm text; prov text; detail text;
begin
  begin
    if coalesce(new.raw_user_meta_data->>'account_type', '') = 'partner' then
      return new;   -- partners get their own alert when their partner record is created
    end if;
    nm   := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');
    prov := coalesce(new.raw_app_meta_data->>'provider', 'email');
    detail := concat_ws(' · ', nullif(nm,''), new.email, 'via ' || prov);
    insert into public.notifications (kind, title, body)
      values ('signup', 'New member sign up', detail);
    perform public.mcc_telegram(E'👤 New member sign up\n' || detail);
  exception when others then
    null;   -- a notification problem must NEVER block someone from signing up
  end;
  return new;
end $$;

------------------------------------------------------------------
-- 7. Keep /partner-portal from being used as a product web address
------------------------------------------------------------------
create or replace function public.mcc_unique_slug(t text)
returns text
language plpgsql
as $$
declare
  base text := mcc_slugify(t);
  candidate text;
  n int := 1;
  reserved text[] := array['admin','account','checkout','preloved','hotel-portal','partner-portal',
    'hotel-partner-program','privacy','api','partials','sql','index','robots','sitemap','favicon'];
begin
  if base = '' then base := 'product'; end if;
  if base = any(reserved) then base := base || '-product'; end if;
  candidate := base;
  while exists (select 1 from product_listings where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

------------------------------------------------------------------
-- 8. Lock the alert and guard functions so nobody can call them directly from the browser
--    (the triggers above still work; they do not need this permission to fire)
------------------------------------------------------------------
revoke all on function public.mcc_partners_guard() from public, anon, authenticated;
revoke all on function public.mcc_partner_address_limit() from public, anon, authenticated;
revoke all on function public.mcc_partner_order_before_insert() from public, anon, authenticated;
revoke all on function public.mcc_create_partner_on_signup() from public, anon, authenticated;
revoke all on function public.notify_new_partner() from public, anon, authenticated;
revoke all on function public.notify_new_partner_order() from public, anon, authenticated;
revoke all on function public.notify_partner_payment() from public, anon, authenticated;
revoke all on function public.notify_new_signup() from public, anon, authenticated;
