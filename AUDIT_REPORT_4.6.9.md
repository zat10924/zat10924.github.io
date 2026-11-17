# تقرير مراجعة MAS Manager 4.6.9

## الملفات التي تمت مراجعتها
`common.js`, `config.js`, `sw.js`, `setup_v2.sql`, `setup_casting.sql`, `setup_casting_v5.sql`, `setup_brush.sql`, `setup_edit_own_today.sql`, `setup_backup.sql`، وملفات التقارير والتوثيق وقائمة الإصدار.

## تعديلات الكود
1. فصل طابور المزامنة وطابور الأخطاء بمفتاح خاص بكل مستخدم.
2. إضافة `created_by` إلى السجل المعلق، مع عدم قبول قيمة محلية مختلفة عن المستخدم الحالي.
3. ترقية عناصر طابور 4.6.8 التي تحتوي على `owner_id` مطابق، مع عدم إرسال العناصر مجهولة المالك أو الأجنبية.
4. إعادة التحقق من جلسة Supabase قبل الإرسال وبعده؛ وعند تبديل الحساب يُترك العنصر معلقًا.
5. التحقق من أن تعارض `client_id` يشير إلى سجل موجود أنشأه نفس المستخدم قبل اعتباره إعادة إرسال ناجحة.
6. إزالة مسارات إعادة المحاولة التي كانت تحذف `client_id` أو تسقط حقول إدخال بصمت عند نقص أعمدة قاعدة البيانات.
7. إضافة `00_sync_preflight.sql` و`01_sync_hardening.sql` لتثبيت `created_by` والتحقق منه وإنشاء unique index عند عدم وجود قيد مكافئ.
8. رفع إصدار التطبيق وذاكرة Service Worker إلى 4.6.9.

## اختبارات منفذة محليًا
- `node --check common.js` — ناجح.
- `node --check config.js` — ناجح.
- `node --check sw.js` — ناجح.
- `node tests/sync-queue.test.cjs` — ناجح: عزل حسابين، إثبات created_by محليًا، فصل failed queue، والحفاظ على المفاتيح القديمة.
- تم فحص بنية ZIP ومراجعة ملفات SQL ذات الصلة.

## حدود الاختبار
- لم يتوفر اتصال بقاعدة Supabase، ولم يتم تشغيل أي SQL.
- لم يتم اختبار RLS أو trigger فعليًا على PostgreSQL.
- لم يتم اختبار سيناريو تبديل المستخدمين في متصفح حقيقي مع طلب HTTP جارٍ.
- لم يتم اختبار Offline/Online على Android أو Chrome/Edge.
- لم يتم تنفيذ Backup/Restore حقيقي.
- لا يحتوي ZIP على مشروع Android build أو APK/AAB أو keystore يمكن التحقق منها.

## نقاط قاعدة البيانات
- `free_production` لديه `created_by` و`client_id` وفق `setup_v2.sql`.
- `casting_log` لديه `created_by`، ويضيف `setup_casting_v5.sql` عمود `client_id` وفهرسًا فريدًا.
- `deco_production` يُضاف له `created_by` من `setup_edit_own_today.sql` عند تشغيل ذلك الملف؛ ويجب التحقق من الحالة الفعلية قبل الترحيل.
- `setup_backup.sql` ينشئ JSON snapshots لجداول محددة داخل نفس قاعدة البيانات، ولا يحتوي دالة Restore للجداول.
- ملف Migration الجديد يضيف تحققًا خادميًا للهوية ومفتاح عدم التكرار للجداول التي يستخدمها Offline الحالي: `casting_log`, `deco_production`, `free_production`. لا يشمل جداول أخرى لا يستخدمها الطابور الحالي.

## القرار
**NOT READY FOR PRODUCTION** — تم تحسين الكود وإضافة Migration واختبار محلي، لكن الاعتماد يتطلب تشغيل وفحص SQL على Staging، اختبار RLS وتبديل الحسابات فعليًا، واختبار استعادة نسخة مستقلة.
