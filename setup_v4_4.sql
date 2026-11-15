-- =====================================================================
-- setup_v4_4.sql — شغّله مرة واحدة من Supabase -> SQL Editor -> Run (آمن لو اتشغّل أكتر من مرة)
-- 1) البرشر: عدد القوالب وعدد الصبات (اختياريين) على الصنف وعلى تسجيل البرشر
-- 2) حماية حساب صاحب المصنع: محدش يعدّل دوره أو صلاحياته أو يوقفه أو يحذفه
-- 3) مسؤول القسم يشوف الأقسام التانية (عرض فقط) ويدير أقسامه بس
-- بعده: شغّل setup_owner_readonly.sql تاني (آمن) عشان تتأكد إن الحماية شاملة.
-- =====================================================================

-- ---------- 1) القوالب والصبات ----------
alter table public.catalog   add column if not exists molds integer check (molds is null or (molds >= 0 and molds <= 100000));
alter table public.catalog   add column if not exists pours integer check (pours is null or (pours >= 0 and pours <= 100000));
alter table public.brush_log add column if not exists molds integer check (molds is null or (molds >= 0 and molds <= 100000));
alter table public.brush_log add column if not exists pours integer check (pours is null or (pours >= 0 and pours <= 100000));

create or replace function public.catalog_set_brush(p_id bigint, p_molds integer, p_pours integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and coalesce(active, true)) then
    raise exception 'not allowed';
  end if;
  update public.catalog set molds = p_molds, pours = p_pours where id = p_id;
end;
$$;
revoke all on function public.catalog_set_brush(bigint, integer, integer) from public;
grant execute on function public.catalog_set_brush(bigint, integer, integer) to authenticated;

-- ---------- 2) حماية صاحب المصنع ----------
alter table public.profiles add column if not exists view_all boolean not null default false;

create or replace function public.protect_admin_profiles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_me is null then   -- تشغيل من Supabase نفسه (service role)
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select exists (select 1 from public.profiles
                 where id = v_me and role = 'admin' and coalesce(active, true)) into v_is_admin;
  if tg_op = 'DELETE' then
    if old.role in ('admin', 'owner') then raise exception 'protected admin'; end if;
    return old;
  elsif tg_op = 'INSERT' then
    if new.role in ('admin', 'owner') and not v_is_admin then raise exception 'protected admin'; end if;
    return new;
  else
    -- صاحب المصنع: الدور والتفعيل والصلاحيات والأقسام ثابتة لأي حد (حتى هو نفسه)
    if old.role = 'owner' and (
         new.role     is distinct from old.role
      or coalesce(new.active, true) is distinct from coalesce(old.active, true)
      or new.perms    is distinct from old.perms
      or new.section  is distinct from old.section
      or new.sections is distinct from old.sections
      or new.view_all is distinct from old.view_all) then
      raise exception 'protected owner';
    end if;
    if old.role = 'admin' and old.id <> v_me then raise exception 'protected admin'; end if;
    if new.role in ('admin', 'owner') and old.role is distinct from new.role and not v_is_admin then
      raise exception 'protected admin';
    end if;
    if old.id = v_me and old.role = 'admin'
       and (new.role is distinct from old.role or coalesce(new.active, true) is distinct from coalesce(old.active, true)) then
      raise exception 'protected admin';
    end if;
    return new;
  end if;
end;
$$;
drop trigger if exists trg_protect_admin_profiles on public.profiles;
create trigger trg_protect_admin_profiles
  before insert or update or delete on public.profiles
  for each row execute function public.protect_admin_profiles();

create or replace function public.delete_user(p_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_admins int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and coalesce(active, true)) then
    raise exception 'not allowed';
  end if;
  if p_id = auth.uid() then raise exception 'cannot delete yourself'; end if;
  if exists (select 1 from public.profiles where id = p_id and role = 'owner') then
    raise exception 'protected owner';
  end if;
  if exists (select 1 from public.profiles where id = p_id and role = 'admin') then
    select count(*) into v_admins from public.profiles where role = 'admin' and coalesce(active, true) and id <> p_id;
    if v_admins = 0 then raise exception 'last admin'; end if;
  end if;
  delete from public.profiles where id = p_id;
  delete from auth.users where id = p_id;
end;
$$;
revoke all on function public.delete_user(uuid) from public;
grant execute on function public.delete_user(uuid) to authenticated;

-- ---------- 3) مسؤول القسم يشوف باقي الأقسام (عرض فقط) ----------
create or replace function public.can_view_all()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.active, true) and p.role = 'manager' and coalesce(p.view_all, false));
$$;
revoke all on function public.can_view_all() from public;
grant execute on function public.can_view_all() to authenticated;

-- سياسة قراءة إضافية (permissive) على جداول الأقسام: بتتجمّع مع السياسات الحالية بـ OR، والكتابة ما بتتأثرش
do $$
declare t text;
begin
  foreach t in array array[
    'free_production',
    'glaze_orders','glaze_order_lines','glaze_order_increases','glaze_production','glaze_waste',
    'deco_orders','deco_lines','deco_increases','deco_production',
    'spray_orders','spray_production',
    'repair_log','casting_orders','casting_log','brush_orders','brush_log'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists view_all_sel on public.%I', t);
    execute format('create policy view_all_sel on public.%I for select to authenticated using ((select public.can_view_all()))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
