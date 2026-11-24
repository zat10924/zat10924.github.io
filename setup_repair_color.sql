-- شغّله مرة واحدة من Supabase -> SQL Editor: بيضيف عمود «اللون» (اختياري) لسجل التصليح وجرد التصليح
alter table public.repair_log add column if not exists color text check (color is null or char_length(color) <= 80);
do $$ begin
  if to_regclass('public.repair_stock') is not null then
    alter table public.repair_stock add column if not exists color text check (color is null or char_length(color) <= 80);
  end if;
end $$;
notify pgrst, 'reload schema';
