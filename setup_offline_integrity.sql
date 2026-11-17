-- MAS Manager 4.6.8: Offline ownership + idempotency hardening
-- Run on STAGING first. Review the preflight output before applying to production.
-- This migration targets only tables written by the offline queue in common.js.

-- 1) Preflight: run this compact dynamic report before/after migration.
do $$
declare t text; dup_count bigint;
begin
  foreach t in array array['casting_log','deco_production','free_production'] loop
    if to_regclass('public.'||t) is null then
      raise notice 'Missing table public.%',t; continue;
    end if;
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='client_id') then
      execute format('select count(*) from (select client_id from public.%I where client_id is not null group by client_id having count(*)>1) d',t) into dup_count;
      raise notice 'public.%.client_id duplicate groups: %',t,dup_count;
    else
      raise notice 'public.%.client_id column is absent',t;
    end if;
  end loop;
end $$;

-- 2) Add columns only when absent. Existing columns are not rewritten.
do $$
declare t text;
begin
  foreach t in array array['casting_log','deco_production','free_production'] loop
    if to_regclass('public.'||t) is null then
      raise notice 'Skipping missing table public.%', t;
      continue;
    end if;
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='client_id') then
      execute format('alter table public.%I add column client_id text',t);
    end if;
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='created_by') then
      execute format('alter table public.%I add column created_by uuid',t);
    end if;
  end loop;
end $$;

-- 3) Server-side creator enforcement. Never trust the browser's owner_id.
create or replace function public.mas_enforce_offline_creator()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null then
    if new.created_by is null then
      new.created_by := auth.uid();
    elsif new.created_by <> auth.uid() then
      raise exception 'created_by must match authenticated user'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- 4) Install trigger only where created_by is UUID-compatible.
do $$
declare t text; typ text;
begin
  foreach t in array array['casting_log','deco_production','free_production'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    select data_type into typ from information_schema.columns
      where table_schema='public' and table_name=t and column_name='created_by';
    if typ <> 'uuid' then
      raise notice 'Skipping creator trigger on public.%: created_by type is %, expected uuid',t,typ;
      continue;
    end if;
    execute format('drop trigger if exists mas_offline_creator_guard on public.%I',t);
    execute format('create trigger mas_offline_creator_guard before insert or update of created_by on public.%I for each row execute function public.mas_enforce_offline_creator()',t);
  end loop;
end $$;

-- 5) Create a unique client_id index only if the table has no duplicate non-null keys.
-- If duplicates exist, no index is created; resolve them manually and rerun this section.
do $$
declare t text; dup boolean; typ text;
begin
  foreach t in array array['casting_log','deco_production','free_production'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    select data_type into typ from information_schema.columns
      where table_schema='public' and table_name=t and column_name='client_id';
    if typ is null then continue; end if;
    execute format('select exists (select 1 from public.%I group by client_id having client_id is not null and count(*) > 1)',t) into dup;
    if dup then
      raise notice 'Unique index NOT created on public.%.client_id: duplicates exist',t;
    else
      execute format('create unique index if not exists %I on public.%I (client_id) where client_id is not null', 'ux_'||t||'_client_id',t);
      raise notice 'Unique client_id index ensured on public.%',t;
    end if;
  end loop;
end $$;

-- 6) Verification report
select c.table_name, c.column_name, c.data_type
from information_schema.columns c
where c.table_schema='public'
  and c.table_name in ('casting_log','deco_production','free_production')
  and c.column_name in ('client_id','created_by')
order by c.table_name,c.column_name;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename in ('casting_log','deco_production','free_production')
  and indexname like 'ux\_%\_client\_id' escape '\'
order by tablename;
