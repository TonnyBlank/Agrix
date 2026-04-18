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
declare
  v_buyer_id uuid := auth.uid();
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_unit text;
  v_subtotal numeric(10,2);
  v_escrow_amount numeric(10,2);
  v_commission_amount numeric(10,2);
  v_seller_payout_amount numeric(10,2);
begin
  if v_buyer_id is null then
    raise exception 'You must be signed in to place an order';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than 0';
  end if;

  if p_delivery_fee is null or p_delivery_fee < 0 then
    raise exception 'Delivery fee must be 0 or more';
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

  v_unit := coalesce(nullif(trim(p_unit), ''), v_product.unit);
  v_subtotal := round(v_product.price_per_unit * p_quantity, 2);
  v_escrow_amount := round(v_subtotal + p_delivery_fee, 2);
  v_commission_amount := round(v_subtotal * 0.05, 2);
  v_seller_payout_amount := round(greatest(v_subtotal - v_commission_amount, 0), 2);

  insert into public.orders (
    product_id,
    buyer_id,
    farmer_id,
    quantity,
    unit,
    total_price,
    delivery_fee,
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
    p_delivery_fee,
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

grant execute on function public.place_marketplace_order(uuid, numeric, text, numeric, text) to authenticated;
