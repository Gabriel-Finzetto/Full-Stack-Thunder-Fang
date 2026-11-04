-- Only fresh random fixtures; no emails or existing user records. Always rollback.
begin;
set local statement_timeout = '15s';
do $$ begin
  perform set_config('tf.delivery.a',gen_random_uuid()::text,true);
  perform set_config('tf.delivery.b',gen_random_uuid()::text,true);
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (current_setting('tf.delivery.a')::uuid,current_setting('tf.delivery.a')||'@example.invalid',now(),'{"name":"Address fixture A"}'),
    (current_setting('tf.delivery.b')::uuid,current_setting('tf.delivery.b')||'@example.invalid',now(),'{"name":"Address fixture B"}');
  perform set_config('tf.delivery.saved','{"method":"express","delivery":{"country":"BR","region":"SP-CAPITAL","postal":"","street":"Rua fictícia","number":"","noNumber":true,"complement":"","district":"","city":"","province":"","reference":"","instructions":""}}',true);
  perform set_config('request.jwt.claim.sub',current_setting('tf.delivery.a'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('tf.delivery.a'),'role','authenticated')::text,true);
end; $$;
set local role authenticated;
do $$
declare changed integer; rejected boolean; attack jsonb;
begin
  update public.profiles set default_delivery=current_setting('tf.delivery.saved')::jsonb where id=current_setting('tf.delivery.a')::uuid;
  get diagnostics changed=row_count;
  if changed <> 1 then raise exception 'Own default delivery did not save'; end if;
  if (select default_delivery from public.profiles where id=current_setting('tf.delivery.a')::uuid) <> current_setting('tf.delivery.saved')::jsonb then raise exception 'Saved preference did not roundtrip'; end if;
  update public.profiles set default_delivery=current_setting('tf.delivery.saved')::jsonb where id=current_setting('tf.delivery.b')::uuid;
  get diagnostics changed=row_count;
  if changed <> 0 then raise exception 'Foreign preference writable'; end if;
  if exists(select 1 from public.profiles where id=current_setting('tf.delivery.b')::uuid) then raise exception 'Foreign preference readable'; end if;
  for attack in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_set(current_setting('tf.delivery.saved')::jsonb,'{delivery,street}','123'),
    jsonb_set(current_setting('tf.delivery.saved')::jsonb,'{delivery,region}','123'),
    jsonb_set(current_setting('tf.delivery.saved')::jsonb,'{delivery,street}',to_jsonb(repeat('x',301))),
    jsonb_set(current_setting('tf.delivery.saved')::jsonb,'{delivery,number}','"10"'),
    current_setting('tf.delivery.saved')::jsonb || '{"priceInCents":1}'::jsonb
  )) loop
    rejected := false;
    begin update public.profiles set default_delivery=attack where id=current_setting('tf.delivery.a')::uuid;
    exception when check_violation then rejected:=true; end;
    if not rejected then raise exception 'Malformed preference accepted'; end if;
  end loop;
  update public.profiles set default_delivery=null where id=current_setting('tf.delivery.a')::uuid;
  if exists(select 1 from public.profiles where id=current_setting('tf.delivery.a')::uuid and default_delivery is not null) then raise exception 'Own preference did not clear'; end if;
  if has_column_privilege(current_user,'public.profiles','id','UPDATE') then raise exception 'Owner column is writable'; end if;
end; $$;
reset role;
set local role anon;
do $$ declare rejected boolean:=false; begin
  begin perform default_delivery from public.profiles;
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Anonymous role can read private preferences'; end if;
end; $$;
reset role;
rollback;
