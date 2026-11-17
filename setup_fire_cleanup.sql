-- =====================================================================
-- تنظيف بيانات التجربة في الحريق (4.6.1)  —  شغّله مرة واحدة من Supabase → SQL Editor (آمن لو اتشغّل تاني)
--
-- 1) firing_kiln_delete(p_id)   : حذف فرن (للمشرف). مرفوض لو الفرن عليه عمليات أو شحنات — امسحها الأول، أو اوقف الفرن بدل حذفه.
-- 2) firing_purge_test(p_kind, p_kilns, p_dry) : (للمدير فقط) مسح كل عمليات وشحنات نوع واحد (بسكوت/جليز) بأي تاريخ.
--      p_kilns = true  → يحذف كمان أفران النوع ده (بعد ما تتفضّى)
--      p_dry   = true  → معاينة (عدّ بس)
--    كل سجل بيتسجّل «حذف» في المراجعة فتقدر تسترجعه (إلا صور العداد). بيرجّع مسارات الصور عشان البرنامج يمسح ملفاتها.
-- =====================================================================
create or replace function public.firing_kiln_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_old public.firing_kilns%rowtype;
begin
  perform set_config('mas.audit_skip', '1', true);
  if auth.uid() is null or (select public.is_owner()) or not (select public.firing_is_sup()) then raise exception 'not allowed'; end if;
  select * into v_old from public.firing_kilns where id = p_id for update;
  if not found then raise exception 'kiln not found'; end if;
  if exists (select 1 from public.firing_operations where kiln_id = p_id) or exists (select 1 from public.firing_loads where kiln_id = p_id) then
    raise exception 'kiln has history';
  end if;
  delete from public.firing_kilns where id = p_id;
  perform public.firing_audit_log('kiln', p_id, 'delete', to_jsonb(v_old), null);
end $$;
revoke all on function public.firing_kiln_delete(bigint) from public;
grant execute on function public.firing_kiln_delete(bigint) to authenticated;

create or replace function public.firing_purge_test(p_kind text, p_kilns boolean default false, p_dry boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record; v_op public.firing_operations%rowtype; v_before jsonb; v_paths jsonb := '[]'::jsonb;
  v_nl integer := 0; v_no integer := 0; v_nk integer := 0; v_lbl text;
begin
  perform set_config('mas.audit_skip', '1', true);
  if auth.uid() is null or (select public.is_owner()) or not (select public.firing_is_admin()) then raise exception 'not allowed'; end if;
  if p_kind not in ('biscuit', 'glaze') then raise exception 'invalid kind'; end if;
  v_lbl := 'مسح بيانات تجربة (' || case p_kind when 'biscuit' then 'بسكوت' else 'جليز' end || ')';

  if p_dry then
    select count(*) into v_no from public.firing_operations where kind = p_kind;
    select count(*) into v_nl from public.firing_loads where kind = p_kind;
    select count(*) into v_nk from public.firing_kilns where kind = p_kind;
    return jsonb_build_object('operations', v_no, 'loads', v_nl, 'kilns', case when p_kilns then v_nk else 0 end, 'dry', true);
  end if;

  for r in select id from public.firing_operations where kind = p_kind order by id for update loop
    v_before := public.firing_snap_op(r.id) || jsonb_build_object('photos',
       coalesce((select jsonb_agg(jsonb_build_object('path', storage_path, 'taken_at', taken_at)) from public.firing_meter_photos where operation_id = r.id), '[]'::jsonb));
    v_paths := v_paths || coalesce((select jsonb_agg(storage_path) from public.firing_meter_photos where operation_id = r.id), '[]'::jsonb);
    update public.firing_meter_photos set replaces_id = null, replaced_by = null where operation_id = r.id;
    delete from public.firing_meter_photos where operation_id = r.id;
    delete from public.firing_operations where id = r.id;
    perform public.firing_audit_log('operation', r.id, 'delete', v_before, null, v_lbl);
    v_no := v_no + 1;
  end loop;

  for r in select id from public.firing_loads where kind = p_kind order by id for update loop
    v_before := public.firing_snap_load(r.id);
    update public.firing_operations set load_id = null where load_id = r.id;
    delete from public.firing_loads where id = r.id;
    perform public.firing_audit_log('load', r.id, 'delete', v_before, null, v_lbl);
    v_nl := v_nl + 1;
  end loop;

  if p_kilns then
    for r in select id from public.firing_kilns k where k.kind = p_kind
             and not exists (select 1 from public.firing_operations o where o.kiln_id = k.id)
             and not exists (select 1 from public.firing_loads l where l.kiln_id = k.id) order by id loop
      perform public.firing_audit_log('kiln', r.id, 'delete', (select to_jsonb(k) from public.firing_kilns k where k.id = r.id), null, v_lbl);
      delete from public.firing_kilns where id = r.id;
      v_nk := v_nk + 1;
    end loop;
  end if;

  return jsonb_build_object('operations', v_no, 'loads', v_nl, 'kilns', v_nk, 'paths', v_paths, 'dry', false);
end $$;
revoke all on function public.firing_purge_test(text, boolean, boolean) from public;
grant execute on function public.firing_purge_test(text, boolean, boolean) to authenticated;
