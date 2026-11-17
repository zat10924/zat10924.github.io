-- MAS Manager: read-only sync/security preflight
-- Run this first on STAGING. This script does not modify data or schema.

select
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from (values
  ('casting_log'), ('deco_production'), ('free_production')
) as t(table_name)
left join information_schema.columns c
  on c.table_schema='public' and c.table_name=t.table_name
 and c.column_name in ('id','client_id','created_by')
order by t.table_name, c.column_name;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in ('casting_log','deco_production','free_production')
order by tablename, policyname;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename in ('casting_log','deco_production','free_production')
order by tablename, indexname;

do $$
declare t text; n bigint;
begin
  foreach t in array array['casting_log','deco_production','free_production'] loop
    if to_regclass('public.'||t) is null then
      raise notice 'MISSING TABLE: public.%', t;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=t and column_name='client_id'
    ) then
      execute format('select count(*) from (select client_id from public.%I where client_id is not null group by client_id having count(*)>1) d',t) into n;
      raise notice 'public.% duplicate non-null client_id groups: %',t,n;
    else
      raise notice 'public.% has no client_id column',t;
    end if;
  end loop;
end $$;
