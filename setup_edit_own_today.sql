-- =====================================================================
-- setup_edit_own_today.sql — شغّله مرة واحدة من Supabase -> SQL Editor -> New query -> Run
-- (آمن لو اتشغّل أكتر من مرة)
-- الهدف: مسجّل الإنتاج (worker) يقدر يعدّل تسجيلاته هو في نفس اليوم بس،
--        ولما اليوم يخلص التعديل بيتقفل (من البرنامج ومن قاعدة البيانات كمان).
-- المدير والأدمن (admin / manager) مالهمش أي قيود — بيعدّلوا في أي وقت.
-- محتاج setup_v2.sql و setup_security.sql يكونوا اتشغّلوا قبله.
-- =====================================================================

-- 1) عمود «مين سجّل» (created_by) لجداول الإنتاج — التسجيلات القديمة هتفضل بدون صاحب
do $$
declare t text;
begin
  foreach t in array array['glaze_production','deco_production','spray_production','free_production','glaze_waste'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I add column if not exists created_by uuid default auth.uid()', t);
    end if;
  end loop;
end $$;

-- 2) سماح التعديل (UPDATE) لأعضاء القسم — القفل الفعلي بالـ trigger اللي تحت
do $$
declare r record;
begin
  for r in select * from (values
    ('glaze_production','glaze'),('deco_production','deco'),('spray_production','spray'),('glaze_waste','glaze')
  ) as v(t,s) loop
    if to_regclass('public.'||r.t) is not null then
      execute format('drop policy if exists prod_edit_own on public.%I', r.t);
      execute format('create policy prod_edit_own on public.%I for update to authenticated using ((select public.can_section(%L))) with check ((select public.can_section(%L)))', r.t, r.s, r.s);
      execute format('grant update on public.%I to authenticated', r.t);
    end if;
  end loop;
  if to_regclass('public.free_production') is not null then
    drop policy if exists free_prod_edit_own on public.free_production;
    create policy free_prod_edit_own on public.free_production for update to authenticated
      using (public.can_section(section)) with check (public.can_section(section));
    grant update on public.free_production to authenticated;
  end if;
end $$;

-- 3) قفل التعديل بعد انتهاء اليوم (للـ worker بس)
create or replace function public.enforce_prod_day_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role  text;
  v_today date := left(public.server_today()::text, 10)::date;
  v_old   date := left(coalesce(to_jsonb(old)->>'prod_date', to_jsonb(old)->>'waste_date'), 10)::date;
  v_new   date := left(coalesce(to_jsonb(new)->>'prod_date', to_jsonb(new)->>'waste_date'), 10)::date;
  v_by    uuid := nullif(to_jsonb(old)->>'created_by', '')::uuid;
begin
  -- SQL Editor / service role: من غير قيود
  if auth.uid() is null then return new; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role in ('admin', 'manager') then return new; end if;

  if v_old is null or v_old < v_today then
    raise exception 'التعديل مقفول — اليوم ده خلص' using errcode = 'P0001';
  end if;
  if v_new is distinct from v_old then
    raise exception 'ما ينفعش تنقل التسجيل ليوم تاني' using errcode = 'P0001';
  end if;
  if v_by is not null and v_by <> auth.uid() then
    raise exception 'تقدر تعدّل تسجيلاتك انت بس' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['glaze_production','deco_production','spray_production','free_production','glaze_waste'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_prod_day_lock on public.%I', t);
      execute format('create trigger trg_prod_day_lock before update on public.%I for each row execute function public.enforce_prod_day_lock()', t);
    end if;
  end loop;
end $$;
