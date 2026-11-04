-- Private reusable address preference; quotes and orders still recompute all totals.
alter table public.profiles add column default_delivery jsonb;
alter table public.profiles add constraint tf_default_delivery_shape check (
  default_delivery is null or (
    jsonb_typeof(default_delivery) = 'object'
    and octet_length(default_delivery::text) <= 8192
    and default_delivery ?& array['delivery','method']
    and default_delivery - array['delivery','method'] = '{}'::jsonb
    and default_delivery->>'method' in ('standard','express')
    and jsonb_typeof(default_delivery->'delivery') = 'object'
    and default_delivery->'delivery' ?& array['country','region','postal','street','number','noNumber','complement','district','city','province','reference','instructions']
    and (default_delivery->'delivery') - array['country','region','postal','street','number','noNumber','complement','district','city','province','reference','instructions'] = '{}'::jsonb
    and default_delivery->'delivery'->>'country' in ('BR','US','ES','CN')
    and length(default_delivery->'delivery'->>'region') between 1 and 80
    and jsonb_typeof(default_delivery->'delivery'->'noNumber') = 'boolean'
  ) is true
);
grant select (default_delivery), update (default_delivery) on public.profiles to authenticated;
comment on column public.profiles.default_delivery is 'Private destination and preferred method. Ownership uses existing profile RLS; no quote totals or credentials.';
