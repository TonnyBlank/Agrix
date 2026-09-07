insert into public.feature_flags (feature_key, enabled_for, description)
values (
  'logistics_dispatch_portal',
  array(
    select role_value
    from unnest(enum_range(null::public.app_role)) as role_value
    where role_value::text in ('admin', 'transporter')
  ),
  'Transporter portal for accepting dispatches and managing delivery handovers'
)
on conflict (feature_key) do update set
  enabled_for = excluded.enabled_for,
  description = excluded.description;
