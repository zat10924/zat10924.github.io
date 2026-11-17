# خطوات نشر "إدارة الأقسام" على جوجل بلاي

## 1) GitHub (مرة واحدة)
1. أنشئ مستودع (Repository) **عام Public** اسمه بالظبط: `USERNAME.github.io`
   (استبدل USERNAME باسم حسابك على GitHub).
2. ارفع محتوى مجلد `github-repo` (بما فيه `.nojekyll` و `.well-known`) على فرع main.
3. Settings ‹ Pages ‹ Source: Deploy from a branch ‹ main / root ‹ Save.
4. بعد دقيقة افتح: https://USERNAME.github.io — لازم يفتح البرنامج.

> ملفات `.sql` في مجلد `keep-private-sql` **ما تترفعش** على المستودع العام.

## 2) تحويل لتطبيق أندرويد
1. افتح https://www.pwabuilder.com وحط رابط موقعك.
2. Package for stores ‹ Android ‹ Google Play.
3. اختار Package ID مثل `com.mas.manager` (مفيش تغيير بعد النشر!).
4. نزّل الملف: فيه `.aab` + ملف الـ keystore + `assetlinks.json`.
   **احتفظ بالـ keystore وكلمة السر في مكان آمن.**

## 3) ربط الموقع بالتطبيق (عشان يشتغل بدون شريط المتصفح)
1. حط محتوى `assetlinks.json` الجديد مكان محتوى الملف في `.well-known/assetlinks.json` على GitHub.
2. تأكد إنه بيفتح على: https://USERNAME.github.io/.well-known/assetlinks.json
3. في Play Console ‹ Setup ‹ App signing: انسخ SHA-256 الخاص بـ App signing key
   وضيفه في نفس الملف تحت `sha256_cert_fingerprints` (بصمة التوقيع بتاعة جوجل غير بصمة الـ keystore).

## 4) Google Play Console
1. أنشئ التطبيق ‹ ارفع `.aab` في Closed/Production testing.
2. حسابات المطورين الشخصية الجديدة محتاجة اختبار مغلق (حوالي 12 مختبر لمدة 14 يوم) قبل الإنتاج.
3. املا سياسة الخصوصية وبيانات الأمان (Data safety).

## 5) التحديثات بعد كده
- تعديل في الكود: عدّل `APP_VERSION` في `config.js` ‹ Commit ‹ التطبيق بيتحدث لوحده من غير مراجعة جوجل.
- تحتاج إصدار جديد على Play فقط لو غيّرت: اسم التطبيق، الأيقونة، Package، أو الصلاحيات.
