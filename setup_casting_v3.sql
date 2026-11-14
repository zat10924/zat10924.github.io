-- =====================================================================
-- setup_casting_v3.sql — ربط الصب اليدوي بصفحة الطلبيات الرئيسية
-- شغّله مرة واحدة من Supabase -> SQL Editor (آمن لو اتشغّل أكتر من مرة)
-- لازم setup_casting.sql ثم setup_casting_v2.sql ثم setup_order_groups.sql يكونوا اتشغّلوا قبله.
-- =====================================================================

-- 1) ربط صنف الصب بالطلبية الرئيسية (order_groups)
alter table public.casting_orders add column if not exists group_id uuid references public.order_groups(id) on delete cascade;
create index if not exists casting_orders_group_idx on public.casting_orders (group_id);

-- 2) حالة الصنف: open / done (زي باقي الأقسام)
alter table public.casting_orders drop constraint if exists casting_orders_status_check;
update public.casting_orders set status = 'done' where status = 'closed';
alter table public.casting_orders add constraint casting_orders_status_check check (status in ('open','done'));

-- 3) الصلاحيات: مدير الطلبيات (أي مدير) يوزّع على الصب، وأعضاء الصب والموظفين يشوفوا
drop policy if exists co_select on public.casting_orders;
drop policy if exists co_insert on public.casting_orders;
drop policy if exists co_update on public.casting_orders;
drop policy if exists co_delete on public.casting_orders;
create policy co_select on public.casting_orders for select to authenticated
  using ((select public.can_section('casting')) or (select public.is_staff()));
create policy co_insert on public.casting_orders for insert to authenticated
  with check ((select public.can_manage_section('casting')) or (select public.is_manager_any()));
create policy co_update on public.casting_orders for update to authenticated
  using ((select public.can_manage_section('casting')) or (select public.is_manager_any()))
  with check ((select public.can_manage_section('casting')) or (select public.is_manager_any()));
create policy co_delete on public.casting_orders for delete to authenticated
  using ((select public.can_manage_section('casting')) or (select public.is_manager_any()));

notify pgrst, 'reload schema';
