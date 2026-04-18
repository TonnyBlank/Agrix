alter table public.orders
add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid', 'initiated', 'pending_confirmation', 'paid', 'failed'));

alter table public.orders
add column if not exists merchant_request_id text;

alter table public.orders
add column if not exists checkout_request_id text;

alter table public.orders
add column if not exists payment_error text;

alter table public.orders
add column if not exists paid_at timestamptz;

create index if not exists orders_checkout_request_id_idx on public.orders(checkout_request_id);

alter table public.orders
add column if not exists escrow_amount numeric(10,2) not null default 0;

alter table public.orders
add column if not exists agrilink_commission_rate numeric(6,4) not null default 0.05;

alter table public.orders
add column if not exists agrilink_commission_amount numeric(10,2) not null default 0;

alter table public.orders
add column if not exists seller_payout_amount numeric(10,2) not null default 0;

alter table public.orders
add column if not exists payout_status text not null default 'pending_payment'
  check (payout_status in ('pending_payment', 'awaiting_delivery', 'awaiting_official_signoff', 'released', 'cancelled'));

alter table public.orders
add column if not exists escrow_received_at timestamptz;

alter table public.orders
add column if not exists official_verified_at timestamptz;

alter table public.orders
add column if not exists official_verified_by uuid references auth.users(id) on delete set null;

alter table public.orders
add column if not exists official_note text;

alter table public.orders
add column if not exists payout_released_at timestamptz;

update public.orders
set
  escrow_amount = round(coalesce(total_price, 0) + coalesce(delivery_fee, 0), 2),
  agrilink_commission_rate = 0.05,
  agrilink_commission_amount = round(coalesce(total_price, 0) * 0.05, 2),
  seller_payout_amount = round(greatest(coalesce(total_price, 0) - (coalesce(total_price, 0) * 0.05), 0), 2),
  payout_status = case
    when status = 'cancelled' then 'cancelled'
    when payment_status = 'paid' and status = 'delivered' then 'awaiting_official_signoff'
    when payment_status = 'paid' then 'awaiting_delivery'
    else 'pending_payment'
  end,
  escrow_received_at = case when payment_status = 'paid' then coalesce(escrow_received_at, paid_at, created_at) else escrow_received_at end
where true;
