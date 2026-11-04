-- SEC-03: the old integration tables were removed; keep their legacy routine
-- unavailable to browser roles instead of exposing an unused RPC.
do $$
declare routine regprocedure; vector_schema text; relocatable boolean;
begin
  for routine in
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'match_documents'
  loop
    execute pg_catalog.format('revoke execute on function %s from public, anon, authenticated', routine);
    execute pg_catalog.format('alter function %s set search_path = ''''', routine);
  end loop;

  select n.nspname, e.extrelocatable into vector_schema, relocatable
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'vector';

  if vector_schema = 'public' then
    if not relocatable then
      raise exception 'vector must be relocatable before this migration';
    end if;
    -- Do not relocate a live vector data model. The reviewed project has no
    -- vector columns, and the application does not use vector SQL operators.
    if exists (
      select 1 from pg_catalog.pg_attribute a
      join pg_catalog.pg_type t on t.oid = a.atttypid
      where a.attnum > 0 and not a.attisdropped
        and (t.typname in ('vector', 'halfvec', 'sparsevec', '_vector', '_halfvec', '_sparsevec')
          or t.typbasetype in (select oid from pg_catalog.pg_type where typname in ('vector', 'halfvec', 'sparsevec')))
    ) then
      raise exception 'Review vector column consumers before relocating the extension';
    end if;
    create schema if not exists extensions;
    alter extension vector set schema extensions;
  end if;
end;
$$;

notify pgrst, 'reload schema';
