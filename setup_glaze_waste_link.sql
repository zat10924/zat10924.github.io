-- MAS Manager: ربط هالك الجليز بسجل الإنتاج المصدر
-- نفّذ على Staging أولًا، ثم راجع النتائج قبل تطبيقه على Production.
-- لا يحذف أو يغيّر أي سجل قديم؛ السجلات السابقة ستظل source_table/source_id فيها NULL.

BEGIN;

ALTER TABLE public.glaze_waste
  ADD COLUMN IF NOT EXISTS source_table text,
  ADD COLUMN IF NOT EXISTS source_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.glaze_waste'::regclass
      AND conname = 'glaze_waste_source_table_check'
  ) THEN
    ALTER TABLE public.glaze_waste
      ADD CONSTRAINT glaze_waste_source_table_check
      CHECK (source_table IS NULL OR source_table IN ('glaze_production','free_production'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_glaze_waste_source
  ON public.glaze_waste (source_table, source_id)
  WHERE source_table IS NOT NULL AND source_id IS NOT NULL;

COMMENT ON COLUMN public.glaze_waste.source_table IS
  'Source production table: glaze_production or free_production';
COMMENT ON COLUMN public.glaze_waste.source_id IS
  'Source production row id stored as text to support existing source id types';

COMMIT;

-- فحص بعد التنفيذ: يجب أن تظهر الأعمدة source_table و source_id.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='glaze_waste'
  AND column_name IN ('source_table','source_id')
ORDER BY column_name;

-- مراجعة السجلات القديمة غير المرتبطة (لا يتم تعديلها تلقائيًا).
SELECT count(*) AS legacy_unlinked_waste_rows
FROM public.glaze_waste
WHERE source_table IS NULL OR source_id IS NULL;
