-- =====================================================================
-- setup_search.sql — البحث الشامل على السيرفر (أسرع)
-- نفّذه مرة واحدة في Supabase > SQL Editor > New query > Run
-- آمن: بيعمل دالتين جداد بس (مفيش حذف ولا تعديل لأي بيانات).
-- لو حصل أي خطأ فيها، البرنامج بيرجع تلقائيًا للطريقة القديمة.
-- مطلوب إن الـ views دي تكون موجودة عندك: glaze_lines_status / deco_lines_status / spray_status
-- =====================================================================

-- 1) تطبيع النص العربي (نفس دالة norm في البرنامج): حروف صغيرة، حذف التشكيل والتطويل، أ/إ/آ=ا، ة=ه، ى=ي
create or replace function public.mas_norm(t text)
returns text language sql immutable as $$
  select btrim(translate(
    regexp_replace(lower(coalesce(t, '')), '[\u064B-\u0652\u0640]', '', 'g'),
    'أإآةى', 'اااهي'))
$$;

-- 2) البحث عن صنف: بيرجع الصفوف المطابقة بس (بالفترة والأقسام) بدل ما البرنامج يسحب كل البيانات
--    p_mode: auto = لو الاسم مطابق بالظبط لصنف موجود يعرضه هو بس، غير كده كل الأصناف اللي فيها الكلمة
--            exact = المطابق بس | part = كل اللي فيها الكلمة
create or replace function public.search_item_report(
  p_q text,
  p_mode text default 'auto',
  p_from date default null,
  p_to date default null,
  p_secs text[] default null)
returns jsonb
language plpgsql stable security invoker
set search_path = public
as $$
declare
  q text := public.mas_norm(p_q);
begin
  return (
    with r as (
      -- الجليز: إنتاج
      select 'glaze'::text sec, 'p'::text kind, p.prod_date::date d,
             coalesce(nullif(o.item, ''), '—') item, coalesce(l.color::text, '') sub,
             coalesce(p.qty, 0)::numeric qty, coalesce(to_jsonb(p)->>'worker', '') w,
             concat_ws(' · ', nullif(to_jsonb(p)->>'design', ''), nullif(to_jsonb(p)->>'note', '')) n,
             null::numeric good
        from public.glaze_production p
        left join public.glaze_lines_status l on l.id = p.line_id
        left join public.glaze_orders o on o.id = l.order_id
       where p_secs is null or 'glaze' = any(p_secs)
      union all
      -- الجليز: هالك
      select 'glaze', 'w', w.waste_date::date,
             coalesce(nullif(to_jsonb(w)->>'item', ''), nullif(o.item, ''), '-'), '',
             coalesce(w.qty, 0)::numeric, '', '',
             coalesce(nullif(to_jsonb(w)->>'good_qty', '')::numeric, 0)
        from public.glaze_waste w
        left join public.glaze_orders o on o.id::text = to_jsonb(w)->>'order_id'
       where p_secs is null or 'glaze' = any(p_secs)
      union all
      -- الزخرفة: إنتاج
      select 'deco', 'p', p.prod_date::date,
             coalesce(nullif(o.item, ''), '—'), coalesce(l.code::text, ''),
             coalesce(p.qty, 0)::numeric, coalesce(to_jsonb(p)->>'worker', ''),
             concat_ws(' · ', nullif(to_jsonb(p)->>'design', ''), nullif(to_jsonb(p)->>'note', '')),
             null::numeric
        from public.deco_production p
        left join public.deco_lines_status l on l.id = p.line_id
        left join public.deco_orders o on o.id = l.order_id
       where p_secs is null or 'deco' = any(p_secs)
      union all
      -- الرش: إنتاج
      select 'spray', 'p', p.prod_date::date,
             coalesce(nullif(s.item, ''), '—'), coalesce(to_jsonb(p)->>'spray_color', ''),
             coalesce(p.qty, 0)::numeric, coalesce(to_jsonb(p)->>'worker', ''),
             coalesce(to_jsonb(p)->>'note', ''), null::numeric
        from public.spray_production p
        left join public.spray_status s on s.id = p.order_id
       where p_secs is null or 'spray' = any(p_secs)
      union all
      -- الإنتاج بدون طلبية (جليز / زخرفة / رش)
      select x.section, 'p', x.prod_date::date,
             coalesce(nullif(x.item, ''), '—'),
             coalesce(case when x.section = 'spray' then to_jsonb(x)->>'spray_color' else x.sub end, ''),
             coalesce(x.qty, 0)::numeric, coalesce(x.worker, ''), coalesce(x.note, ''), null::numeric
        from public.free_production x
       where p_secs is null or x.section = any(p_secs)
      union all
      -- التصليح
      select 'repair', 'p', r.repair_date::date,
             coalesce(nullif(r.item, ''), 'بدون صنف'), '',
             coalesce(r.qty, 0)::numeric, '', '', null::numeric
        from public.repair_log r
       where p_secs is null or 'repair' = any(p_secs)
    ),
    nm as (select distinct public.mas_norm(item) n from r),
    md as (
      select case
        when q = '' then 'part'
        when p_mode in ('exact', 'part') then p_mode
        when exists (select 1 from nm where n = q) then 'exact'
        else 'part' end m
    ),
    f as (
      select r.* from r, md
       where (p_from is null or r.d >= p_from)
         and (p_to is null or r.d <= p_to)
         and (q = '' or case when md.m = 'exact'
                             then public.mas_norm(r.item) = q
                             else position(q in public.mas_norm(r.item)) > 0 end)
    )
    select jsonb_build_object(
      'mode', (select m from md),
      'exact_exists', (q <> '' and exists (select 1 from nm where n = q)),
      'others', (select count(*) from nm where q <> '' and n <> q and position(q in n) > 0),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
                  's', sec, 'k', kind, 'd', d, 'item', item, 'sub', sub,
                  'qty', qty, 'w', w, 'n', n, 'good', good) order by d desc) from f), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.search_item_report(text, text, date, date, text[]) from public;
grant execute on function public.search_item_report(text, text, date, date, text[]) to authenticated;
grant execute on function public.mas_norm(text) to authenticated;

-- اختبار سريع (اختياري): بيرجع ملخص لكل الأصناف
-- select jsonb_array_length(public.search_item_report('', 'auto', null, null, null)->'rows');
