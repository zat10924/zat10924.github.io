-- شغّله مرة واحدة من Supabase -> SQL Editor
-- بيضيف عمود العامل لسجل التصليح
alter table public.repair_log add column if not exists worker text;
