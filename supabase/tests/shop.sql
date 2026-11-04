-- Run as postgres using the Supabase SQL tool. All fixtures roll back, no SMTP.
begin;
select set_config('tf.test.owner', gen_random_uuid()::text, true);
select set_config('tf.test.other', gen_random_uuid()::text, true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values
  (current_setting('tf.test.owner')::uuid, current_setting('tf.test.owner') || '@example.invalid',now(),'{"name":"Teste transacional"}'),
  (current_setting('tf.test.other')::uuid, current_setting('tf.test.other') || '@example.invalid',now(),'{"name":"Outra conta de teste"}');
select set_config('tf.test.draft', '{
  "items":[{"slug":"original","name":"Original","quantity":6,"unitPriceInCents":1279,"lineTotalInCents":7674}],
  "quantity":6,"subtotalInCents":7674,"discountInCents":767,"productsTotalInCents":6907,
  "currency":"BRL","shippingInCents":800,"totalInCents":7707,
  "delivery":{"country":"BR","region":"SP-CAPITAL","postal":"","street":"Endereço fictício","number":"","noNumber":false,
    "complement":"","district":"","city":"","province":"","reference":"","instructions":"",
    "regionName":"São Paulo capital","zone":"BR","resolvedAddress":"Endereço fictício","referenceApplied":false,
    "method":"standard","priceInCents":800,"businessDays":{"min":null,"max":7}}
}', true);

set local role service_role;
do $$
declare
  result jsonb; original_id uuid; blocked boolean := false; removed jsonb;
begin
  if (select count(*) from public.profiles where id in (current_setting('tf.test.owner')::uuid,current_setting('tf.test.other')::uuid)) <> 2 then
    raise exception 'Profile trigger failed';
  end if;
  for i in 1..5 loop
    result := public.tf_create_order(current_setting('tf.test.owner')::uuid,current_setting('tf.test.draft')::jsonb);
    if result ->> 'ownerId' <> current_setting('tf.test.owner') or (result ->> 'totalInCents')::bigint <> 7707
      or (result ->> 'expiresAt')::timestamptz - (result ->> 'createdAt')::timestamptz <> interval '24 hours' then
      raise exception 'Invalid returned order';
    end if;
    original_id := (result ->> 'id')::uuid;
  end loop;
  begin
    perform public.tf_create_order(current_setting('tf.test.owner')::uuid,current_setting('tf.test.draft')::jsonb);
  exception when sqlstate 'TF001' then blocked := true;
  end;
  if not blocked then raise exception 'Sixth order accepted'; end if;
  if (select count(*) from public.orders where user_id=current_setting('tf.test.owner')::uuid) <> 5
    or (select count(*) from public.order_items where order_id in (select id from public.orders where user_id=current_setting('tf.test.owner')::uuid)) <> 5
    or (select count(*) from public.order_events where order_id in (select id from public.orders where user_id=current_setting('tf.test.owner')::uuid)) <> 5 then
    raise exception 'Duplicates were merged or related rows are missing';
  end if;
  removed := public.tf_delete_order(current_setting('tf.test.other')::uuid, original_id);
  if (removed ->> 'deleted')::boolean then raise exception 'Cross-owner deletion accepted'; end if;
  removed := public.tf_delete_order(current_setting('tf.test.owner')::uuid, original_id);
  if not (removed ->> 'deleted')::boolean then raise exception 'Owner deletion failed'; end if;
  if exists(select 1 from public.order_items where order_id=original_id)
    or exists(select 1 from public.order_events where order_id=original_id) then raise exception 'Deletion did not cascade'; end if;
  removed := public.tf_delete_order(current_setting('tf.test.owner')::uuid, original_id);
  if (removed ->> 'deleted')::boolean then raise exception 'Repeated deletion accepted'; end if;
  blocked := false;
  begin
    perform public.tf_create_order(current_setting('tf.test.owner')::uuid,
      jsonb_set(current_setting('tf.test.draft')::jsonb,'{totalInCents}','1'));
  exception when sqlstate 'TF002' then blocked := true;
  end;
  if not blocked or (select count(*) from public.orders where user_id=current_setting('tf.test.owner')::uuid) <> 4 then
    raise exception 'Forged order did not roll back';
  end if;
  perform public.tf_create_order(current_setting('tf.test.owner')::uuid,current_setting('tf.test.draft')::jsonb);
  if not (public.tf_rate_limit(repeat(replace(current_setting('tf.test.owner'),'-',''),2),1,60)->>'allowed')::boolean then raise exception 'First rate request refused'; end if;
  result := public.tf_rate_limit(repeat(replace(current_setting('tf.test.owner'),'-',''),2),1,60);
  if (result->>'allowed')::boolean or (result->>'retryAfter')::integer < 1 then raise exception 'Rate limiter failed'; end if;
end;
$$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tf.test.owner'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('tf.test.owner'),true);
set local role authenticated;
do $$
declare changed integer; blocked boolean := false;
begin
  if (select count(*) from public.profiles) <> 1 or (select count(*) from public.orders) <> 5
    or (select count(*) from public.order_items) <> 5 or (select count(*) from public.order_events) <> 5 then
    raise exception 'Owner RLS read failed';
  end if;
  update public.profiles set name='Nome alterado' where id=current_setting('tf.test.owner')::uuid;
  get diagnostics changed=row_count;
  if changed <> 1 then raise exception 'Own profile update failed'; end if;
  update public.profiles set name='Outro nome' where id=current_setting('tf.test.other')::uuid;
  get diagnostics changed=row_count;
  if changed <> 0 then raise exception 'Other profile updated'; end if;
  begin
    update public.profiles set id=current_setting('tf.test.other')::uuid where id=current_setting('tf.test.owner')::uuid;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Profile owner column writable'; end if;
  if has_function_privilege(current_user,'public.tf_create_order(uuid,jsonb)','execute')
    or has_function_privilege(current_user,'public.tf_delete_order(uuid,uuid)','execute')
    or has_function_privilege(current_user,'public.tf_rate_limit(text,integer,integer)','execute')
    or has_table_privilege(current_user,'public.orders','insert')
    or has_table_privilege(current_user,'public.orders','delete') then raise exception 'Client has server-only privilege'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tf.test.other'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('tf.test.other'),true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.orders) <> 0 or (select count(*) from public.order_items) <> 0
    or (select count(*) from public.order_events) <> 0 then raise exception 'Other account can read orders'; end if;
end;
$$;
reset role;

-- Physical TTL cleanup including child rows; expired records are hidden first.
insert into public.orders(user_id,quantity,subtotal_in_cents,discount_in_cents,products_total_in_cents,shipping_in_cents,total_in_cents,delivery,created_at,expires_at)
values(current_setting('tf.test.other')::uuid,1,1279,0,1279,800,2079,current_setting('tf.test.draft')::jsonb->'delivery',now()-interval '25 hours',now()-interval '1 hour');
select set_config('tf.test.expired',(select id::text from public.orders where user_id=current_setting('tf.test.other')::uuid),true);
insert into public.order_items(order_id,slug,name,quantity,unit_price_in_cents,line_total_in_cents)
values(current_setting('tf.test.expired')::uuid,'original','Original',1,1279,1279);
insert into public.order_events(order_id,type) values(current_setting('tf.test.expired')::uuid,'simulation_completed');
set local role authenticated;
do $$ begin
  if exists(select 1 from public.orders) or exists(select 1 from public.order_items) or exists(select 1 from public.order_events) then
    raise exception 'Expired records visible';
  end if;
end; $$;
reset role;
set local role service_role;
select tf_private.cleanup_expired_orders();
do $$ begin
  if exists(select 1 from public.orders where id=current_setting('tf.test.expired')::uuid)
    or exists(select 1 from public.order_items where order_id=current_setting('tf.test.expired')::uuid)
    or exists(select 1 from public.order_events where order_id=current_setting('tf.test.expired')::uuid) then
    raise exception 'Expired rows were not physically deleted';
  end if;
end; $$;
reset role;

-- Empty invalidations only: realtime.send may add a transport id, never order data.
do $$ begin
  if not exists(select 1 from realtime.messages where topic='tf:orders:'||current_setting('tf.test.owner') and event='orders_changed') then
    raise exception 'No database broadcast';
  end if;
  if exists(select 1 from realtime.messages where topic in ('tf:orders:'||current_setting('tf.test.owner'),'tf:orders:'||current_setting('tf.test.other'))
    and (not private or event<>'orders_changed' or payload - 'id' <> '{}'::jsonb)) then raise exception 'Broadcast contains unexpected data'; end if;
end; $$;
select set_config('realtime.topic','tf:orders:'||current_setting('tf.test.owner'),true);
select set_config('request.jwt.claim.sub',current_setting('tf.test.owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tf.test.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if not exists(select 1 from realtime.messages where topic='tf:orders:'||current_setting('tf.test.owner'))
    or exists(select 1 from realtime.messages where topic='tf:orders:'||current_setting('tf.test.other')) then
    raise exception 'Realtime own-topic policy failed';
  end if;
end; $$;
reset role;
select set_config('realtime.topic','tf:orders:'||current_setting('tf.test.other'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from realtime.messages where topic='tf:orders:'||current_setting('tf.test.other')) then
    raise exception 'Realtime cross-topic access accepted';
  end if;
end; $$;
reset role;
set local role anon;
do $$ begin
  if (select count(*) from public.products) <> 4 or (select count(*) from public.product_translations) <> 16
    or (select count(*) from public.delivery_regions) <> 149 then raise exception 'Public seed not readable'; end if;
  if has_table_privilege(current_user,'public.orders','select')
    or has_table_privilege(current_user,'public.profiles','select')
    or has_function_privilege(current_user,'public.tf_create_order(uuid,jsonb)','execute') then raise exception 'Anonymous private access'; end if;
end; $$;
reset role;
select 'PASS: atomic orders, five-order cap, duplicates, ownership, profile permissions, tamper rollback, TTL, rate limiter and Realtime policies' as result;
rollback;
