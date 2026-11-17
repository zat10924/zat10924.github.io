-- MAS Manager 4.6.9 — Offline sync identity + idempotency hardening
-- Apply to STAGING first, after reviewing 00_sync_preflight.sql.
-- Does not delete or rewrite existing production rows.
-- Existing records with NULL created_by/client_id remain unchanged.
-- Future inserts must carry client_id and created_by matching auth.uid().

begin;

do $$
declare
  t text;
  dup_groups bigint;
  col_type text;
begin
  foreach t in array array['casting_log','deco_production','free_production'] loop
    if to_regclass('public.'||t) is null then
      raise exception 'Required offline-sync table public.% does not exist', t;
    end if;

    execute format('alter table public.%I add column if not exists created_by uuid default auth.uid()', t);
    execute format('alter table public.%I add column if not exists client_id uuid', t);

    select data_type into col_type
      from information_schema.columns
     where table_schema='public' and table_name=t and column_name='created_by';
    if col_type <> 'uuid' then
      raise exception 'public.%.created_by must be uuid, found %',t,col_type;
    end if;

    select data_type into col_type
      from information_schema.columns
     where table_schema='public' and table_name=t and column_name='client_id';
    if col_type <> 'uuid' then
      raise exception 'public.%.client_id must be uuid, found %',t,col_type;
    end if;

    execute format(
      'select count(*) from (select client_id from public.%I where client_id is not null group by client_id having count(*)>1) d',
      t
    ) into dup_groups;
    if dup_groups > 0 then
      raise exception 'public.% has % duplicate client_id groups. Resolve them manually before adding the unique index.',t,dup_groups;
    end if;
  end loop;
end $$;

create or replace function public.mas_enforce_offline_identity()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
begin
  -- Trusted server-side service operations may bypass end-user ownership checks.
  if v_role = 'service_role' then
    return new;
  end if;

  if v_uid is null then
    raise exception 'authenticated user required for offline-sync write'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := v_uid;
    elsif new.created_by <> v_uid then
      raise exception 'created_by must match the authenticated user'
        using errcode = '42501';
    end if;
    if new.client_id is null then
      raise exception 'client_id is required for idempotent production writes'
        using errcode = '23502';
    end if;
  else
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by is immutable'
        using errcode = '42501';
    end if;
    if new.client_id is distinct from old.client_id then
      raise exception 'client_id is immutable'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.mas_enforce_offline_identity() from public;

do $$
declare t text;
begin
  foreach t in array array['casting_log','deco_production','free_production'] loop
    execute format('alter table public.%I alter column created_by set default auth.uid()',t);
    if not exists (
      select 1
        from pg_index i
        join pg_attribute a on a.attrelid=i.indrelid and a.attname='client_id'
       where i.indrelid=to_regclass('public.'||t)
         and i.indisunique and i.indisvalid and i.indnkeyatts=1
         and a.attnum = any(i.indkey)
    ) then
      execute format('create unique index %I on public.%I (client_id) where client_id is not null',
        t||'_client_id_uidx',t);
    end if;
    execute format('drop trigger if exists trg_mas_offline_identity on public.%I',t);
    execute format(
      'create trigger trg_mas_offline_identity before insert or update on public.%I for each row execute function public.mas_enforce_offline_identity()',
      t
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- Verify after applying:
-- select tablename,indexname,indexdef from pg_indexes
-- where schemaname='public' and tablename in ('casting_log','deco_production','free_production');
-- select tgname, tgrelid::regclass from pg_trigger
-- where not tgisinternal and tgname='trg_mas_offline_identity';
