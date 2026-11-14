-- =====================================================================
-- setup_casting_v4.sql — إصلاحات الصب اليدوي وربطه بباقي الأقسام
-- شغّله مرة واحدة من Supabase -> SQL Editor (آمن لو اتشغّل أكتر من مرة)
-- لازم setup_casting.sql ثم v2 ثم v3 يكونوا اتشغّلوا قبله.
-- =====================================================================

-- 1) عرض (view) إنجاز طلبيات الصب: المطلوب والمنتج لكل طلبية (زي spray_status)
--    بيستخدمه لوحة الصفحة الرئيسية (دوائر الإنجاز) وتوقّع التأخير
create or replace view public.casting_status with (security_invoker = true) as
select o.id, o.item, o.status, o.order_date, o.due_date, o.group_id, o.qty_required,
       coalesce(sum(l.qty), 0)::integer as produced
  from public.casting_orders o
  left join public.casting_log l on l.order_id = o.id
 group by o.id;
grant select on public.casting_status to authenticated;

-- 2) حالة الطلبية بتتظبط أوتوماتيك من الإنتاج المسجّل (مفتوحة / مكتملة)
--    security definer عشان مسجّل الإنتاج (اللي ملوش صلاحية تعديل الطلبيات) تتحدّث الحالة برضو
create or replace function public.casting_sync_status(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_req integer; v_done integer;
begin
  if p_id is null then return; end if;
  select qty_required into v_req from public.casting_orders where id = p_id;
  if v_req is null then return; end if;
  select coalesce(sum(qty), 0) into v_done from public.casting_log where order_id = p_id;
  update public.casting_orders
     set status = case when v_done >= v_req then 'done' else 'open' end
   where id = p_id and status is distinct from (case when v_done >= v_req then 'done' else 'open' end);
end $$;
revoke all on function public.casting_sync_status(bigint) from public;

create or replace function public.casting_log_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform public.casting_sync_status(old.order_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform public.casting_sync_status(new.order_id); end if;
  return null;
end $$;
revoke all on function public.casting_log_after() from public;

drop trigger if exists trg_casting_log_sync on public.casting_log;
create trigger trg_casting_log_sync after insert or update of qty, order_id or delete
  on public.casting_log for each row execute function public.casting_log_after();

-- لما المدير يزوّد/يقلّل الكمية المطلوبة في صفحة الطلبيات الحالة تتظبط برضو
create or replace function public.casting_order_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- اسم الصنف لو اتعدّل في الطلبية يتعدّل في تسجيلات الصب المربوطة بيها (عشان التقارير والبحث ما يفترقوش)
  if new.item is distinct from old.item then
    update public.casting_log set item = new.item where order_id = new.id;
  end if;
  if new.qty_required is distinct from old.qty_required then
    perform public.casting_sync_status(new.id);
  end if;
  return null;
end $$;
revoke all on function public.casting_order_after() from public;

drop trigger if exists trg_casting_order_sync on public.casting_orders;
create trigger trg_casting_order_sync after update of item, qty_required
  on public.casting_orders for each row execute function public.casting_order_after();

-- 3) تظبيط الحالة للطلبيات الموجودة دلوقتي مرة واحدة
do $$ declare r record;
begin for r in select id from public.casting_orders loop perform public.casting_sync_status(r.id); end loop; end $$;

notify pgrst, 'reload schema';
