-- =====================================================================
-- setup_fire_v2.sql — تطوير قسم الحريق والشحن (الإصدار 4.6.0)
-- شغّله مرة واحدة من Supabase -> SQL Editor -> New query -> Run (آمن لو اتشغّل أكتر من مرة).
-- شرطه: setup_firing.sql (و setup_v2 / setup_security / setup_roles_v2) يكونوا اتشغّلوا قبله.
--
-- اللي بيعمله (من غير ما يمسح أي بيانات أو يغيّر أسماء جداول/أعمدة قديمة):
--  1) إصلاح خطأ  profiles_section_check  (قيد قيم القسم)
--  2) عمود profiles.fire_role = تخصص عامل الحريق (5 تخصصات)
--  3) نوع الفرن (بسكوت/جليز) + منع ربط شحنة/حريق بفرن من نوع مختلف
--  4) فصل الحريق عن الشحن: العملية تتسجل من غير عربية شحن، ولها أصنافها الخاصة
--  5) دوال الحفظ/التعديل/الحذف الجديدة (للمشرف تعديل وحذف أي سجل قديم من غير قفل بانتهاء اليوم)
--  6) سجل مراجعة firing_audit (مين أضاف/عدّل/حذف + البيانات قبل وبعد)
-- =====================================================================

-- ---------- 1) إصلاح profiles_section_check ----------
-- القيد القديم كان بيقبل قائمة ثابتة من الأقسام (وغالبًا ما فيهاش 'fire' / 'brush' اللي اتضافوا بعد إنشائه)،
-- فأي حفظ لعامل في قسم الحريق كان بيفشل. بنطبع التعريف القديم في الـ Notices عشان تراجعه، وبنبدّله بقيد عام
-- (حروف إنجليزية صغيرة فقط) فمفيش قسم جديد هيكسره تاني. التحقق من أسماء الأقسام بيتم في البرنامج.
do $$
declare c record;
begin
  for c in
    select conname, pg_get_constraintdef(oid) as def
      from pg_constraint
     where conrelid = 'public.profiles'::regclass and contype = 'c'
       and (conname in ('profiles_section_check', 'profiles_sections_check')
            or (pg_get_constraintdef(oid) ~* 'section' and pg_get_constraintdef(oid) !~* 'role'))
  loop
    raise notice 'القيد القديم اتشال: % => %', c.conname, c.def;
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;

  alter table public.profiles add constraint profiles_section_check
    check (section is null or section ~ '^[a-z][a-z0-9_]{1,30}$') not valid;
  begin
    alter table public.profiles validate constraint profiles_section_check;
  exception when others then
    raise notice 'فيه صفوف قديمة مش مطابقة للقيد الجديد (القيد شغّال على الجديد بس): %', sqlerrm;
  end;
end $$;

-- ---------- 2) تخصص عامل الحريق ----------
alter table public.profiles add column if not exists fire_role text;
alter table public.profiles drop constraint if exists profiles_fire_role_check;
alter table public.profiles add constraint profiles_fire_role_check
  check (fire_role is null or fire_role in ('biscuit_kiln','glaze_kiln','biscuit_loader','glaze_loader','fire_supervisor'));

-- دوال الصلاحيات
create or replace function public.firing_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.active, true) and p.role = 'admin');
$$;
revoke all on function public.firing_is_admin() from public;
grant execute on function public.firing_is_admin() to authenticated;

-- المشرف: المدير، أو مسؤول قسم الحريق، أو صاحب تخصص «مشرف قسم الحريق»
create or replace function public.firing_is_sup() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and coalesce(p.active, true) and p.role is not null and p.role <> 'owner'
       and ( p.role = 'admin'
          or (p.role = 'manager' and (p.section = 'fire' or 'fire' = any (coalesce(p.sections, '{}'::text[]))))
          or (p.fire_role = 'fire_supervisor' and (p.section = 'fire' or 'fire' = any (coalesce(p.sections, '{}'::text[])))) ));
$$;
revoke all on function public.firing_is_sup() from public;
grant execute on function public.firing_is_sup() to authenticated;

-- p_action: 'ship' (شحن) | 'fire' (حريق) ، p_kind: biscuit | glaze
-- • صاحب المصنع: لا (عرض فقط)   • المشرف: كل شيء   • المتخصص: مهمته ونوعه فقط
-- • عامل في قسم الحريق بدون تخصص (حساب قديم): بيفضل زي ما كان (يسجّل الكل) لحد ما المدير يحدد تخصصه
create or replace function public.firing_can(p_action text, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when (select public.is_owner()) then false
    when (select public.firing_is_sup()) then true
    else coalesce((
      select (p.section = 'fire' or 'fire' = any (coalesce(p.sections, '{}'::text[])))
         and ( nullif(p.fire_role, '') is null
            or (p_action = 'fire' and p.fire_role = p_kind || '_kiln')
            or (p_action = 'ship' and p.fire_role = p_kind || '_loader') )
        from public.profiles p where p.id = auth.uid() and coalesce(p.active, true)), false)
  end;
$$;
revoke all on function public.firing_can(text, text) from public;
grant execute on function public.firing_can(text, text) to authenticated;

-- «اليوم» بتوقيت القاهرة (المتخصص يعدّل سجلاته هو في نفس اليوم بس؛ المشرف من غير قيد)
create or replace function public.firing_same_day(p_ts timestamptz) returns boolean
language sql stable as $$
  select (p_ts at time zone 'Africa/Cairo')::date = (now() at time zone 'Africa/Cairo')::date;
$$;

-- منع تغيير التخصص إلا للمدير
create or replace function public.firing_guard_fire_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and tg_op = 'UPDATE' and new.fire_role is distinct from old.fire_role
     and not (select public.firing_is_admin()) then
    raise exception 'not allowed';
  end if;
  if auth.uid() is not null and tg_op = 'INSERT' and new.fire_role is not null
     and not (select public.firing_is_admin()) then
    raise exception 'not allowed';
  end if;
  return new;
end $$;
drop trigger if exists firing_guard_fire_role_trg on public.profiles;
create trigger firing_guard_fire_role_trg before insert or update on public.profiles
  for each row execute function public.firing_guard_fire_role();

-- ---------- 3) نوع الفرن + الربط ----------
alter table public.firing_kilns add column if not exists kind text;
alter table public.firing_kilns drop constraint if exists firing_kilns_kind_chk;
alter table public.firing_kilns add constraint firing_kilns_kind_chk check (kind is null or kind in ('biscuit','glaze'));
-- الأفران القديمة: لو كل عملياتها السابقة من نوع واحد نحدد نوعها تلقائي. غير كده بتفضل «غير محدد» والمدير يحدده
update public.firing_kilns k set kind = x.kind
  from (select kiln_id, min(kind) as kind from public.firing_operations group by kiln_id having count(distinct kind) = 1) x
 where x.kiln_id = k.id and k.kind is null;

alter table public.firing_loads add column if not exists kiln_id bigint references public.firing_kilns(id) on delete restrict;
alter table public.firing_loads add column if not exists updated_by_name text;

-- ---------- 4) فصل الحريق عن الشحن ----------
alter table public.firing_operations alter column load_id drop not null;     -- الربط بالشحنة بقى اختياري (للتتبع فقط)
alter table public.firing_operations add column if not exists cart_code text;
alter table public.firing_operations add column if not exists note text;
alter table public.firing_operations add column if not exists updated_by_name text;
alter table public.firing_operations drop constraint if exists firing_ops_cart_chk;
alter table public.firing_operations add constraint firing_ops_cart_chk check (cart_code is null or char_length(cart_code) <= 60);
alter table public.firing_operations drop constraint if exists firing_ops_note_chk;
alter table public.firing_operations add constraint firing_ops_note_chk check (note is null or char_length(note) <= 300);

create table if not exists public.firing_operation_items (
  id      bigint generated by default as identity primary key,
  op_id   bigint  not null references public.firing_operations(id) on delete cascade,
  item    text    not null check (char_length(btrim(item)) between 1 and 120),
  qty     integer not null check (qty > 0 and qty <= 1000000),
  sort    smallint not null default 0
);
create index if not exists firing_op_items_op_idx on public.firing_operation_items (op_id);

-- مطابقة نوع الفرن / نوع الشحنة (على مستوى الجدول: بتغطي أي مسار كتابة قديم أو جديد)
create or replace function public.firing_enforce_kind() returns trigger
language plpgsql set search_path = public as $$
declare kk text; lk text;
begin
  if new.kiln_id is not null then
    select kind into kk from public.firing_kilns where id = new.kiln_id;
    if kk is not null and kk <> new.kind then raise exception 'kiln kind mismatch'; end if;
  end if;
  -- ملاحظة: لازم IF متداخلة؛ لأن new.load_id مش موجود في firing_loads و plpgsql بيقيّم الشرط كله
  if tg_table_name = 'firing_operations' then
    if new.load_id is not null then
      select kind into lk from public.firing_loads where id = new.load_id;
      if lk is not null and lk <> new.kind then raise exception 'load kind mismatch'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists firing_enforce_kind_trg on public.firing_operations;
create trigger firing_enforce_kind_trg before insert or update of kiln_id, kind, load_id on public.firing_operations
  for each row execute function public.firing_enforce_kind();
drop trigger if exists firing_enforce_kind_trg on public.firing_loads;
create trigger firing_enforce_kind_trg before insert or update of kiln_id, kind on public.firing_loads
  for each row execute function public.firing_enforce_kind();

-- صلاحية الكتابة حسب التخصص على مستوى الجدول
create or replace function public.firing_enforce_perm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_table_name = 'firing_operations' then
    if not (select public.firing_can('fire', coalesce(new.kind, old.kind))) then raise exception 'not allowed'; end if;
  else
    if not (select public.firing_can('ship', coalesce(new.kind, old.kind))) then raise exception 'not allowed'; end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists firing_enforce_perm_trg on public.firing_operations;
create trigger firing_enforce_perm_trg before insert or update or delete on public.firing_operations
  for each row execute function public.firing_enforce_perm();
drop trigger if exists firing_enforce_perm_trg on public.firing_loads;
create trigger firing_enforce_perm_trg before insert or update or delete on public.firing_loads
  for each row execute function public.firing_enforce_perm();

-- ---------- 5) سجل المراجعة ----------
create table if not exists public.firing_audit (
  id          bigint generated by default as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid default auth.uid(),
  user_name   text,
  entity      text not null check (entity in ('load','operation','kiln','photo')),
  entity_id   bigint,
  action      text not null check (action in ('insert','update','delete')),
  before_data jsonb,
  after_data  jsonb,
  summary     text
);
create index if not exists firing_audit_ent_idx on public.firing_audit (entity, entity_id, at desc);
create index if not exists firing_audit_at_idx  on public.firing_audit (at desc);

create or replace function public.firing_audit_log(p_entity text, p_id bigint, p_action text, p_before jsonb, p_after jsonb, p_summary text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.firing_audit(user_id, user_name, entity, entity_id, action, before_data, after_data, summary)
  values (auth.uid(), public.firing_user_name(), p_entity, p_id, p_action, p_before, p_after, p_summary);
end $$;
revoke all on function public.firing_audit_log(text, bigint, text, jsonb, jsonb, text) from public;

-- تسجيل تلقائي لأي تغيير جاي من الدوال القديمة (الدوال الجديدة بتسجّل بنفسها ببيانات أغنى وبتعطّل ده)
create or replace function public.firing_audit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ent text := case when tg_table_name = 'firing_loads' then 'load' else 'operation' end;
begin
  if coalesce(current_setting('mas.audit_skip', true), '') = '1' then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then perform public.firing_audit_log(v_ent, new.id, 'insert', null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    if to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
      perform public.firing_audit_log(v_ent, new.id, 'update', to_jsonb(old), to_jsonb(new));
    end if;
  else perform public.firing_audit_log(v_ent, old.id, 'delete', to_jsonb(old), null);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists firing_audit_trg on public.firing_loads;
create trigger firing_audit_trg after insert or update or delete on public.firing_loads for each row execute function public.firing_audit_trg();
drop trigger if exists firing_audit_trg on public.firing_operations;
create trigger firing_audit_trg after insert or update or delete on public.firing_operations for each row execute function public.firing_audit_trg();

-- لقطات (snapshots) للمراجعة
create or replace function public.firing_snap_load(p_id bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(l) || jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('item', i.item, 'qty', i.qty) order by i.sort, i.id)
         from public.firing_load_items i where i.load_id = l.id), '[]'::jsonb))
    from public.firing_loads l where l.id = p_id;
$$;
create or replace function public.firing_snap_op(p_id bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(o) || jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object('item', i.item, 'qty', i.qty) order by i.sort, i.id)
         from public.firing_operation_items i where i.op_id = o.id), '[]'::jsonb))
    from public.firing_operations o where o.id = p_id;
$$;
revoke all on function public.firing_snap_load(bigint) from public;
revoke all on function public.firing_snap_op(bigint) from public;

-- ---------- RLS (قراءة) للجداول الجديدة + تعديل سياسة القراءة ----------
alter table public.firing_operation_items enable row level security;
alter table public.firing_audit enable row level security;
revoke all on public.firing_operation_items from anon;
revoke insert, update, delete on public.firing_operation_items from authenticated;
grant select on public.firing_operation_items to authenticated;
drop policy if exists fire_select on public.firing_operation_items;
create policy fire_select on public.firing_operation_items for select to authenticated
  using ((select public.can_section('fire')) or (select public.can_view_all()));

revoke all on public.firing_audit from anon;
revoke insert, update, delete on public.firing_audit from authenticated;
grant select on public.firing_audit to authenticated;
drop policy if exists fire_audit_select on public.firing_audit;
create policy fire_audit_select on public.firing_audit for select to authenticated
  using ((select public.firing_is_sup()) or (select public.is_owner()) or (select public.can_view_all()));

-- المشرف (حتى لو دوره «مسجّل إنتاج») يقدر يقرأ الحريق
create or replace function public.firing_can_edit_row(p_creator uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select public.firing_is_sup()) or p_creator = auth.uid();
$$;

-- ---------- 6) الأفران (مع النوع) ----------
drop function if exists public.firing_save_kiln(bigint, text, text, boolean);
create or replace function public.firing_save_kiln(p_id bigint, p_name text, p_note text, p_active boolean, p_kind text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_name text := btrim(coalesce(p_name, '')); v_old public.firing_kilns%rowtype; v_before jsonb;
begin
  perform set_config('mas.audit_skip', '1', true);
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if (select public.is_owner()) then raise exception 'owner read only'; end if;
  if not (select public.firing_is_sup()) then raise exception 'not allowed'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then raise exception 'invalid kiln name'; end if;
  if p_kind is not null and p_kind not in ('biscuit','glaze') then raise exception 'invalid kind'; end if;
  if p_id is null then
    if p_kind is null then raise exception 'kiln kind required'; end if;
    insert into public.firing_kilns(name, note, active, kind)
    values (v_name, nullif(btrim(coalesce(p_note,'')), ''), coalesce(p_active, true), p_kind) returning id into v_id;
    perform public.firing_audit_log('kiln', v_id, 'insert', null, (select to_jsonb(k) from public.firing_kilns k where k.id = v_id));
  else
    select * into v_old from public.firing_kilns where id = p_id for update;
    if not found then raise exception 'kiln not found'; end if;
    v_before := to_jsonb(v_old);
    if p_active is false and exists (select 1 from public.firing_operations where kiln_id = p_id and status = 'in_kiln') then
      raise exception 'kiln busy';
    end if;
    if p_kind is not null and v_old.kind is not null and p_kind <> v_old.kind
       and (exists (select 1 from public.firing_operations where kiln_id = p_id) or exists (select 1 from public.firing_loads where kiln_id = p_id)) then
      raise exception 'kiln has history';
    end if;
    update public.firing_kilns set name = v_name, note = nullif(btrim(coalesce(p_note,'')), ''), active = coalesce(p_active, true),
           kind = coalesce(p_kind, kind)
     where id = p_id returning id into v_id;
    perform public.firing_audit_log('kiln', v_id, 'update', v_before, (select to_jsonb(k) from public.firing_kilns k where k.id = v_id));
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'kiln name exists';
end $$;
revoke all on function public.firing_save_kiln(bigint, text, text, boolean, text) from public;
grant execute on function public.firing_save_kiln(bigint, text, text, boolean, text) to authenticated;

-- ---------- 7) الشحن: إنشاء / تعديل (من غير أي شرط على الحريق) ----------
create or replace function public.firing_ship_save(
  p_id bigint, p_kind text, p_cart text, p_at timestamptz, p_worker text, p_note text, p_items jsonb, p_kiln bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint; v_row public.firing_loads%rowtype; v_kind text; v_cart text := btrim(coalesce(p_cart, ''));
  v_at timestamptz := coalesce(p_at, now()); v_el jsonb; v_name text; v_qty integer; v_total integer := 0; v_n integer := 0;
  v_sum jsonb := '{}'::jsonb; v_me text := public.firing_user_name(); v_before jsonb; kk text;
begin
  perform set_config('mas.audit_skip', '1', true);
  if auth.uid() is null or (select public.is_owner()) then raise exception 'owner read only'; end if;
  if p_id is not null then
    select * into v_row from public.firing_loads where id = p_id for update;
    if not found then raise exception 'load not found'; end if;
    v_kind := v_row.kind;
    if not ((select public.firing_is_sup())
        or (v_row.created_by = auth.uid() and (select public.firing_can('ship', v_kind)) and public.firing_same_day(v_row.created_at))) then
      raise exception 'not allowed';
    end if;
    v_before := public.firing_snap_load(p_id);
  else
    v_kind := p_kind;
    if v_kind not in ('biscuit','glaze') then raise exception 'invalid kind'; end if;
    if not (select public.firing_can('ship', v_kind)) then raise exception 'not allowed'; end if;
  end if;
  if char_length(v_cart) < 1 or char_length(v_cart) > 60 then raise exception 'cart code required'; end if;
  if v_at > now() + interval '10 minutes' then raise exception 'future time'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 60 then
    raise exception 'items required';
  end if;
  if p_kiln is not null then
    select kind into kk from public.firing_kilns where id = p_kiln and active;
    if not found then raise exception 'kiln not found'; end if;
    if kk is null then raise exception 'kiln kind unset'; end if;
    if kk <> v_kind then raise exception 'kiln kind mismatch'; end if;
  end if;
  for v_el in select * from jsonb_array_elements(p_items) loop
    begin v_qty := (v_el->>'qty')::integer; exception when others then raise exception 'invalid qty'; end;
    if v_qty is null or v_qty < 1 or v_qty > 1000000 then raise exception 'invalid qty'; end if;
    v_name := null;
    select c.name into v_name from public.catalog c
     where c.kind = 'item' and lower(btrim(c.name)) = lower(btrim(coalesce(v_el->>'item', ''))) limit 1;
    if v_name is null then raise exception 'unknown item'; end if;
    v_sum := jsonb_set(v_sum, array[v_name], to_jsonb(coalesce((v_sum->>v_name)::integer, 0) + v_qty));
  end loop;

  if p_id is null then
    insert into public.firing_loads(kind, cart_code, loaded_at, worker, note, kiln_id, status, approved_at, approved_by, approved_by_name, created_by_name)
    values (v_kind, v_cart, v_at, nullif(btrim(coalesce(p_worker,'')), ''), nullif(btrim(coalesce(p_note,'')), ''), p_kiln,
            'approved', now(), auth.uid(), v_me, v_me)
    returning id into v_id;
  else
    v_id := p_id;
    update public.firing_loads set cart_code = v_cart, loaded_at = v_at, worker = nullif(btrim(coalesce(p_worker,'')), ''),
           note = nullif(btrim(coalesce(p_note,'')), ''), kiln_id = p_kiln, updated_at = now(), updated_by_name = v_me
     where id = v_id;
    delete from public.firing_load_items where load_id = v_id;
  end if;
  for v_name in select jsonb_object_keys(v_sum) loop
    v_n := v_n + 1;
    insert into public.firing_load_items(load_id, item, qty, sort) values (v_id, v_name, (v_sum->>v_name)::integer, v_n);
    v_total := v_total + (v_sum->>v_name)::integer;
  end loop;
  update public.firing_loads set total_qty = v_total where id = v_id;
  perform public.firing_audit_log('load', v_id, case when p_id is null then 'insert' else 'update' end, v_before, public.firing_snap_load(v_id));
  return v_id;
end $$;
revoke all on function public.firing_ship_save(bigint, text, text, timestamptz, text, text, jsonb, bigint) from public;
grant execute on function public.firing_ship_save(bigint, text, text, timestamptz, text, text, jsonb, bigint) to authenticated;

-- حذف شحنة (للمشرف). لو فيه عملية حريق مرتبطة بيها: العملية بتفضل زي ما هي (بنحفظ لها أصنافها ورقم عربيتها قبل فك الربط)
create or replace function public.firing_ship_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_row public.firing_loads%rowtype; v_op public.firing_operations%rowtype; v_before jsonb;
begin
  perform set_config('mas.audit_skip', '1', true);
  if auth.uid() is null or (select public.is_owner()) or not (select public.firing_is_sup()) then raise exception 'not allowed'; end if;
  select * into v_row from public.firing_loads where id = p_id for update;
  if not found then raise exception 'load not found'; end if;
  v_before := public.firing_snap_load(p_id);
  select * into v_op from public.firing_operations where load_id = p_id for update;
  if found then
    if not exists (select 1 from public.firing_operation_items where op_id = v_op.id) then
      insert into public.firing_operation_items(op_id, item, qty, sort)
        select v_op.id, i.item, i.qty, i.sort from public.firing_load_items i where i.load_id = p_id;
    end if;
    update public.firing_operations set load_id = null, cart_code = coalesce(cart_code, v_row.cart_code), updated_at = now() where id = v_op.id;
  end if;
  delete from public.firing_loads where id = p_id;
  perform public.firing_audit_log('load', p_id, 'delete', v_before, null,
    case when v_op.id is not null then 'عملية الحريق #' || v_op.id || ' فضلت محفوظة ومستقلة' else null end);
end $$;
revoke all on function public.firing_ship_delete(bigint) from public;
grant execute on function public.firing_ship_delete(bigint) to authenticated;

-- ---------- 8) الحريق: إنشاء / تعديل (من غير شرط وجود شحنة أو عربية) ----------
-- الحالة بتتحدد من المواعيد: من غير دخول = قيد التجهيز | دخول بدون إطفاء = داخل الفرن | دخول وإطفاء = مكتملة (محتاجة عدد الأنابيب)
create or replace function public.firing_fire_save(
  p_id bigint, p_kind text, p_kiln bigint, p_cart text, p_entered timestamptz, p_finished timestamptz, p_tubes integer,
  p_worker text, p_note text, p_items jsonb, p_load bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint; v_row public.firing_operations%rowtype; v_kind text; v_before jsonb; kk text; v_ld public.firing_loads%rowtype;
  v_w text := btrim(coalesce(p_worker, '')); v_cart text := nullif(btrim(coalesce(p_cart, '')), '');
  v_status text; v_el jsonb; v_name text; v_qty integer; v_sum jsonb := '{}'::jsonb; v_n integer := 0; v_me text := public.firing_user_name();
begin
  perform set_config('mas.audit_skip', '1', true);
  if auth.uid() is null or (select public.is_owner()) then raise exception 'owner read only'; end if;
  if p_id is not null then
    select * into v_row from public.firing_operations where id = p_id for update;
    if not found then raise exception 'operation not found'; end if;
    v_kind := v_row.kind;
    if not ((select public.firing_is_sup())
        or (v_row.created_by = auth.uid() and (select public.firing_can('fire', v_kind)) and public.firing_same_day(v_row.created_at))) then
      raise exception 'not allowed';
    end if;
    v_before := public.firing_snap_op(p_id);
  else
    v_kind := p_kind;
    if v_kind not in ('biscuit','glaze') then raise exception 'invalid kind'; end if;
    if not (select public.firing_can('fire', v_kind)) then raise exception 'not allowed'; end if;
  end if;
  if char_length(v_w) < 1 or char_length(v_w) > 80 then raise exception 'worker required'; end if;
  if v_cart is not null and char_length(v_cart) > 60 then raise exception 'cart code required'; end if;
  select kind into kk from public.firing_kilns where id = p_kiln and (active or (p_id is not null and v_row.kiln_id = p_kiln));
  if not found then raise exception 'kiln not found'; end if;
  if kk is null then raise exception 'kiln kind unset'; end if;
  if kk <> v_kind then raise exception 'kiln kind mismatch'; end if;
  if p_load is not null then
    select * into v_ld from public.firing_loads where id = p_load;
    if not found then raise exception 'load not found'; end if;
    if v_ld.kind <> v_kind then raise exception 'load kind mismatch'; end if;
  end if;
  if p_entered is not null and p_entered > now() + interval '10 minutes' then raise exception 'future time'; end if;
  if p_finished is not null then
    if p_entered is null then raise exception 'not entered'; end if;
    if p_finished > now() + interval '10 minutes' then raise exception 'future time'; end if;
    if p_finished < p_entered then raise exception 'finish before entry'; end if;
    if p_tubes is null or p_tubes < 0 or p_tubes > 100000 then raise exception 'invalid tubes'; end if;
  end if;
  v_status := case when p_entered is null then 'preparing' when p_finished is null then 'in_kiln' else 'done' end;
  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    if jsonb_array_length(p_items) > 60 then raise exception 'items required'; end if;
    for v_el in select * from jsonb_array_elements(p_items) loop
      begin v_qty := (v_el->>'qty')::integer; exception when others then raise exception 'invalid qty'; end;
      if v_qty is null or v_qty < 1 or v_qty > 1000000 then raise exception 'invalid qty'; end if;
      v_name := null;
      select c.name into v_name from public.catalog c
       where c.kind = 'item' and lower(btrim(c.name)) = lower(btrim(coalesce(v_el->>'item', ''))) limit 1;
      if v_name is null then raise exception 'unknown item'; end if;
      v_sum := jsonb_set(v_sum, array[v_name], to_jsonb(coalesce((v_sum->>v_name)::integer, 0) + v_qty));
    end loop;
  end if;

  if p_id is null then
    insert into public.firing_operations(kind, load_id, kiln_id, status, entered_at, finished_at, tubes_used, worker, cart_code, note,
                                         created_by_name, finished_by, finished_by_name)
    values (v_kind, p_load, p_kiln, v_status, p_entered, p_finished, case when v_status = 'done' then p_tubes end, v_w, v_cart,
            nullif(btrim(coalesce(p_note,'')), ''), v_me,
            case when v_status = 'done' then auth.uid() end, case when v_status = 'done' then v_me end)
    returning id into v_id;
  else
    v_id := p_id;
    update public.firing_operations set
        kiln_id = p_kiln, load_id = p_load, status = v_status, entered_at = p_entered, finished_at = p_finished,
        tubes_used = case when v_status = 'done' then p_tubes end, worker = v_w, cart_code = v_cart,
        note = nullif(btrim(coalesce(p_note,'')), ''), updated_at = now(), updated_by_name = v_me,
        finished_by = case when v_status = 'done' then coalesce(finished_by, auth.uid()) end,
        finished_by_name = case when v_status = 'done' then coalesce(finished_by_name, v_me) end
      where id = v_id;
    delete from public.firing_operation_items where op_id = v_id;
  end if;
  for v_name in select jsonb_object_keys(v_sum) loop
    v_n := v_n + 1;
    insert into public.firing_operation_items(op_id, item, qty, sort) values (v_id, v_name, (v_sum->>v_name)::integer, v_n);
  end loop;
  perform public.firing_audit_log('operation', v_id, case when p_id is null then 'insert' else 'update' end, v_before, public.firing_snap_op(v_id));
  return v_id;
exception when unique_violation then
  if sqlerrm ilike '%load%' then raise exception 'load already fired'; end if;
  raise exception 'kiln busy';
end $$;
revoke all on function public.firing_fire_save(bigint, text, bigint, text, timestamptz, timestamptz, integer, text, text, jsonb, bigint) from public;
grant execute on function public.firing_fire_save(bigint, text, bigint, text, timestamptz, timestamptz, integer, text, text, jsonb, bigint) to authenticated;

-- حذف عملية حريق كاملة (للمشرف). مبيمسحش الشحنة المرتبطة بيها. بيرجّع مسارات صور العداد عشان البرنامج يمسح ملفاتها
create or replace function public.firing_fire_delete(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row public.firing_operations%rowtype; v_before jsonb; v_paths jsonb;
begin
  perform set_config('mas.audit_skip', '1', true);
  if auth.uid() is null or (select public.is_owner()) or not (select public.firing_is_sup()) then raise exception 'not allowed'; end if;
  select * into v_row from public.firing_operations where id = p_id for update;
  if not found then raise exception 'operation not found'; end if;
  v_before := public.firing_snap_op(p_id) || jsonb_build_object('photos',
     coalesce((select jsonb_agg(jsonb_build_object('path', storage_path, 'taken_at', taken_at)) from public.firing_meter_photos where operation_id = p_id), '[]'::jsonb));
  select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into v_paths from public.firing_meter_photos where operation_id = p_id;
  update public.firing_meter_photos set replaces_id = null, replaced_by = null where operation_id = p_id;
  delete from public.firing_meter_photos where operation_id = p_id;
  delete from public.firing_operations where id = p_id;
  perform public.firing_audit_log('operation', p_id, 'delete', v_before, null);
  return v_paths;
end $$;
revoke all on function public.firing_fire_delete(bigint) from public;
grant execute on function public.firing_fire_delete(bigint) to authenticated;

-- صور العداد: لازم صلاحية «حريق» لنوع العملية (التخصص)
create or replace function public.firing_add_photo(p_op bigint, p_path text, p_size integer, p_replaces bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_op public.firing_operations%rowtype; v_id bigint; v_old public.firing_meter_photos%rowtype;
begin
  perform public.firing_assert_write();
  select * into v_op from public.firing_operations where id = p_op for update;
  if not found then raise exception 'operation not found'; end if;
  if not (select public.firing_can('fire', v_op.kind)) then raise exception 'not allowed'; end if;
  if v_op.status = 'preparing' then raise exception 'not entered'; end if;
  if v_op.status = 'done' and p_replaces is null then raise exception 'operation finished'; end if;
  if p_path is null or p_path !~ ('^' || p_op::text || '/[A-Za-z0-9._-]{1,120}$') then raise exception 'invalid path'; end if;
  if p_replaces is not null then
    select * into v_old from public.firing_meter_photos where id = p_replaces for update;
    if not found or v_old.operation_id <> p_op then raise exception 'photo not found'; end if;
    if v_old.replaced_by is not null then raise exception 'photo already replaced'; end if;
  end if;
  insert into public.firing_meter_photos(operation_id, storage_path, size_bytes, uploaded_by_name, replaces_id)
  values (p_op, p_path, p_size, public.firing_user_name(), p_replaces) returning id into v_id;
  if p_replaces is not null then
    update public.firing_meter_photos set replaced_by = v_id where id = p_replaces;
  end if;
  update public.firing_operations o
     set photo_count = (select count(*) from public.firing_meter_photos x where x.operation_id = p_op and x.replaced_by is null),
         last_photo_at = (select max(x.taken_at) from public.firing_meter_photos x where x.operation_id = p_op),
         updated_at = now()
   where o.id = p_op;
  perform public.firing_audit_log('photo', v_id, 'insert', null, jsonb_build_object('operation_id', p_op, 'path', p_path, 'replaces', p_replaces));
  return v_id;
end $$;
revoke all on function public.firing_add_photo(bigint, text, integer, bigint) from public;
grant execute on function public.firing_add_photo(bigint, text, integer, bigint) to authenticated;

-- المشرف يقدر يمسح ملفات صور عمليات اتحذفت
do $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  drop policy if exists firing_meters_delete_sup on storage.objects;
  create policy firing_meters_delete_sup on storage.objects for delete to authenticated
    using (bucket_id = 'firing-meters' and (select public.firing_is_sup()));
end $$;

notify pgrst, 'reload schema';

-- ============ فحص بعد التشغيل (اختياري) ============
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.profiles'::regclass and contype='c';
-- select id, name, kind from public.firing_kilns;            -- الأفران اللي kind فاضي لازم تحدد نوعها من «إدارة الأفران»
-- select * from public.firing_audit order by at desc limit 20;
