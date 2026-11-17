-- =====================================================================
-- MAS 4.6.1 — استرجاع البيانات القديمة في قسم الحريق (للمشرف / المدير)
-- شغّله في Supabase → SQL Editor → Run (مرة واحدة، آمن لو اتشغّل تاني)
-- لازم setup_fire_v2.sql يكون متشغّل قبله.
--
-- firing_restore(p_audit_id) بتتعامل مع سجل المراجعة:
--   • حذف شحنة / عملية  → بترجّع السجل بنفس رقمه وبياناته وأصنافه
--   • تعديل شحنة / عملية → بترجّع السجل للقيم اللي كانت قبل التعديل (لو ده آخر تعديل عليه)
-- كل استرجاع بيتسجّل في سجل المراجعة. صور العداد المحذوفة مش بترجع (ملفاتها اتمسحت).
-- =====================================================================

create or replace function public.firing_restore(p_audit_id bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  a public.firing_audit%rowtype; b jsonb; v_id bigint; v_cur jsonb; v_now jsonb;
  l public.firing_loads%rowtype; o public.firing_operations%rowtype;
  v_load bigint; v_el record;
begin
  perform set_config('mas.audit_skip', '1', true);
  if auth.uid() is null or (select public.is_owner()) or not (select public.firing_is_sup()) then raise exception 'not allowed'; end if;

  select * into a from public.firing_audit where id = p_audit_id;
  if not found then raise exception 'audit not found'; end if;
  if a.entity not in ('load', 'operation') or a.action not in ('delete', 'update') or a.before_data is null then
    raise exception 'not restorable';
  end if;
  b := a.before_data; v_id := a.entity_id;

  -- ===== شحنة =====
  if a.entity = 'load' then
    l := jsonb_populate_record(null::public.firing_loads, b - 'items');
    if a.action = 'delete' then
      if exists (select 1 from public.firing_loads where id = v_id) then raise exception 'already exists'; end if;
      if l.kiln_id is not null and not exists (select 1 from public.firing_kilns where id = l.kiln_id) then l.kiln_id := null; end if;
      l.id := v_id;
      insert into public.firing_loads values (l.*);
      v_cur := null;
    else
      if not exists (select 1 from public.firing_loads where id = v_id) then raise exception 'load not found'; end if;
      if exists (select 1 from public.firing_audit x where x.entity = a.entity and x.entity_id = a.entity_id and x.id > a.id) then raise exception 'not latest'; end if;
      v_cur := public.firing_snap_load(v_id);
      if l.kiln_id is not null and not exists (select 1 from public.firing_kilns where id = l.kiln_id) then l.kiln_id := null; end if;
      update public.firing_loads set cart_code = l.cart_code, loaded_at = l.loaded_at, worker = l.worker, note = l.note,
             kiln_id = l.kiln_id, status = l.status, total_qty = l.total_qty, approved_at = l.approved_at,
             approved_by = l.approved_by, approved_by_name = l.approved_by_name, updated_at = now(),
             updated_by_name = public.firing_user_name()
       where id = v_id;
      delete from public.firing_load_items where load_id = v_id;
    end if;
    insert into public.firing_load_items(load_id, item, qty, sort)
      select v_id, e.value->>'item', (e.value->>'qty')::integer, e.ord::smallint
        from jsonb_array_elements(coalesce(b->'items', '[]'::jsonb)) with ordinality as e(value, ord);
    v_now := public.firing_snap_load(v_id);
    perform public.firing_audit_log('load', v_id, case when a.action = 'delete' then 'insert' else 'update' end, v_cur, v_now,
      'استرجاع من سجل المراجعة #' || a.id);
    return v_id;
  end if;

  -- ===== عملية حريق =====
  o := jsonb_populate_record(null::public.firing_operations, b - 'items' - 'photos');
  v_load := o.load_id;
  if v_load is not null and (not exists (select 1 from public.firing_loads where id = v_load)
     or exists (select 1 from public.firing_operations where load_id = v_load and id <> v_id)) then
    v_load := null;   -- الشحنة اتحذفت أو اتربطت بعملية تانية: العملية ترجع مستقلة
  end if;
  if not exists (select 1 from public.firing_kilns where id = o.kiln_id) then raise exception 'kiln not found'; end if;
  o.load_id := v_load;
  if a.action = 'delete' then
    if exists (select 1 from public.firing_operations where id = v_id) then raise exception 'already exists'; end if;
    o.id := v_id; o.photo_count := 0; o.last_photo_at := null;
    insert into public.firing_operations values (o.*);
    v_cur := null;
  else
    if not exists (select 1 from public.firing_operations where id = v_id) then raise exception 'operation not found'; end if;
    if exists (select 1 from public.firing_audit x where x.entity = a.entity and x.entity_id = a.entity_id and x.id > a.id) then raise exception 'not latest'; end if;
    v_cur := public.firing_snap_op(v_id);
    update public.firing_operations set kiln_id = o.kiln_id, load_id = o.load_id, status = o.status, entered_at = o.entered_at,
           finished_at = o.finished_at, tubes_used = o.tubes_used, worker = o.worker, cart_code = o.cart_code, note = o.note,
           finished_by = o.finished_by, finished_by_name = o.finished_by_name, updated_at = now(),
           updated_by_name = public.firing_user_name()
     where id = v_id;
    delete from public.firing_operation_items where op_id = v_id;
  end if;
  insert into public.firing_operation_items(op_id, item, qty, sort)
    select v_id, e.value->>'item', (e.value->>'qty')::integer, e.ord::smallint
      from jsonb_array_elements(coalesce(b->'items', '[]'::jsonb)) with ordinality as e(value, ord);
  v_now := public.firing_snap_op(v_id);
  perform public.firing_audit_log('operation', v_id, case when a.action = 'delete' then 'insert' else 'update' end, v_cur, v_now,
    'استرجاع من سجل المراجعة #' || a.id || case when a.action = 'delete' and jsonb_array_length(coalesce(b->'photos', '[]'::jsonb)) > 0
      then ' (صور العداد ما رجعتش)' else '' end);
  return v_id;
exception when unique_violation then
  raise exception 'kiln busy';
end $$;
revoke all on function public.firing_restore(bigint) from public;
grant execute on function public.firing_restore(bigint) to authenticated;

-- =====================================================================
-- حذف جماعي للشحنات وعمليات الحريق القديمة قبل تاريخ معين (للمدير فقط)
--   p_dry = true  → معاينة (عدّ بس، من غير حذف)
--   بيحذف: الشحنات اللي وقت شحنها قبل التاريخ، وعمليات الحريق «المكتملة» اللي دخولها قبل التاريخ
--   (العمليات الجارية أو قيد التجهيز مش بتتحذف). عملية جديدة مربوطة بشحنة قديمة بتفضل (بتاخد أصناف الشحنة قبل فك الربط).
--   كل سجل بيتسجّل «حذف» في المراجعة (فتقدر تسترجعه، إلا صور العداد). بيرجّع مسارات الصور عشان البرنامج يمسح ملفاتها.
-- =====================================================================
create or replace function public.firing_purge_old(p_before date, p_dry boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cut timestamptz; r record; v_op public.firing_operations%rowtype; v_before jsonb; v_paths jsonb := '[]'::jsonb;
  v_nl integer := 0; v_no integer := 0;
begin
  perform set_config('mas.audit_skip', '1', true);
  if auth.uid() is null or (select public.is_owner()) or not (select public.firing_is_admin()) then raise exception 'not allowed'; end if;
  if p_before is null then raise exception 'date required'; end if;
  if p_before > (now() at time zone 'Africa/Cairo')::date - 7 then raise exception 'date too recent'; end if;
  v_cut := (p_before::timestamp) at time zone 'Africa/Cairo';

  if p_dry then
    select count(*) into v_nl from public.firing_loads where loaded_at < v_cut;
    select count(*) into v_no from public.firing_operations where status = 'done' and entered_at < v_cut;
    return jsonb_build_object('loads', v_nl, 'operations', v_no, 'dry', true);
  end if;

  -- 1) عمليات الحريق المكتملة القديمة
  for r in select id from public.firing_operations where status = 'done' and entered_at < v_cut order by id for update loop
    v_before := public.firing_snap_op(r.id) || jsonb_build_object('photos',
       coalesce((select jsonb_agg(jsonb_build_object('path', storage_path, 'taken_at', taken_at)) from public.firing_meter_photos where operation_id = r.id), '[]'::jsonb));
    v_paths := v_paths || coalesce((select jsonb_agg(storage_path) from public.firing_meter_photos where operation_id = r.id), '[]'::jsonb);
    update public.firing_meter_photos set replaces_id = null, replaced_by = null where operation_id = r.id;
    delete from public.firing_meter_photos where operation_id = r.id;
    delete from public.firing_operations where id = r.id;
    perform public.firing_audit_log('operation', r.id, 'delete', v_before, null, 'حذف جماعي للبيانات القديمة قبل ' || p_before);
    v_no := v_no + 1;
  end loop;

  -- 2) الشحنات القديمة (لو عليها عملية أحدث: العملية تفضل مستقلة وبتاخد أصناف الشحنة)
  for r in select id, cart_code from public.firing_loads where loaded_at < v_cut order by id for update loop
    v_before := public.firing_snap_load(r.id);
    select * into v_op from public.firing_operations where load_id = r.id for update;
    if found then
      if not exists (select 1 from public.firing_operation_items where op_id = v_op.id) then
        insert into public.firing_operation_items(op_id, item, qty, sort)
          select v_op.id, i.item, i.qty, i.sort from public.firing_load_items i where i.load_id = r.id;
      end if;
      update public.firing_operations set load_id = null, cart_code = coalesce(cart_code, r.cart_code), updated_at = now() where id = v_op.id;
    end if;
    delete from public.firing_loads where id = r.id;
    perform public.firing_audit_log('load', r.id, 'delete', v_before, null, 'حذف جماعي للبيانات القديمة قبل ' || p_before);
    v_nl := v_nl + 1;
  end loop;

  return jsonb_build_object('loads', v_nl, 'operations', v_no, 'paths', v_paths, 'dry', false);
end $$;
revoke all on function public.firing_purge_old(date, boolean) from public;
grant execute on function public.firing_purge_old(date, boolean) to authenticated;
