-- External consistency patch:
-- - adds persisted carts
-- - adds subscription payment ledger for paid plan activation
-- - hardens order status/payment/payout invariants

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(10,2) not null check (quantity > 0),
  unit text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_buyer_product_unique unique (buyer_id, product_id)
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cart_items' and column_name = 'id'
  ) then
    alter table public.cart_items add column id uuid default gen_random_uuid();
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cart_items' and column_name = 'buyer_id'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'cart_items' and column_name = 'user_id'
    ) then
      alter table public.cart_items rename column user_id to buyer_id;
    else
      alter table public.cart_items add column buyer_id uuid;
    end if;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cart_items' and column_name = 'product_id'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'cart_items' and column_name = 'item_id'
    ) then
      alter table public.cart_items rename column item_id to product_id;
    else
      alter table public.cart_items add column product_id uuid;
    end if;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cart_items' and column_name = 'quantity'
  ) then
    alter table public.cart_items add column quantity numeric(10,2);
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cart_items' and column_name = 'unit'
  ) then
    alter table public.cart_items add column unit text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cart_items' and column_name = 'notes'
  ) then
    alter table public.cart_items add column notes text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cart_items' and column_name = 'created_at'
  ) then
    alter table public.cart_items add column created_at timestamptz default now();
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cart_items' and column_name = 'updated_at'
  ) then
    alter table public.cart_items add column updated_at timestamptz default now();
  end if;

  alter table public.cart_items
    alter column id set default gen_random_uuid(),
    alter column quantity set default 1,
    alter column unit set default 'kg',
    alter column created_at set default now(),
    alter column updated_at set default now();
end $$;

update public.cart_items
set
  buyer_id = case
    when buyer_id is null then null
    when buyer_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then buyer_id::text::uuid
    else null
  end,
  product_id = case
    when product_id is null then null
    when product_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then product_id::text::uuid
    else null
  end,
  quantity = case when quantity is null or quantity <= 0 then 1 else quantity end,
  unit = case when unit is null or btrim(unit) = '' then 'kg' else unit end,
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now())
where true;

delete from public.cart_items
where buyer_id is null or product_id is null;

delete from public.cart_items c
using (
  select ctid
  from (
    select
      ctid,
      row_number() over (
        partition by buyer_id, product_id
        order by updated_at desc nulls last, created_at desc nulls last, id desc nulls last
      ) as rn
    from public.cart_items
  ) ranked
  where ranked.rn > 1
) duplicates
where c.ctid = duplicates.ctid;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cart_items' and column_name = 'id' and udt_name <> 'uuid'
  ) then
    alter table public.cart_items
      alter column id type uuid
      using (
        case
          when id is null then gen_random_uuid()
          when id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then id::text::uuid
          else gen_random_uuid()
        end
      );
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cart_items' and column_name = 'buyer_id' and udt_name <> 'uuid'
  ) then
    alter table public.cart_items
      alter column buyer_id type uuid
      using (
        case
          when buyer_id is null then null
          when buyer_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then buyer_id::text::uuid
          else null
        end
      );
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cart_items' and column_name = 'product_id' and udt_name <> 'uuid'
  ) then
    alter table public.cart_items
      alter column product_id type uuid
      using (
        case
          when product_id is null then null
          when product_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then product_id::text::uuid
          else null
        end
      );
  end if;

  update public.cart_items set id = gen_random_uuid() where id is null;
  alter table public.cart_items alter column id set not null;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cart_items'::regclass
      and contype = 'p'
  ) then
    update public.cart_items set id = gen_random_uuid() where id is null;
    alter table public.cart_items alter column id set not null;
    alter table public.cart_items add constraint cart_items_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cart_items_buyer_id_fkey'
      and conrelid = 'public.cart_items'::regclass
  ) then
    alter table public.cart_items
      add constraint cart_items_buyer_id_fkey
      foreign key (buyer_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cart_items_product_id_fkey'
      and conrelid = 'public.cart_items'::regclass
  ) then
    alter table public.cart_items
      add constraint cart_items_product_id_fkey
      foreign key (product_id) references public.products(id) on delete cascade;
  end if;

  alter table public.cart_items
    alter column buyer_id set not null,
    alter column product_id set not null,
    alter column quantity set not null,
    alter column unit set not null,
    alter column created_at set not null,
    alter column updated_at set not null;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cart_items_quantity_positive_chk'
      and conrelid = 'public.cart_items'::regclass
  ) then
    alter table public.cart_items
      add constraint cart_items_quantity_positive_chk
      check (quantity > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cart_items_buyer_product_unique'
      and conrelid = 'public.cart_items'::regclass
  ) then
    alter table public.cart_items
      add constraint cart_items_buyer_product_unique unique (buyer_id, product_id);
  end if;
end $$;

create index if not exists cart_items_buyer_created_idx
  on public.cart_items (buyer_id, created_at desc);

alter table public.cart_items enable row level security;

drop policy if exists "cart_items_owner_read" on public.cart_items;
drop policy if exists "cart_items_owner_insert" on public.cart_items;
drop policy if exists "cart_items_owner_update" on public.cart_items;
drop policy if exists "cart_items_owner_delete" on public.cart_items;

create policy "cart_items_owner_read"
on public.cart_items
for select
using (buyer_id = auth.uid());

create policy "cart_items_owner_insert"
on public.cart_items
for insert
with check (buyer_id = auth.uid());

create policy "cart_items_owner_update"
on public.cart_items
for update
using (buyer_id = auth.uid())
with check (buyer_id = auth.uid());

create policy "cart_items_owner_delete"
on public.cart_items
for delete
using (buyer_id = auth.uid());

drop trigger if exists cart_items_updated_at on public.cart_items;
create trigger cart_items_updated_at
before update on public.cart_items
for each row execute function public.update_updated_at_column();

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_role public.app_role not null check (plan_role in ('farmer_pro', 'company')),
  amount_kes numeric(12,2) not null check (amount_kes > 0),
  currency text not null default 'KES',
  payment_method text not null default 'mpesa',
  payment_status text not null default 'initiated'
    check (payment_status in ('initiated', 'pending_confirmation', 'paid', 'failed', 'cancelled')),
  merchant_request_id text,
  checkout_request_id text,
  payment_ref text,
  payment_error text,
  paid_at timestamptz,
  plan_started_at timestamptz,
  plan_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscription_payments_checkout_uidx
  on public.subscription_payments (checkout_request_id)
  where checkout_request_id is not null;

create index if not exists subscription_payments_user_created_idx
  on public.subscription_payments (user_id, created_at desc);

alter table public.subscription_payments enable row level security;

drop policy if exists "subscription_payments_owner_read" on public.subscription_payments;
drop policy if exists "subscription_payments_owner_insert" on public.subscription_payments;

create policy "subscription_payments_owner_read"
on public.subscription_payments
for select
using (user_id = auth.uid());

create policy "subscription_payments_owner_insert"
on public.subscription_payments
for insert
with check (user_id = auth.uid());

drop trigger if exists subscription_payments_updated_at on public.subscription_payments;
create trigger subscription_payments_updated_at
before update on public.subscription_payments
for each row execute function public.update_updated_at_column();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_non_negative_amounts_chk'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_non_negative_amounts_chk
      check (quantity > 0 and total_price >= 0 and delivery_fee >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_payment_paid_timestamp_chk'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_payment_paid_timestamp_chk
      check (payment_status <> 'paid' or paid_at is not null);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_payout_release_requires_delivery_chk'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_payout_release_requires_delivery_chk
      check (
        payout_status <> 'released'
        or (payment_status = 'paid' and status = 'delivered')
      );
  end if;
end $$;

create or replace function public.enforce_order_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.quantity <= 0 then
    raise exception 'Order quantity must be greater than 0';
  end if;

  if new.total_price < 0 or new.delivery_fee < 0 then
    raise exception 'Order amounts cannot be negative';
  end if;

  if new.status = 'cancelled' then
    new.payout_status := 'cancelled';
  elsif new.payment_status = 'paid' then
    if new.status = 'delivered' then
      new.payout_status := 'awaiting_official_signoff';
    else
      new.payout_status := 'awaiting_delivery';
    end if;
  else
    new.payout_status := 'pending_payment';
  end if;

  if new.payment_status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
    new.escrow_received_at := coalesce(new.escrow_received_at, new.paid_at);
  else
    if new.payout_status = 'released' then
      raise exception 'Released payouts require paid + delivered orders';
    end if;
  end if;

  if new.payout_status = 'released' then
    if new.payment_status <> 'paid' or new.status <> 'delivered' then
      raise exception 'Released payouts require paid + delivered orders';
    end if;
    new.payout_released_at := coalesce(new.payout_released_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists orders_consistency_guard on public.orders;
create trigger orders_consistency_guard
before insert or update on public.orders
for each row execute function public.enforce_order_consistency();
