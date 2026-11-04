-- Authorized adversarial DB checks. Run as postgres with the SQL tool.
-- Only random, newly-created account/order fixtures are written. No SMTP,
-- catalog changes, global cleanup or production-row enumeration. Always rollback.
begin;
set local statement_timeout = '20s';
do $$
declare v_price bigint; v_subtotal bigint; v_discount bigint; v_shipping bigint;
  v_region public.delivery_regions%rowtype;
begin
  perform set_config('tf.security.a', gen_random_uuid()::text, true);
  perform set_config('tf.security.b', gen_random_uuid()::text, true);
  perform set_config('tf.security.unconfirmed', gen_random_uuid()::text, true);
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  values
    (current_setting('tf.security.a')::uuid,current_setting('tf.security.a') || '@example.invalid',now(),'{"name":"Security fixture A"}'),
    (current_setting('tf.security.b')::uuid,current_setting('tf.security.b') || '@example.invalid',now(),'{"name":"Security fixture B"}'),
    (current_setting('tf.security.unconfirmed')::uuid,current_setting('tf.security.unconfirmed') || '@example.invalid',null,'{"name":"Unconfirmed fixture"}');
  select price_in_cents into strict v_price from public.products where slug = 'original' and available;
  select * into strict v_region from public.delivery_regions where country = 'BR' and code = 'SP-CAPITAL';
  v_subtotal := v_price * 6;
  v_discount := floor((v_subtotal::numeric + 5) / 10)::bigint;
  v_shipping := least(2400, v_region.base_price_in_cents);
  perform set_config('tf.security.draft',jsonb_build_object(
    'items',jsonb_build_array(jsonb_build_object('slug','original','name','Original','quantity',6,'unitPriceInCents',v_price,'lineTotalInCents',v_subtotal)),
    'quantity',6,'subtotalInCents',v_subtotal,'discountInCents',v_discount,
    'productsTotalInCents',v_subtotal-v_discount,'shippingInCents',v_shipping,
    'totalInCents',v_subtotal-v_discount+v_shipping,'currency','BRL',
    'delivery',jsonb_build_object('country','BR','region','SP-CAPITAL','postal','','street','Endereço fictício de segurança',
      'number','','noNumber',true,'complement','','district','','city','','province','','reference','','instructions','',
      'regionName',v_region.name,'zone',v_region.zone,'resolvedAddress','Endereço fictício de segurança','referenceApplied',false,
      'method','standard','priceInCents',v_shipping,'businessDays',jsonb_build_object('min',v_region.standard_min,'max',v_region.standard_max))
  )::text,true);
end;
$$;

set local role service_role;
do $$
declare result jsonb; draft jsonb := current_setting('tf.security.draft')::jsonb;
  attack jsonb; rejected boolean; attempts integer := 0;
begin
  result := public.tf_create_order(current_setting('tf.security.a')::uuid,draft);
  perform set_config('tf.security.order_a',result->>'id',true);
  result := public.tf_create_order(current_setting('tf.security.b')::uuid,draft);
  perform set_config('tf.security.order_b',result->>'id',true);
  -- Each mutation must fail atomically, preserving the one valid fixture order.
  for attack in select value from jsonb_array_elements(jsonb_build_array(
    draft || jsonb_build_object('ownerId',current_setting('tf.security.b')),
    draft || '{"unexpected":true}'::jsonb,
    jsonb_set(draft,'{quantity}','-1'),
    jsonb_set(draft,'{quantity}','1.5'),
    jsonb_set(draft,'{totalInCents}','1'),
    jsonb_set(draft,'{subtotalInCents}','1'),
    jsonb_set(draft,'{discountInCents}','0'),
    jsonb_set(draft,'{shippingInCents}','0'),
    jsonb_set(draft,'{currency}','"USD"'),
    jsonb_set(draft,'{items,0,unitPriceInCents}','1'),
    jsonb_set(draft,'{items,0,lineTotalInCents}','1'),
    jsonb_set(draft,'{items,0,quantity}','9007199254740992'),
    jsonb_set(draft,'{items}', '[]'),
    jsonb_set(draft,'{items}',(draft->'items') || (draft->'items')),
    jsonb_set(draft,'{items,0,slug}','"missing-product"'),
    jsonb_set(draft,'{delivery,region}','"missing-region"'),
    jsonb_set(draft,'{delivery,method}','"free"'),
    jsonb_set(draft,'{delivery,priceInCents}','-1'),
    jsonb_set(draft,'{delivery,businessDays,max}','0'),
    jsonb_set(draft,'{delivery,resolvedAddress}','"Forged address"')
  )) loop
    attempts := attempts + 1;
    rejected := false;
    begin
      perform public.tf_create_order(current_setting('tf.security.a')::uuid,attack);
    exception when sqlstate 'TF002' or sqlstate 'TF004' then rejected := true;
    end;
    if not rejected then raise exception 'Tampered payload % accepted',attempts; end if;
  end loop;
  if (select count(*) from public.orders where user_id=current_setting('tf.security.a')::uuid) <> 1
    or (select count(*) from public.order_items where order_id=current_setting('tf.security.order_a')::uuid) <> 1
    or (select count(*) from public.order_events where order_id=current_setting('tf.security.order_a')::uuid) <> 1 then
    raise exception 'Tampering left unexpected fixture rows';
  end if;
  rejected := false;
  begin
    perform public.tf_create_order(current_setting('tf.security.unconfirmed')::uuid,draft);
  exception when sqlstate 'TF003' then rejected := true;
  end;
  if not rejected then raise exception 'Unconfirmed account created an order'; end if;
  result := public.tf_delete_order(current_setting('tf.security.b')::uuid,current_setting('tf.security.order_a')::uuid);
  if (result->>'deleted')::boolean then raise exception 'Cross-owner RPC deletion accepted'; end if;
end;
$$;
reset role;

do $$ begin
  perform set_config('request.jwt.claim.sub',current_setting('tf.security.a'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tf.security.a'),'role','authenticated')::text,true);
  perform set_config('realtime.topic','tf:orders:'||current_setting('tf.security.a'),true);
end; $$;
set local role authenticated;
do $$
declare relation text; column_name text; changed integer; rejected boolean;
begin
  if (select count(*) from public.profiles) <> 1 or (select count(*) from public.orders) <> 1
    or (select count(*) from public.order_items) <> 1 or (select count(*) from public.order_events) <> 1 then
    raise exception 'Owner cannot read exactly the own profile/order tree';
  end if;
  if exists(select 1 from public.orders where id=current_setting('tf.security.order_b')::uuid)
    or exists(select 1 from public.order_items where order_id=current_setting('tf.security.order_b')::uuid)
    or exists(select 1 from public.order_events where order_id=current_setting('tf.security.order_b')::uuid) then
    raise exception 'Foreign order tree visible';
  end if;
  update public.profiles set name='Updated own fixture' where id=current_setting('tf.security.a')::uuid;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Own name update failed'; end if;
  update public.profiles set name='Foreign fixture change' where id=current_setting('tf.security.b')::uuid;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Foreign profile update accepted'; end if;
  update public.profiles set default_delivery = jsonb_build_object(
    'method','standard','delivery',jsonb_build_object('country','BR','region','SP-CAPITAL','postal','',
      'street','Private saved fixture address','number','','noNumber',true,'complement','','district','',
      'city','','province','','reference','','instructions',''))
    where id=current_setting('tf.security.a')::uuid;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Own saved address update failed'; end if;
  update public.profiles set default_delivery = null where id=current_setting('tf.security.b')::uuid;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Foreign saved address update accepted'; end if;
  foreach column_name in array array['id','created_at','updated_at'] loop
    if has_column_privilege(current_user,'public.profiles',column_name,'UPDATE') then
      raise exception 'Privileged profile column writable: %',column_name;
    end if;
  end loop;
  foreach relation in array array['public.orders','public.order_items','public.order_events','public.products','public.product_translations','public.delivery_regions'] loop
    if has_table_privilege(current_user,relation,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') then
      raise exception 'Browser role has forbidden table write privileges: %',relation;
    end if;
    rejected := false;
    begin
      execute format('delete from %s where false',relation);
    exception when insufficient_privilege then rejected:=true;
    end;
    if not rejected then raise exception 'Direct client write did not reject: %',relation; end if;
  end loop;
  if has_schema_privilege(current_user,'tf_private','USAGE')
    or has_schema_privilege(current_user,'public','CREATE') then raise exception 'Browser role can use private/create schema'; end if;
  rejected := false;
  begin
    perform public.tf_create_order(current_setting('tf.security.a')::uuid,current_setting('tf.security.draft')::jsonb);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'Client invoked privileged order-create RPC'; end if;
  rejected := false;
  begin
    perform public.tf_delete_order(current_setting('tf.security.a')::uuid,current_setting('tf.security.order_a')::uuid);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'Client invoked privileged order-delete RPC'; end if;
  rejected := false;
  begin
    perform public.tf_rate_limit(repeat('0',64),1,60);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'Client invoked privileged rate-limit RPC'; end if;
  rejected := false;
  begin
    insert into realtime.messages(topic,event,payload,extension,private)
    values('tf:orders:'||current_setting('tf.security.b'),'orders_changed','{}','broadcast',true);
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'Client inserted a Realtime broadcast'; end if;
  if not exists(select 1 from realtime.messages where topic='tf:orders:'||current_setting('tf.security.a'))
    or exists(select 1 from realtime.messages where topic='tf:orders:'||current_setting('tf.security.b')) then
    raise exception 'Realtime own/foreign topic isolation failed';
  end if;
end;
$$;
reset role;

do $$ begin
  perform set_config('request.jwt.claim.sub',current_setting('tf.security.b'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tf.security.b'),'role','authenticated')::text,true);
  perform set_config('realtime.topic','tf:orders:'||current_setting('tf.security.a'),true);
end; $$;
set local role authenticated;
do $$ begin
  if (select count(*) from public.profiles)<>1 or (select count(*) from public.orders)<>1
    or exists(select 1 from public.orders where id=current_setting('tf.security.order_a')::uuid)
    or exists(select 1 from realtime.messages where topic='tf:orders:'||current_setting('tf.security.a')) then
    raise exception 'Second account or requested-topic isolation failed';
  end if;
end; $$;
reset role;

set local role anon;
do $$
declare relation text; rejected boolean;
begin
  if not exists(select 1 from public.products) or not exists(select 1 from public.product_translations)
    or not exists(select 1 from public.delivery_regions) then raise exception 'Public catalogue unavailable'; end if;
  foreach relation in array array['public.profiles','public.orders','public.order_items','public.order_events'] loop
    rejected:=false;
    begin execute format('select 1 from %s limit 1',relation);
    exception when insufficient_privilege then rejected:=true;
    end;
    if not rejected then raise exception 'Anonymous can query private table: %',relation; end if;
  end loop;
  if has_schema_privilege(current_user,'tf_private','USAGE') or has_schema_privilege(current_user,'public','CREATE')
    or has_function_privilege(current_user,'public.tf_create_order(uuid,jsonb)','EXECUTE')
    or has_function_privilege(current_user,'public.tf_delete_order(uuid,uuid)','EXECUTE')
    or has_function_privilege(current_user,'public.tf_rate_limit(text,integer,integer)','EXECUTE') then
    raise exception 'Anonymous role has a privileged schema/RPC grant';
  end if;
end;
$$;
reset role;

rollback;
select jsonb_build_object('passed',true,'fixtureAccounts',3,'fixturesPersisted',false,'tamperedPayloadsRejected',20,
  'groups',jsonb_build_array('atomic tamper rejection','unconfirmed account restriction','A/B profile and order isolation',
    'least privilege and direct write rejection','server-only RPC permissions','Realtime receive-only isolation','anonymous private-data denial','saved address isolation')) as security_result;
