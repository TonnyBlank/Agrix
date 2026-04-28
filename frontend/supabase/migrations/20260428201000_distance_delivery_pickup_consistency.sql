-- Distance-based delivery + county-office pickup consistency patch
-- - enables item marking in cart
-- - records delivery distance/fee breakdown in orders
-- - enforces county office pickup + escrow-first payment consistency

alter table public.cart_items
add column if not exists selected_for_checkout boolean not null default true;

create index if not exists cart_items_buyer_selected_idx
  on public.cart_items (buyer_id, selected_for_checkout, updated_at desc);

alter table public.orders
add column if not exists delivery_distance_km numeric(10,2);

alter table public.orders
add column if not exists delivery_base_fee numeric(10,2) not null default 50;

alter table public.orders
add column if not exists delivery_rate_per_km numeric(10,2) not null default 2.5;

alter table public.orders
add column if not exists inter_county_surcharge numeric(10,2) not null default 0;

alter table public.orders
add column if not exists delivery_mode text not null default 'county_office_pickup';

alter table public.orders
add column if not exists pickup_county text;

alter table public.orders
add column if not exists pickup_office_label text;

alter table public.orders
add column if not exists delivery_disclaimer text;

alter table public.orders
add column if not exists payment_verification_started_at timestamptz;

alter table public.orders
add column if not exists payment_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_delivery_mode_chk'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_delivery_mode_chk
      check (delivery_mode in ('county_office_pickup'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_delivery_distance_non_negative_chk'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_delivery_distance_non_negative_chk
      check (delivery_distance_km is null or delivery_distance_km >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_delivery_breakdown_non_negative_chk'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_delivery_breakdown_non_negative_chk
      check (delivery_base_fee >= 0 and delivery_rate_per_km >= 0 and inter_county_surcharge >= 0);
  end if;
end $$;

update public.orders o
set
  delivery_base_fee = coalesce(o.delivery_base_fee, 50),
  delivery_rate_per_km = coalesce(o.delivery_rate_per_km, 2.5),
  inter_county_surcharge = coalesce(o.inter_county_surcharge, 0),
  delivery_mode = coalesce(nullif(btrim(o.delivery_mode), ''), 'county_office_pickup'),
  pickup_county = coalesce(
    nullif(btrim(o.pickup_county), ''),
    (
      select nullif(btrim(p.county), '')
      from public.profiles p
      where p.user_id = o.buyer_id
      limit 1
    ),
    (
      select nullif(btrim(p.county), '')
      from public.profiles p
      where p.user_id = o.farmer_id
      limit 1
    )
  ),
  pickup_office_label = coalesce(
    nullif(btrim(o.pickup_office_label), ''),
    case
      when coalesce(
        nullif(btrim(o.pickup_county), ''),
        (
          select nullif(btrim(p.county), '')
          from public.profiles p
          where p.user_id = o.buyer_id
          limit 1
        ),
        (
          select nullif(btrim(p.county), '')
          from public.profiles p
          where p.user_id = o.farmer_id
          limit 1
        )
      ) is not null
      then coalesce(
        nullif(btrim(o.pickup_county), ''),
        (
          select nullif(btrim(p.county), '')
          from public.profiles p
          where p.user_id = o.buyer_id
          limit 1
        ),
        (
          select nullif(btrim(p.county), '')
          from public.profiles p
          where p.user_id = o.farmer_id
          limit 1
        )
      ) || ' AgriLink County Office'
      else null
    end
  ),
  delivery_disclaimer = coalesce(
    nullif(btrim(o.delivery_disclaimer), ''),
    'Delivery will be made through your county AgriLink office. Please claim your produce there after payment and official confirmation.'
  ),
  payment_verified_at = case
    when o.payment_status = 'paid' then coalesce(o.payment_verified_at, o.paid_at, o.escrow_received_at, o.updated_at, o.created_at)
    else o.payment_verified_at
  end
where true;

create or replace function public.place_marketplace_order_v2(
  p_product_id uuid,
  p_quantity numeric,
  p_unit text default null,
  p_delivery_fee numeric default null,
  p_notes text default null,
  p_delivery_distance_km numeric default null,
  p_pickup_county text default null
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_unit text;
  v_subtotal numeric(10,2);
  v_escrow_amount numeric(10,2);
  v_commission_amount numeric(10,2);
  v_seller_payout_amount numeric(10,2);
  v_buyer_county text;
  v_farmer_county text;
  v_same_county boolean := false;
  v_delivery_distance_km numeric(10,2);
  v_delivery_base_fee numeric(10,2) := 50;
  v_delivery_rate_per_km numeric(10,2) := 2.5;
  v_inter_county_surcharge numeric(10,2) := 0;
  v_computed_delivery_fee numeric(10,2);
  v_delivery_fee numeric(10,2);
  v_pickup_county text;
  v_pickup_office_label text;
  v_delivery_disclaimer text := 'Delivery will be made through your county AgriLink office. Please claim your produce there after payment and official confirmation.';
begin
  if v_buyer_id is null then
    raise exception 'You must be signed in to place an order';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than 0';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  if v_product.farmer_id = v_buyer_id then
    raise exception 'You cannot place an order for your own product';
  end if;

  if coalesce(v_product.is_available, false) = false then
    raise exception 'This product is not currently available';
  end if;

  if v_product.stock < p_quantity then
    raise exception 'Only % % available for this product', v_product.stock, v_product.unit;
  end if;

  select nullif(trim(county), '')
  into v_buyer_county
  from public.profiles
  where user_id = v_buyer_id
  limit 1;

  select nullif(trim(county), '')
  into v_farmer_county
  from public.profiles
  where user_id = v_product.farmer_id
  limit 1;

  v_same_county := (
    regexp_replace(lower(coalesce(v_buyer_county, '')), '[^a-z0-9]+', '', 'g') <> ''
    and regexp_replace(lower(coalesce(v_farmer_county, '')), '[^a-z0-9]+', '', 'g') <> ''
    and regexp_replace(lower(coalesce(v_buyer_county, '')), '[^a-z0-9]+', '', 'g')
      = regexp_replace(lower(coalesce(v_farmer_county, '')), '[^a-z0-9]+', '', 'g')
  );

  if p_delivery_distance_km is null then
    v_delivery_distance_km := case when v_same_county then 0 else 60 end;
  else
    v_delivery_distance_km := greatest(round(p_delivery_distance_km::numeric, 2), 0);
  end if;

  if not v_same_county then
    v_delivery_distance_km := greatest(v_delivery_distance_km, 5);
    v_inter_county_surcharge := 75;
  end if;

  v_computed_delivery_fee := round(
    least(
      v_delivery_base_fee
      + v_inter_county_surcharge
      + (v_delivery_distance_km * v_delivery_rate_per_km),
      2500
    ),
    2
  );

  if p_delivery_fee is null then
    v_delivery_fee := v_computed_delivery_fee;
  else
    v_delivery_fee := round(greatest(p_delivery_fee, v_computed_delivery_fee), 2);
  end if;

  if v_delivery_fee < 0 then
    raise exception 'Delivery fee must be 0 or more';
  end if;

  v_unit := coalesce(nullif(trim(p_unit), ''), v_product.unit);
  v_subtotal := round(v_product.price_per_unit * p_quantity, 2);
  v_escrow_amount := round(v_subtotal + v_delivery_fee, 2);
  v_commission_amount := round(v_subtotal * 0.05, 2);
  v_seller_payout_amount := round(greatest(v_subtotal - v_commission_amount, 0), 2);

  v_pickup_county := coalesce(nullif(trim(coalesce(p_pickup_county, '')), ''), v_buyer_county, v_farmer_county);
  if v_pickup_county is not null then
    v_pickup_office_label := v_pickup_county || ' AgriLink County Office';
  end if;

  insert into public.orders (
    product_id,
    buyer_id,
    farmer_id,
    quantity,
    unit,
    total_price,
    delivery_fee,
    delivery_distance_km,
    delivery_base_fee,
    delivery_rate_per_km,
    inter_county_surcharge,
    delivery_mode,
    pickup_county,
    pickup_office_label,
    delivery_disclaimer,
    status,
    payment_method,
    notes,
    escrow_amount,
    agrilink_commission_rate,
    agrilink_commission_amount,
    seller_payout_amount,
    payout_status
  )
  values (
    v_product.id,
    v_buyer_id,
    v_product.farmer_id,
    p_quantity,
    v_unit,
    v_subtotal,
    v_delivery_fee,
    v_delivery_distance_km,
    v_delivery_base_fee,
    v_delivery_rate_per_km,
    v_inter_county_surcharge,
    'county_office_pickup',
    v_pickup_county,
    v_pickup_office_label,
    v_delivery_disclaimer,
    'pending',
    'mpesa',
    nullif(trim(coalesce(p_notes, '')), ''),
    v_escrow_amount,
    0.05,
    v_commission_amount,
    v_seller_payout_amount,
    'pending_payment'
  )
  returning *
  into v_order;

  update public.products
  set
    stock = stock - p_quantity,
    is_available = (stock - p_quantity) > 0,
    updated_at = now()
  where id = v_product.id;

  return next v_order;
end;
$$;

create or replace function public.place_marketplace_order(
  p_product_id uuid,
  p_quantity numeric,
  p_unit text default null,
  p_delivery_fee numeric default 50,
  p_notes text default null
)
returns setof public.orders
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select *
  from public.place_marketplace_order_v2(
    p_product_id => p_product_id,
    p_quantity => p_quantity,
    p_unit => p_unit,
    p_delivery_fee => p_delivery_fee,
    p_notes => p_notes,
    p_delivery_distance_km => null,
    p_pickup_county => null
  );
end;
$$;

grant execute on function public.place_marketplace_order(uuid, numeric, text, numeric, text) to authenticated;
grant execute on function public.place_marketplace_order_v2(uuid, numeric, text, numeric, text, numeric, text) to authenticated;

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

  if new.delivery_distance_km is not null and new.delivery_distance_km < 0 then
    raise exception 'Delivery distance cannot be negative';
  end if;

  new.delivery_base_fee := coalesce(new.delivery_base_fee, 50);
  new.delivery_rate_per_km := coalesce(new.delivery_rate_per_km, 2.5);
  new.inter_county_surcharge := coalesce(new.inter_county_surcharge, 0);

  if new.delivery_mode is null or btrim(new.delivery_mode) = '' then
    new.delivery_mode := 'county_office_pickup';
  end if;

  if new.delivery_mode <> 'county_office_pickup' then
    raise exception 'Only county office pickup delivery mode is supported';
  end if;

  if new.pickup_county is not null and btrim(new.pickup_county) = '' then
    new.pickup_county := null;
  end if;

  if (new.pickup_office_label is null or btrim(new.pickup_office_label) = '') and new.pickup_county is not null then
    new.pickup_office_label := new.pickup_county || ' AgriLink County Office';
  end if;

  if new.delivery_disclaimer is null or btrim(new.delivery_disclaimer) = '' then
    new.delivery_disclaimer := 'Delivery will be made through your county AgriLink office. Please claim your produce there after payment and official confirmation.';
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

  if new.payment_status in ('initiated', 'pending_confirmation') then
    new.payment_verification_started_at := coalesce(new.payment_verification_started_at, now());
  end if;

  if new.payment_status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
    new.escrow_received_at := coalesce(new.escrow_received_at, new.paid_at);
    new.payment_verified_at := coalesce(new.payment_verified_at, new.paid_at);
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

