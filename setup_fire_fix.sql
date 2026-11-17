-- =====================================================================
-- setup_fire_fix.sql — إصلاح خطأ: record "new" has no field "load_id"
-- السبب: دالة مطابقة نوع الفرن/الشحنة كانت بتقرأ new.load_id حتى على جدول الشحن (firing_loads) وهو مفيهوش العمود ده.
-- شغّله مرة واحدة من Supabase -> SQL Editor -> Run (آمن لو اتشغّل أكتر من مرة، ومش بيمسح أي بيانات).
-- =====================================================================
create or replace function public.firing_enforce_kind() returns trigger
language plpgsql set search_path = public as $$
declare kk text; lk text;
begin
  if new.kiln_id is not null then
    select kind into kk from public.firing_kilns where id = new.kiln_id;
    if kk is not null and kk <> new.kind then raise exception 'kiln kind mismatch'; end if;
  end if;
  if tg_table_name = 'firing_operations' then
    if new.load_id is not null then
      select kind into lk from public.firing_loads where id = new.load_id;
      if lk is not null and lk <> new.kind then raise exception 'load kind mismatch'; end if;
    end if;
  end if;
  return new;
end $$;
