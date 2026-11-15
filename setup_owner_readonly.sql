-- =====================================================================
-- setup_owner_readonly.sql — صاحب المصنع «عرض فقط» على مستوى قاعدة البيانات
-- شغّله مرة واحدة من Supabase -> SQL Editor (آمن لو اتشغّل أكتر من مرة).
--
-- المشكلة: صاحب المصنع (role = owner) بيعدّي من can_section لكل الأقسام، فكان ممكن (لو عدّى الواجهة)
--          يضيف أو يعدّل أو يحذف تسجيلات وطلبيات.
-- الحل:    سياسة «تقييدية» (restrictive) على كل جداول الإنتاج والطلبيات بتمنع الإضافة والتعديل والحذف عن الـ owner.
--          القراءة (select) مش بتتأثر، والمدير ومسؤول القسم ومسجّل الإنتاج زي ما هم.
--
-- لو أضفت قسم جديد: ضيف جداوله في القايمة اللي تحت وشغّل الملف تاني.
-- للرجوع: شغّل كتلة ROLLBACK اللي في آخر الملف.
-- =====================================================================

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.active, true) and p.role = 'owner');
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'free_production',
    'glaze_orders','glaze_order_lines','glaze_order_increases','glaze_production','glaze_waste',
    'deco_orders','deco_lines','deco_increases','deco_production',
    'spray_orders','spray_production',
    'repair_log',
    'casting_orders','casting_log',
    'brush_orders','brush_log',
    'order_groups','order_deliveries','order_postponements','customers',
    'catalog','workers'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'تخطّيت % (مش موجود)', t;
      continue;
    end if;
    execute format('drop policy if exists owner_ro_ins on public.%I', t);
    execute format('drop policy if exists owner_ro_upd on public.%I', t);
    execute format('drop policy if exists owner_ro_del on public.%I', t);
    execute format('create policy owner_ro_ins on public.%I as restrictive for insert to authenticated with check (not (select public.is_owner()))', t);
    execute format('create policy owner_ro_upd on public.%I as restrictive for update to authenticated using (not (select public.is_owner())) with check (not (select public.is_owner()))', t);
    execute format('create policy owner_ro_del on public.%I as restrictive for delete to authenticated using (not (select public.is_owner()))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- للتأكد: لازم تشوف 3 سياسات owner_ro_* لكل جدول
--   select tablename, count(*) from pg_policies
--    where schemaname = 'public' and policyname like 'owner_ro_%' group by 1 order by 1;
--
-- ROLLBACK (لو حصلت مشكلة): شغّل ده
-- do $$ declare r record; begin
--   for r in select tablename, policyname from pg_policies where schemaname='public' and policyname like 'owner_ro_%'
--   loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
-- end $$;
-- ---------------------------------------------------------------------
