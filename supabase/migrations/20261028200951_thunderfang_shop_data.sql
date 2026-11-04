-- Thunder Fang shop objects only. Existing integration tables remain untouched.
-- This fragment is assembled into the CLI-created migration after review.
create schema if not exists tf_private;
revoke all on schema tf_private from public, anon, authenticated;
grant usage on schema tf_private to service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Cliente' check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.products (
  slug text primary key check (slug in ('original','citricos','tropicais','frutas-vermelhas')),
  name text not null check (char_length(name) between 1 and 120),
  flavor_profile text not null,
  description text not null,
  price_in_cents bigint not null check (price_in_cents between 1 and 9007199254740991),
  volume_ml integer not null check (volume_ml > 0),
  image text not null,
  accent text not null check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  background text not null check (background ~ '^#[0-9A-Fa-f]{6}$'),
  ornament text not null check (ornament ~ '^#[0-9A-Fa-f]{6}$'),
  available boolean not null default true,
  sort_order integer not null unique check (sort_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.product_translations (
  product_slug text not null references public.products(slug) on delete cascade,
  locale text not null check (locale in ('pt-BR','en','es','zh-Hans')),
  name text not null check (char_length(name) between 1 and 120),
  flavor_profile text not null,
  description text not null,
  primary key (product_slug, locale)
);
create table public.delivery_regions (
  country text not null check (country in ('BR','US','ES','CN')),
  code text not null,
  name text not null,
  zone text not null check (zone in ('BR','NA','EU','AS')),
  base_price_in_cents bigint not null check (base_price_in_cents between 0 and 2400),
  standard_min integer check (standard_min >= 0),
  standard_max integer not null check (standard_max > 0 and (standard_min is null or standard_min <= standard_max)),
  express_min integer not null check (express_min >= 0),
  express_max integer not null check (express_max > 0 and express_min <= express_max),
  reference_address text not null,
  primary key (country, code),
  check ((country = 'BR' and zone = 'BR') or (country = 'US' and zone = 'NA') or (country = 'ES' and zone = 'EU') or (country = 'CN' and zone = 'AS'))
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('TF-' || replace(gen_random_uuid()::text, '-', '')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'simulation_completed' check (status = 'simulation_completed'),
  currency text not null default 'BRL' check (currency = 'BRL'),
  quantity bigint not null check (quantity between 1 and 9007199254740991),
  subtotal_in_cents bigint not null check (subtotal_in_cents between 1 and 9007199254740991),
  discount_in_cents bigint not null check (discount_in_cents between 0 and 9007199254740991),
  products_total_in_cents bigint not null check (products_total_in_cents between 1 and 9007199254740991),
  shipping_in_cents bigint not null check (shipping_in_cents between 0 and 3000),
  total_in_cents bigint not null check (total_in_cents between 1 and 9007199254740991),
  delivery jsonb not null check (jsonb_typeof(delivery) = 'object'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (discount_in_cents = case when quantity >= 6 then floor((subtotal_in_cents::numeric + 5) / 10)::bigint else 0 end),
  check (subtotal_in_cents::numeric - discount_in_cents = products_total_in_cents),
  check (products_total_in_cents::numeric + shipping_in_cents = total_in_cents),
  check (expires_at = created_at + interval '24 hours')
);
create index orders_owner_created_idx on public.orders (user_id, created_at desc, id desc);
create index orders_expiry_idx on public.orders (expires_at);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  slug text not null references public.products(slug),
  name text not null check (char_length(name) between 1 and 120),
  quantity bigint not null check (quantity between 1 and 9007199254740991),
  unit_price_in_cents bigint not null check (unit_price_in_cents between 1 and 9007199254740991),
  line_total_in_cents bigint not null check (line_total_in_cents between 1 and 9007199254740991),
  unique (order_id, slug),
  check (quantity::numeric * unit_price_in_cents = line_total_in_cents)
);
create index order_items_product_idx on public.order_items (slug);
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  type text not null check (type = 'simulation_completed'),
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id);
create table tf_private.rate_windows (
  key text primary key check (key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count bigint not null check (request_count >= 0),
  updated_at timestamptz not null
);
create index rate_windows_updated_idx on tf_private.rate_windows (updated_at);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_translations enable row level security;
alter table public.delivery_regions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table tf_private.rate_windows enable row level security;

revoke all on table public.profiles, public.products, public.product_translations, public.delivery_regions, public.orders, public.order_items, public.order_events from public, anon, authenticated;
revoke all on table tf_private.rate_windows from public, anon, authenticated;
grant select on public.products, public.product_translations, public.delivery_regions to anon, authenticated;
grant select on public.profiles, public.orders, public.order_items, public.order_events to authenticated;
grant update (name) on public.profiles to authenticated;
grant all on public.profiles, public.products, public.product_translations, public.delivery_regions, public.orders, public.order_items, public.order_events, tf_private.rate_windows to service_role;

create policy tf_products_read on public.products for select to anon, authenticated using (available);
create policy tf_translations_read on public.product_translations for select to anon, authenticated using (
  exists (select 1 from public.products p where p.slug = product_slug and p.available)
);
create policy tf_regions_read on public.delivery_regions for select to anon, authenticated using (true);
create policy tf_profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy tf_profiles_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy tf_orders_read on public.orders for select to authenticated using (user_id = (select auth.uid()) and expires_at > now());
create policy tf_order_items_read on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()) and o.expires_at > now())
);
create policy tf_order_events_read on public.order_events for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()) and o.expires_at > now())
);

-- Auth owns profile creation. Metadata is used only for a display name, never authorization.
create function tf_private.create_profile_from_auth() returns trigger
language plpgsql security definer set search_path = '' as $$
declare display_name text;
begin
  display_name := case
    when jsonb_typeof(new.raw_user_meta_data -> 'name') = 'string' then new.raw_user_meta_data ->> 'name'
    when jsonb_typeof(new.raw_user_meta_data -> 'full_name') = 'string' then new.raw_user_meta_data ->> 'full_name'
    else 'Cliente' end;
  display_name := coalesce(nullif(btrim(left(display_name, 120)), ''), 'Cliente');
  insert into public.profiles (id, name) values (new.id, display_name) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function tf_private.create_profile_from_auth() from public, anon, authenticated, service_role;
create trigger tf_auth_profile_created after insert on auth.users for each row execute function tf_private.create_profile_from_auth();
insert into public.profiles (id, name)
select id, coalesce(nullif(btrim(left(case
  when jsonb_typeof(raw_user_meta_data -> 'name') = 'string' then raw_user_meta_data ->> 'name'
  when jsonb_typeof(raw_user_meta_data -> 'full_name') = 'string' then raw_user_meta_data ->> 'full_name'
  else 'Cliente' end, 120)), ''), 'Cliente')
from auth.users on conflict (id) do nothing;

-- Narrow internal lookup: the server receives only a boolean, never Auth records.
create function tf_private.is_confirmed_user(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null and deleted_at is null);
$$;
revoke all on function tf_private.is_confirmed_user(uuid) from public, anon, authenticated;
grant execute on function tf_private.is_confirmed_user(uuid) to service_role;

create function tf_private.touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end;
$$;
revoke all on function tf_private.touch_updated_at() from public, anon, authenticated;
grant execute on function tf_private.touch_updated_at() to service_role;
create trigger tf_profiles_updated before update on public.profiles for each row execute function tf_private.touch_updated_at();
create trigger tf_products_updated before update on public.products for each row execute function tf_private.touch_updated_at();

-- All order writers serialize on the owning profile. Touching it also protects
-- the five-order cap against stale snapshots under REPEATABLE READ.
create function tf_private.guard_order_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new is distinct from old then raise exception using errcode = '22023', message = 'ORDERS_ARE_IMMUTABLE'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    perform 1 from public.profiles where id = old.user_id for update;
    if found then update public.profiles set updated_at = clock_timestamp() where id = old.user_id; end if;
    return old;
  end if;
  perform 1 from public.profiles where id = new.user_id for update;
  if not found then raise exception using errcode = 'TF003', message = 'NOT_FOUND'; end if;
  update public.profiles set updated_at = clock_timestamp() where id = new.user_id;
  if (select count(*) from public.orders where user_id = new.user_id and expires_at > clock_timestamp()) >= 5 then
    raise exception using errcode = 'TF001', message = 'ORDER_LIMIT_REACHED';
  end if;
  return new;
end;
$$;
revoke all on function tf_private.guard_order_write() from public, anon, authenticated;
grant execute on function tf_private.guard_order_write() to service_role;
create trigger tf_orders_guard before insert or update or delete on public.orders for each row execute function tf_private.guard_order_write();

-- Approved source data follow; generated from the existing domain and translations.

insert into public.products (slug, name, flavor_profile, description, price_in_cents, volume_ml, image, accent, background, ornament, available, sort_order) values
  ('original', 'Original', 'Doce, ácido e levemente herbal', 'O clássico de presença marcante: doçura, acidez e um toque herbal para acompanhar seu próximo desafio.', 1279, 500, '/images/products/original.png', '#00A7AB', '#004EAB', '#AB9100', true, 1),
  ('citricos', 'Cítricos', 'Limão, lima, laranja e grapefruit', 'Acidez vibrante e frescor cítrico para quem gosta de seguir em frente com atitude.', 1279, 500, '/images/products/citricos.png', '#ABA600', '#75AB00', '#2DAB00', true, 2),
  ('tropicais', 'Tropicais', 'Manga, maracujá, abacaxi e coco', 'Uma combinação tropical intensa, com doçura e acidez na medida para dar personalidade à sua próxima conquista.', 1279, 500, '/images/products/tropicais.png', '#AB7800', '#AB8C00', '#ABA100', true, 3),
  ('frutas-vermelhas', 'Frutas Vermelhas', 'Morango, framboesa, mirtilo e cranberry', 'Frutas vermelhas, sabor envolvente e um toque ácido para acompanhar quem quer ir além.', 1279, 500, '/images/products/frutas-vermelhas.png', '#A400AB', '#AB0052', '#AB0600', true, 4);

insert into public.product_translations (product_slug, locale, name, flavor_profile, description) values
  ('original', 'pt-BR', 'Original', 'Doce, ácido e levemente herbal', 'O clássico de presença marcante: doçura, acidez e um toque herbal para acompanhar seu próximo desafio.'),
  ('original', 'en', 'Original', 'Sweet, tart and lightly herbal', 'A bold classic: sweetness, tartness and a hint of herbs to accompany your next challenge.'),
  ('original', 'es', 'Original', 'Dulce, ácido y ligeramente herbal', 'El clásico con carácter: dulzura, acidez y un toque herbal para acompañar tu próximo desafío.'),
  ('original', 'zh-Hans', '原味', '甜中带酸，略有草本香气', '经典而鲜明：甜味、酸味与淡淡草本香气，陪伴你的下一次挑战。'),
  ('citricos', 'pt-BR', 'Cítricos', 'Limão, lima, laranja e grapefruit', 'Acidez vibrante e frescor cítrico para quem gosta de seguir em frente com atitude.'),
  ('citricos', 'en', 'Citrus', 'Lemon, lime, orange and grapefruit', 'Vibrant tartness and citrus freshness for those who move forward with attitude.'),
  ('citricos', 'es', 'Cítricos', 'Limón, lima, naranja y pomelo', 'Acidez vibrante y frescura cítrica para quienes avanzan con actitud.'),
  ('citricos', 'zh-Hans', '柑橘味', '柠檬、青柠、橙子与葡萄柚', '鲜明酸味与清新柑橘香，为勇于前行的人而设。'),
  ('tropicais', 'pt-BR', 'Tropicais', 'Manga, maracujá, abacaxi e coco', 'Uma combinação tropical intensa, com doçura e acidez na medida para dar personalidade à sua próxima conquista.'),
  ('tropicais', 'en', 'Tropical', 'Mango, passion fruit, pineapple and coconut', 'An intense tropical blend, balancing sweetness and tartness to add character to your next achievement.'),
  ('tropicais', 'es', 'Tropicales', 'Mango, maracuyá, piña y coco', 'Una mezcla tropical intensa, con dulzura y acidez equilibradas para dar personalidad a tu próxima conquista.'),
  ('tropicais', 'zh-Hans', '热带水果味', '芒果、百香果、菠萝与椰子', '浓郁的热带水果组合，平衡甜味与酸味，为下一次成就增添个性。'),
  ('frutas-vermelhas', 'pt-BR', 'Frutas Vermelhas', 'Morango, framboesa, mirtilo e cranberry', 'Frutas vermelhas, sabor envolvente e um toque ácido para acompanhar quem quer ir além.'),
  ('frutas-vermelhas', 'en', 'Berries', 'Strawberry, raspberry, blueberry and cranberry', 'Berries, a rich flavor and a tart finish for those who want to go further.'),
  ('frutas-vermelhas', 'es', 'Frutos rojos', 'Fresa, frambuesa, arándano azul y arándano rojo', 'Frutos rojos, sabor envolvente y un toque ácido para quienes quieren ir más allá.'),
  ('frutas-vermelhas', 'zh-Hans', '莓果味', '草莓、覆盆子、蓝莓与蔓越莓', '莓果浓香配上微酸口感，陪伴想要走得更远的人。');

insert into public.delivery_regions (country, code, name, zone, base_price_in_cents, standard_min, standard_max, express_min, express_max, reference_address) values
  ('BR', 'SP-CAPITAL', 'São Paulo capital', 'BR', 800, null, 7, 2, 3, 'Praça da Sé, Sé, São Paulo, SP, CEP 01001-000'),
  ('BR', 'SP-OTHER', 'Demais municípios de SP', 'BR', 1200, null, 7, 2, 3, 'Praça da Sé, Sé, São Paulo, SP, CEP 01001-000'),
  ('BR', 'SOUTH-SOUTHEAST', 'Demais estados do Sudeste e Sul', 'BR', 1600, null, 7, 2, 3, 'Praça da Sé, Sé, São Paulo, SP, CEP 01001-000'),
  ('BR', 'CENTER-WEST', 'Centro-Oeste', 'BR', 1800, null, 7, 2, 3, 'Praça da Sé, Sé, São Paulo, SP, CEP 01001-000'),
  ('BR', 'NORTHEAST', 'Nordeste', 'BR', 2000, null, 7, 2, 3, 'Praça da Sé, Sé, São Paulo, SP, CEP 01001-000'),
  ('BR', 'NORTH', 'Norte', 'BR', 2200, null, 7, 2, 3, 'Praça da Sé, Sé, São Paulo, SP, CEP 01001-000'),
  ('US', 'US-AL', 'Alabama', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-AK', 'Alaska', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-AS', 'American Samoa', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-AZ', 'Arizona', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-AR', 'Arkansas', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-CA', 'California', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-CO', 'Colorado', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-CT', 'Connecticut', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-DE', 'Delaware', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-DC', 'District of Columbia', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-FL', 'Florida', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-GA', 'Georgia', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-GU', 'Guam', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-HI', 'Hawaii', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-ID', 'Idaho', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-IL', 'Illinois', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-IN', 'Indiana', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-IA', 'Iowa', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-KS', 'Kansas', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-KY', 'Kentucky', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-LA', 'Louisiana', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-ME', 'Maine', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-MD', 'Maryland', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-MA', 'Massachusetts', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-MI', 'Michigan', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-MN', 'Minnesota', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-MS', 'Mississippi', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-MO', 'Missouri', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-MT', 'Montana', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-NE', 'Nebraska', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-NV', 'Nevada', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-NH', 'New Hampshire', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-NJ', 'New Jersey', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-NM', 'New Mexico', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-NY', 'New York', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-NC', 'North Carolina', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-ND', 'North Dakota', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-MP', 'Northern Mariana Islands', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-OH', 'Ohio', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-OK', 'Oklahoma', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-OR', 'Oregon', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-PA', 'Pennsylvania', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-PR', 'Puerto Rico', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-RI', 'Rhode Island', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-SC', 'South Carolina', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-SD', 'South Dakota', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-TN', 'Tennessee', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-TX', 'Texas', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-UM', 'United States Minor Outlying Islands', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-UT', 'Utah', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-VT', 'Vermont', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-VI', 'Virgin Islands, U.S.', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-VA', 'Virginia', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-WA', 'Washington', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-WV', 'West Virginia', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-WI', 'Wisconsin', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('US', 'US-WY', 'Wyoming', 'NA', 1800, 10, 16, 5, 8, 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500'),
  ('ES', 'ES-C', 'A Coruña [La Coruña]', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-AB', 'Albacete', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-A', 'Alicante', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-AL', 'Almería', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-O', 'Asturias', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-BA', 'Badajoz', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-B', 'Barcelona [Barcelona]', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-BI', 'Bizkaia', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-BU', 'Burgos', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-S', 'Cantabria', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-CS', 'Castellón', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-CE', 'Ceuta', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-CR', 'Ciudad Real', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-CU', 'Cuenca', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-CC', 'Cáceres', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-CA', 'Cádiz', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-CO', 'Córdoba', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-SS', 'Gipuzkoa', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-GI', 'Girona [Gerona]', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-GR', 'Granada', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-GU', 'Guadalajara', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-H', 'Huelva', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-HU', 'Huesca', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-PM', 'Illes Balears [Islas Baleares]', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-J', 'Jaén', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-LO', 'La Rioja', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-GC', 'Las Palmas', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-LE', 'León', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-L', 'Lleida [Lérida]', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-LU', 'Lugo [Lugo]', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-M', 'Madrid', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-ML', 'Melilla', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-MU', 'Murcia', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-MA', 'Málaga', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-NA', 'Navarra', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-OR', 'Ourense [Orense]', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-P', 'Palencia', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-PO', 'Pontevedra [Pontevedra]', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-SA', 'Salamanca', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-TF', 'Santa Cruz de Tenerife', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-SG', 'Segovia', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-SE', 'Sevilla', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-SO', 'Soria', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-T', 'Tarragona [Tarragona]', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-TE', 'Teruel', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-TO', 'Toledo', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-V', 'Valencia', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-VA', 'Valladolid', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-ZA', 'Zamora', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-Z', 'Zaragoza', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-VI', 'Álava', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('ES', 'ES-AV', 'Ávila', 'EU', 2000, 10, 18, 5, 9, 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid'),
  ('CN', 'CN-AH', 'Anhui Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-BJ', 'Beijing Shi', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-CQ', 'Chongqing Shi', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-FJ', 'Fujian Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-GS', 'Gansu Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-GD', 'Guangdong Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-GX', 'Guangxi Zhuangzu Zizhiqu', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-GZ', 'Guizhou Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-HI', 'Hainan Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-HE', 'Hebei Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-HL', 'Heilongjiang Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-HA', 'Henan Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-HK', 'Hong Kong SAR', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-HB', 'Hubei Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-HN', 'Hunan Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-JS', 'Jiangsu Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-JX', 'Jiangxi Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-JL', 'Jilin Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-LN', 'Liaoning Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-MO', 'Macao SAR', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-NM', 'Nei Mongol Zizhiqu', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-NX', 'Ningxia Huizu Zizhiqu', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-QH', 'Qinghai Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-SN', 'Shaanxi Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-SD', 'Shandong Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-SH', 'Shanghai Shi', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-SX', 'Shanxi Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-SC', 'Sichuan Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-TW', 'Taiwan Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-TJ', 'Tianjin Shi', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-XJ', 'Xinjiang Uygur Zizhiqu', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-XZ', 'Xizang Zizhiqu', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-YN', 'Yunnan Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim'),
  ('CN', 'CN-ZJ', 'Zhejiang Sheng', 'AS', 2200, 12, 25, 6, 12, 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim');


-- Server-only transactional API. All prices, delivery options and account limits
-- are rechecked inside the transaction; the server's accepted quote is not trusted
-- as a source of prices. No retry or idempotency key silently merges purchases.
create or replace function tf_private.assert_json_keys(p_value jsonb, p_keys text[])
returns void language plpgsql immutable security invoker set search_path = '' as $$
begin
  if pg_catalog.jsonb_typeof(p_value) is distinct from 'object' then
    raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
  end if;
  if not (p_value ?& p_keys) or exists (
    select 1 from pg_catalog.jsonb_object_keys(p_value) as k(key) where not (k.key = any(p_keys))
  ) then
    raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
  end if;
end;
$$;

create or replace function tf_private.json_safe_integer(p_value jsonb, p_positive boolean default false)
returns numeric language plpgsql immutable security invoker set search_path = '' as $$
declare v_text text; v_number numeric;
begin
  if pg_catalog.jsonb_typeof(p_value) is distinct from 'number' then
    raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
  end if;
  v_text := p_value #>> '{}';
  if v_text !~ '^[0-9]+$' or pg_catalog.length(v_text) > 16 then
    raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
  end if;
  v_number := v_text::numeric;
  if v_number > 9007199254740991 or (p_positive and v_number < 1) then
    raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
  end if;
  return v_number;
end;
$$;

revoke all on function tf_private.assert_json_keys(jsonb,text[]) from public, anon, authenticated;
revoke all on function tf_private.json_safe_integer(jsonb,boolean) from public, anon, authenticated;
grant execute on function tf_private.assert_json_keys(jsonb,text[]), tf_private.json_safe_integer(jsonb,boolean) to service_role;

create or replace function public.tf_create_order(p_user_id uuid, p_order jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_item jsonb; v_delivery jsonb; v_product public.products%rowtype; v_region public.delivery_regions%rowtype;
  v_items jsonb := '[]'::jsonb; v_seen text[] := array[]::text[];
  v_key text; v_max integer; v_text text; v_quantity numeric := 0; v_units numeric;
  v_subtotal numeric := 0; v_line numeric; v_discount numeric; v_products_total numeric;
  v_shipping numeric; v_total numeric; v_reference boolean; v_address text;
  v_days_min integer; v_days_max integer; v_id uuid; v_number text; v_created timestamptz; v_expires timestamptz;
begin
  perform tf_private.assert_json_keys(p_order, array[
    'items','quantity','subtotalInCents','discountInCents','productsTotalInCents',
    'currency','shippingInCents','totalInCents','delivery'
  ]);
  if p_order ->> 'currency' is distinct from 'BRL'
    or pg_catalog.jsonb_typeof(p_order -> 'items') is distinct from 'array' then
    raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
  end if;
  if pg_catalog.jsonb_array_length(p_order -> 'items') not between 1 and 4 then
    raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
  end if;

  -- This lock is shared by create, delete, TTL cleanup and the table guard.
  -- Updating the row also forces stale repeatable-read transactions to abort.
  perform 1 from public.profiles where id = p_user_id for update;
  if not found or not tf_private.is_confirmed_user(p_user_id) then
    raise exception using errcode = 'TF003', message = 'NOT_FOUND';
  end if;
  update public.profiles set updated_at = pg_catalog.clock_timestamp() where id = p_user_id;
  delete from public.orders where user_id = p_user_id and expires_at <= pg_catalog.clock_timestamp();
  if (select pg_catalog.count(*) from public.orders where user_id = p_user_id) >= 5 then
    raise exception using errcode = 'TF001', message = 'ORDER_LIMIT_REACHED';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_order -> 'items') loop
    perform tf_private.assert_json_keys(v_item, array['slug','name','quantity','unitPriceInCents','lineTotalInCents']);
    if pg_catalog.jsonb_typeof(v_item -> 'slug') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'name') is distinct from 'string'
      or pg_catalog.length(v_item ->> 'name') not between 1 and 120
      or (v_item ->> 'slug') = any(v_seen) then
      raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
    end if;
    v_seen := pg_catalog.array_append(v_seen, v_item ->> 'slug');
    select * into v_product from public.products where slug = v_item ->> 'slug' for share;
    if not found or not v_product.available then
      raise exception using errcode = 'TF004', message = 'PRODUCT_UNAVAILABLE';
    end if;
    v_units := tf_private.json_safe_integer(v_item -> 'quantity', true);
    v_line := v_units * v_product.price_in_cents;
    if tf_private.json_safe_integer(v_item -> 'unitPriceInCents', true) <> v_product.price_in_cents
      or tf_private.json_safe_integer(v_item -> 'lineTotalInCents', true) <> v_line
      or v_line > 9007199254740991 then
      raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
    end if;
    v_quantity := v_quantity + v_units;
    v_subtotal := v_subtotal + v_line;
    -- Names are display snapshots (possibly translated), never authorization or price inputs.
    v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'slug', v_product.slug, 'name', v_item ->> 'name', 'quantity', v_units::bigint,
      'unitPriceInCents', v_product.price_in_cents, 'lineTotalInCents', v_line::bigint
    ));
  end loop;
  if v_quantity > 9007199254740991 or v_subtotal > 9007199254740991 then
    raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
  end if;
  v_discount := case when v_quantity >= 6 then pg_catalog.trunc((v_subtotal + 5) / 10) else 0 end;
  v_products_total := v_subtotal - v_discount;
  if tf_private.json_safe_integer(p_order -> 'quantity', true) <> v_quantity
    or tf_private.json_safe_integer(p_order -> 'subtotalInCents', true) <> v_subtotal
    or tf_private.json_safe_integer(p_order -> 'discountInCents') <> v_discount
    or tf_private.json_safe_integer(p_order -> 'productsTotalInCents', true) <> v_products_total then
    raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
  end if;

  v_delivery := p_order -> 'delivery';
  perform tf_private.assert_json_keys(v_delivery, array[
    'country','region','postal','street','number','noNumber','complement','district','city','province',
    'reference','instructions','regionName','zone','resolvedAddress','referenceApplied','method','priceInCents','businessDays'
  ]);
  for v_key, v_max in select * from (values
    ('country',2),('region',80),('postal',160),('street',300),('number',160),('complement',160),
    ('district',160),('city',160),('province',160),('reference',300),('instructions',500),
    ('regionName',200),('zone',2),('resolvedAddress',300),('method',8)
  ) as fields(key,maximum) loop
    v_text := v_delivery ->> v_key;
    if pg_catalog.jsonb_typeof(v_delivery -> v_key) is distinct from 'string'
      or pg_catalog.length(v_text) > v_max or pg_catalog.btrim(v_text) <> v_text then
      raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
    end if;
  end loop;
  if pg_catalog.jsonb_typeof(v_delivery -> 'noNumber') is distinct from 'boolean'
    or pg_catalog.jsonb_typeof(v_delivery -> 'referenceApplied') is distinct from 'boolean'
    or v_delivery ->> 'method' not in ('standard','express')
    or pg_catalog.length(v_delivery ->> 'regionName') = 0
    or ((v_delivery ->> 'noNumber')::boolean and v_delivery ->> 'number' <> '')
    or not exists (
      select 1 from pg_catalog.jsonb_each_text(v_delivery) as field(key,value)
      where key = any(array['postal','street','number','complement','district','city','province','reference','instructions'])
      and value ~ '[^[:space:]]'
    ) then
    raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
  end if;
  select * into v_region from public.delivery_regions
    where country = v_delivery ->> 'country' and code = v_delivery ->> 'region' for share;
  if not found then raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED'; end if;
  v_shipping := least(2400, v_region.base_price_in_cents +
    case when v_quantity <= 6 then 0 when v_quantity <= 12 then 200 when v_quantity <= 24 then 400 else 600 end);
  if v_delivery ->> 'method' = 'express' then
    v_shipping := least(3000, v_shipping + 600);
    v_days_min := v_region.express_min; v_days_max := v_region.express_max;
  else
    v_days_min := v_region.standard_min; v_days_max := v_region.standard_max;
  end if;
  v_reference := v_delivery ->> 'street' = '';
  v_address := case when v_reference then v_region.reference_address else v_delivery ->> 'street' end;
  perform tf_private.assert_json_keys(v_delivery -> 'businessDays', array['min','max']);
  if v_delivery ->> 'zone' is distinct from v_region.zone
    or (v_delivery ->> 'referenceApplied')::boolean is distinct from v_reference
    or v_delivery ->> 'resolvedAddress' is distinct from v_address
    or tf_private.json_safe_integer(v_delivery -> 'priceInCents') <> v_shipping
    or (v_delivery -> 'businessDays') is distinct from pg_catalog.jsonb_build_object('min',v_days_min,'max',v_days_max) then
    raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
  end if;
  v_total := v_products_total + v_shipping;
  if v_total > 9007199254740991
    or tf_private.json_safe_integer(p_order -> 'shippingInCents') <> v_shipping
    or tf_private.json_safe_integer(p_order -> 'totalInCents', true) <> v_total then
    raise exception using errcode = 'TF002', message = 'QUOTE_CHANGED';
  end if;

  v_id := pg_catalog.gen_random_uuid();
  v_number := 'TF-' || pg_catalog.upper(pg_catalog.replace(v_id::text,'-',''));
  v_created := pg_catalog.clock_timestamp(); v_expires := v_created + interval '24 hours';
  insert into public.orders(id,number,user_id,status,currency,quantity,subtotal_in_cents,discount_in_cents,
    products_total_in_cents,shipping_in_cents,total_in_cents,delivery,created_at,expires_at)
  values(v_id,v_number,p_user_id,'simulation_completed','BRL',v_quantity::bigint,v_subtotal::bigint,v_discount::bigint,
    v_products_total::bigint,v_shipping::bigint,v_total::bigint,v_delivery,v_created,v_expires);
  insert into public.order_items(order_id,slug,name,quantity,unit_price_in_cents,line_total_in_cents)
  select v_id, x ->> 'slug',x ->> 'name',(x ->> 'quantity')::bigint,
    (x ->> 'unitPriceInCents')::bigint,(x ->> 'lineTotalInCents')::bigint
  from pg_catalog.jsonb_array_elements(v_items) as item(x);
  insert into public.order_events(order_id,type,created_at) values(v_id,'simulation_completed',v_created);
  return pg_catalog.jsonb_build_object(
    'id',v_id,'number',v_number,'ownerId',p_user_id,'status','simulation_completed',
    'currency','BRL','createdAt',v_created,'expiresAt',v_expires,'quantity',v_quantity::bigint,
    'subtotalInCents',v_subtotal::bigint,'discountInCents',v_discount::bigint,
    'productsTotalInCents',v_products_total::bigint,'shippingInCents',v_shipping::bigint,'totalInCents',v_total::bigint,
    'items',v_items,'delivery',v_delivery
  );
end;
$$;

create or replace function public.tf_delete_order(p_user_id uuid, p_order_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare v_deleted integer;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then return pg_catalog.jsonb_build_object('deleted',false); end if;
  update public.profiles set updated_at = pg_catalog.clock_timestamp() where id = p_user_id;
  delete from public.orders where id = p_order_id and user_id = p_user_id;
  get diagnostics v_deleted = row_count;
  return pg_catalog.jsonb_build_object('deleted',v_deleted > 0);
end;
$$;

create or replace function public.tf_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare v_now timestamptz; v_started timestamptz; v_count bigint; v_retry integer; v_inserted integer;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_limit is null or p_limit not between 1 and 10000
    or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'INVALID_RATE_WINDOW';
  end if;
  v_now := pg_catalog.clock_timestamp();
  insert into tf_private.rate_windows(key,window_started_at,request_count,updated_at)
    values(p_key,v_now,1,v_now) on conflict(key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return pg_catalog.jsonb_build_object('allowed',true,'retryAfter',0);
  end if;
  select window_started_at,request_count into v_started,v_count
    from tf_private.rate_windows where key = p_key for update;
  v_now := pg_catalog.clock_timestamp();
  if v_started + pg_catalog.make_interval(secs => p_window_seconds) <= v_now then
    v_started := v_now; v_count := 0;
  end if;
  if v_count >= p_limit then
    v_retry := greatest(1,pg_catalog.ceil(extract(epoch from
      (v_started + pg_catalog.make_interval(secs => p_window_seconds) - v_now)))::integer);
    update tf_private.rate_windows set updated_at = v_now where key = p_key;
    return pg_catalog.jsonb_build_object('allowed',false,'retryAfter',v_retry);
  end if;
  update tf_private.rate_windows set window_started_at = v_started,request_count = v_count + 1,updated_at = v_now where key = p_key;
  return pg_catalog.jsonb_build_object('allowed',true,'retryAfter',0);
end;
$$;

create or replace function tf_private.cleanup_expired_orders()
returns bigint language plpgsql volatile security invoker set search_path = '' as $$
declare v_user uuid; v_deleted bigint := 0; v_rows bigint;
begin
  -- Always acquire owner locks in UUID order, matching the create/delete path.
  -- Each owner is rechecked after waiting so a concurrent purchase cannot be removed.
  for v_user in select p.id from public.profiles p where exists (
    select 1 from public.orders o where o.user_id = p.id and o.expires_at <= pg_catalog.clock_timestamp()
  ) order by p.id loop
    perform 1 from public.profiles where id = v_user for update;
    if found then
      update public.profiles set updated_at = pg_catalog.clock_timestamp() where id = v_user;
      delete from public.orders where user_id = v_user and expires_at <= pg_catalog.clock_timestamp();
      get diagnostics v_rows = row_count;
      v_deleted := v_deleted + v_rows;
    end if;
  end loop;
  delete from tf_private.rate_windows where updated_at < pg_catalog.clock_timestamp() - interval '1 day';
  return v_deleted;
end;
$$;

revoke all on function public.tf_create_order(uuid,jsonb),public.tf_delete_order(uuid,uuid),public.tf_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.tf_create_order(uuid,jsonb),public.tf_delete_order(uuid,uuid),public.tf_rate_limit(text,integer,integer) to service_role;
revoke all on function tf_private.cleanup_expired_orders() from public, anon, authenticated;
grant execute on function tf_private.cleanup_expired_orders() to service_role;


-- Run after schema/seed and transactional functions. Only Thunder Fang objects.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all on all tables in schema cron to postgres;

-- A private invalidation signal contains no address, item, order id or personal data.
-- The recipient re-queries the API, whose owner/expiry checks remain authoritative.
create function tf_private.notify_orders_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if TG_TABLE_SCHEMA <> 'public' or TG_TABLE_NAME <> 'orders' then
    raise exception 'Unsupported notification source';
  end if;
  if TG_OP = 'DELETE' then owner_id := OLD.user_id;
  else owner_id := NEW.user_id;
  end if;
  perform realtime.send('{}'::jsonb, 'orders_changed', 'tf:orders:' || owner_id::text, true);
  return null;
end;
$$;
revoke all on function tf_private.notify_orders_changed() from public, anon, authenticated, service_role;

create trigger tf_orders_changed
after insert or update or delete on public.orders
for each row execute function tf_private.notify_orders_changed();

-- No INSERT policy: clients receive only their own private channel.
create policy tf_receive_own_orders on realtime.messages
for select to authenticated
using (
  extension = 'broadcast'
  and private = true
  and topic = 'tf:orders:' || (select auth.uid())::text
  and topic = (select realtime.topic())
);

-- Expired rows are already hidden by RLS. Physical deletion runs every minute.
select cron.schedule(
  'thunderfang-expired-orders',
  '* * * * *',
  'select tf_private.cleanup_expired_orders();'
);

notify pgrst, 'reload schema';
