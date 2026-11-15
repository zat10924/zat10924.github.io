-- شغّله مرة واحدة من Supabase -> SQL Editor
-- بيفعّل: (1) إضافة «مدير» جديد من صفحة المستخدمين  (2) دور «صاحب المصنع» (يشوف كل حاجة عرض فقط)

-- 0) لو فيه قيد قديم على قيم الدور، نشيله
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.profiles'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

-- 1) حماية حسابات المديرين: المدير الفعّال يقدر يضيف مدير أو صاحب مصنع جديد.
--    لسه ممنوع: تعديل/حذف مدير تاني، أو إن المدير يغيّر دوره أو يوقف نفسه.
create or replace function public.protect_admin_profiles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_me is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select exists (select 1 from public.profiles
                 where id = v_me and role = 'admin' and coalesce(active, true)) into v_is_admin;
  if tg_op = 'DELETE' then
    if old.role = 'admin' then raise exception 'protected admin'; end if;
    return old;
  elsif tg_op = 'INSERT' then
    if new.role in ('admin', 'owner') and not v_is_admin then raise exception 'protected admin'; end if;
    return new;
  else
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

-- 2) صاحب المصنع يشوف كل الأقسام
create or replace function public.can_section(p_sec text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.active, true) and p.role is not null
      and (p.role in ('admin', 'owner') or p.section = p_sec or p_sec = any (coalesce(p.sections, '{}'::text[])))
  );
$$;

-- 3) إنشاء مستخدم بالاسم: يقبل admin / owner / manager / worker
create or replace function public.admin_create_user(
  p_name text, p_password text, p_role text, p_section text, p_perms jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text;
  v_name text := regexp_replace(trim(p_name), '\s+', ' ', 'g');
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and coalesce(active, true)) then
    raise exception 'not allowed';
  end if;
  if length(v_name) < 2 then raise exception 'name too short'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'password too short'; end if;
  if p_role not in ('admin', 'owner', 'manager', 'worker') then raise exception 'bad role'; end if;
  if exists (select 1 from public.profiles
             where lower(regexp_replace(trim(full_name), '\s+', ' ', 'g')) = lower(v_name)) then
    raise exception 'name already exists';
  end if;

  v_email := 'u' || substr(replace(v_id::text, '-', ''), 1, 14) || '@noemail.mas.app';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new)
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v_name),
    now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());

  insert into public.profiles (id, full_name, email, role, section, active, perms)
  values (v_id, v_name, v_email, p_role,
          case when p_role in ('admin', 'owner') then null else p_section end, true, coalesce(p_perms, '{}'::jsonb))
  on conflict (id) do update set
    full_name = excluded.full_name, email = excluded.email, role = excluded.role,
    section = excluded.section, active = true, perms = excluded.perms;

  return v_id;
end;
$$;
revoke all on function public.admin_create_user(text, text, text, text, jsonb) from public;
grant execute on function public.admin_create_user(text, text, text, text, jsonb) to authenticated;
