-- Logistics dispatch workflow + transporter role

alter type public.app_role add value if not exists 'transporter';

alter table public.user_roles
drop constraint if exists user_roles_role_check;

alter table public.user_roles
add constraint user_roles_role_check
check (role::text in ('farmer_free', 'farmer_pro', 'company', 'transporter', 'admin'));

create or replace function public.get_user_role(_user_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select ur.role::public.app_role
  from public.user_roles ur
  where ur.user_id = _user_id
    and ur.role::text in ('admin', 'transporter', 'company', 'farmer_pro', 'farmer_free')
  order by case ur.role::text
    when 'admin' then 1
    when 'transporter' then 2
    when 'company' then 3
    when 'farmer_pro' then 4
    when 'farmer_free' then 5
    else 99
  end
  limit 1
$$;

create table if not exists public.logistics_dispatches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  transporter_id uuid references auth.users(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'assigned', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled')),
  pickup_location text,
  dropoff_location text,
  vehicle_label text,
  driver_phone text,
  pickup_note text,
  delivery_note text,
  delivery_proof_photo_url text,
  pickup_geo_lat numeric(10,7),
  pickup_geo_lng numeric(10,7),
  delivery_geo_lat numeric(10,7),
  delivery_geo_lng numeric(10,7),
  assigned_at timestamptz,
  accepted_at timestamptz,
  pickup_confirmed_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists logistics_dispatches_status_created_idx
  on public.logistics_dispatches (status, created_at desc);

create index if not exists logistics_dispatches_transporter_status_idx
  on public.logistics_dispatches (transporter_id, status, updated_at desc);

create index if not exists logistics_dispatches_order_idx
  on public.logistics_dispatches (order_id);

drop trigger if exists update_logistics_dispatches_updated_at on public.logistics_dispatches;
create trigger update_logistics_dispatches_updated_at
before update on public.logistics_dispatches
for each row execute function public.update_updated_at_column();

alter table public.logistics_dispatches enable row level security;

drop policy if exists "logistics_dispatches_admin_all" on public.logistics_dispatches;
create policy "logistics_dispatches_admin_all"
on public.logistics_dispatches
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "logistics_dispatches_transporter_read" on public.logistics_dispatches;
create policy "logistics_dispatches_transporter_read"
on public.logistics_dispatches
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role::text = 'transporter'
  )
  and (status = 'open' or transporter_id = auth.uid())
);

drop policy if exists "logistics_dispatches_transporter_update" on public.logistics_dispatches;
create policy "logistics_dispatches_transporter_update"
on public.logistics_dispatches
for update
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role::text = 'transporter'
  )
  and (status = 'open' or transporter_id = auth.uid())
)
with check (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role::text = 'transporter'
  )
  and transporter_id = auth.uid()
);
