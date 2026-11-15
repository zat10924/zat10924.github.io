-- شغّله مرة واحدة من Supabase -> SQL Editor
-- بيسمح للعامل يتبع أكتر من قسم (القسم الأساسي بيفضل في عمود section)
alter table public.workers add column if not exists sections text[] not null default '{}'::text[];
update public.workers set sections = array[section] where section is not null and sections = '{}'::text[];
