-- =====================================================================
-- setup_casting_v5.sql — الصب اليدوي: الشغل بدون إنترنت + تثبيت سجل النشاط
-- شغّله مرة واحدة من Supabase -> SQL Editor (آمن لو اتشغّل أكتر من مرة)
-- لازم setup_casting.sql ثم v2 ثم v3 ثم v4 يكونوا اتشغّلوا قبله.
-- =====================================================================

-- 1) client_id: عشان تسجيل الصب اللي اتحفظ على الجهاز من غير نت ما يتكررش لو اتبعت مرتين
alter table public.casting_log add column if not exists client_id uuid;
create unique index if not exists casting_log_client_id_uidx on public.casting_log (client_id) where client_id is not null;

-- 2) تنضيف: لو setup_casting_v2.sql اتشغّل تاني بعد v4 كان بينسخ trigger مزامنة الحالة غلط على جدول الطلبيات
drop trigger if exists trg_casting_orders_sync on public.casting_orders;
-- (trigger المزامنة الصح على الطلبيات اسمه trg_casting_order_sync وبيتعمل في v4)

notify pgrst, 'reload schema';
