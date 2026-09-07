-- ============================================================
-- AgriLink X — Marketplace Constraints & Atomic Restock RPC
-- ============================================================
-- Adds missing DB-level safety constraints and an atomic
-- stock increment function used by the backend on restocks.
-- ============================================================

-- 1. cart_items: quantity must always be positive
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cart_items_quantity_positive'
      and conrelid = 'public.cart_items'::regclass
  ) then
    alter table public.cart_items
      add constraint cart_items_quantity_positive check (quantity > 0);
  end if;
end $$;

-- 2. cart_items: one entry per buyer+product (upsert semantics enforced at DB)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cart_items_buyer_product_unique'
      and conrelid = 'public.cart_items'::regclass
  ) then
    alter table public.cart_items
      add constraint cart_items_buyer_product_unique unique (buyer_id, product_id);
  end if;
end $$;

-- 3. products: stock cannot go below zero
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_stock_non_negative'
      and conrelid = 'public.products'::regclass
  ) then
    -- Clamp any existing negative values first to avoid constraint failure
    update public.products set stock = 0 where stock < 0;
    alter table public.products
      add constraint products_stock_non_negative check (stock >= 0);
  end if;
end $$;

-- 4. Atomic stock increment function (used by backend for restocks)
-- Using stock + p_quantity ensures no TOCTOU race between read and write.
create or replace function public.increment_product_stock(
  p_product_id uuid,
  p_quantity numeric
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.products
  set
    stock        = stock + p_quantity,
    is_available = (stock + p_quantity) > 0,
    updated_at   = now()
  where id = p_product_id;
$$;

grant execute on function public.increment_product_stock(uuid, numeric) to service_role;
