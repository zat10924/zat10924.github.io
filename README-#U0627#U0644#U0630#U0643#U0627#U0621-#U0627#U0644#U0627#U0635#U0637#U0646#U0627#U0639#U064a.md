# التطوير الذكي (الذكاء الاصطناعي يقترح وأنت توافق)

## الفكرة
الذكاء الاصطناعي بيجهّز تعديلات على الكود ويفتحها كـ **Pull Request**. **مفيش حاجة بتتغير في الموقع إلا بعد ما تدمجها بنفسك.**
قبل ما يفتح الطلب بيتأكد إن الكود سليم (فحص صياغة JavaScript وأقواس CSS) وبيرفع رقم الإصدار لوحده.

## الإعداد (مرة واحدة)
1. **مفتاح الذكاء الاصطناعي:** GitHub ‹ Settings ‹ Secrets and variables ‹ Actions ‹ New repository secret
   الاسم: `ANTHROPIC_API_KEY` والقيمة: مفتاحك من console.anthropic.com
2. **السماح بفتح الطلبات:** Settings ‹ Actions ‹ General ‹ Workflow permissions
   اختار *Read and write permissions* وفعّل *Allow GitHub Actions to create and approve pull requests*.
3. **الـ Label:** Issues ‹ Labels ‹ New label باسم `ai` (بالظبط).
4. تأكد إن الملفين موجودين: `.github/workflows/ai-dev.yml` و `.github/scripts/ai_dev.py`
   (لو الرفع من المتصفح تجاهل مجلد `.github`، أنشئهم بـ Add file ‹ Create new file واكتب المسار كامل).

## الاستخدام
- **بطلب منك:** من داخل البرنامج: الإعدادات ‹ التطوير الذكي ‹ اقترح تحسين (للمدير بس). اكتب المطلوب وابعت الـ Issue، وهو بيتحط عليه Label `ai` لوحده.
  وتقدر كمان تفتح Issue وتحط عليه Label `ai` يدويًا.
- **مراجعة تلقائية:** كل جمعة بيراجع الكود ويقترح إصلاح أو تحسين صغير لو لقى.
- **تشغيل يدوي:** Actions ‹ AI Dev ‹ Run workflow (وتقدر تكتب المطلوب).

## المراجعة والدمج
1. هتلاقي Pull Request جديد: افتح **Files changed** وراجع.
2. وافقت؟ اضغط **Squash and merge**. البند بيظهر في «ما الجديد» داخل البرنامج لوحده.
3. مش عاجبك؟ اقفل الطلب (Close) وخلاص.
4. لو دمجت وطلع فيه مشكلة: زرار **Revert** في نفس الـ Pull Request.

## الأمان
- بيشتغل بس لو الـ Issue من صاحب المستودع (المستودع عام، فأي حد تاني مايقدرش يشغّله).
- مش بيعدّل: `config.js` و `sw.js` و `install.js` وملفات SQL والـ manifest و `.github`.
- حدود: 6 ملفات و30 تعديل في الطلب الواحد.
- التكلفة: كل تشغيل بيستهلك رصيد الـ API بتاعك (غالبًا قروش قليلة).
