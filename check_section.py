#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
أداة فحص الأقسام — برنامج MAS
بتتأكد إن أي قسم جديد (أو موجود) متسجّل في كل الأماكن المطلوبة في البرنامج.
ما بتعدّل أي ملف: قراءة وفحص بس.

الاستعمال:
  # فحص قسم جديد
  python3 check_section.py <مجلد-البرنامج> --key brush --page brush.html \
      --tables brush_orders,brush_log [--type orders|log] [--skip id1,id2]

  # فحص كل الأقسام الموجودة في البرنامج (للتأكد إن الأداة والبرنامج متطابقين)
  python3 check_section.py <مجلد-البرنامج> --all

  --type orders (الافتراضي): قسم له طلبيات وتبويب في «تسجيل الإنتاج» (زي الجليز والرش والصب)
  --type log              : قسم سجل بس من غير طلبيات (زي التصليح)
  --skip                  : أرقام فحوصات تتخطاها (لو قسمك مش محتاجها)

تسمية الجداول المتبعة: <key>_orders للطلبيات، و<key>_log أو <key>_production للتسجيلات.
"""
import argparse, glob, os, re, sys

OK, BAD, WARN = "✓", "✗", "!"


class Project:
    def __init__(self, root):
        self.root = root
        self._c = {}

    def read(self, name):
        if name not in self._c:
            p = os.path.join(self.root, name)
            self._c[name] = open(p, encoding="utf-8", errors="ignore").read() if os.path.isfile(p) else None
        return self._c[name]

    def sql_files(self):
        return sorted(os.path.basename(p) for p in glob.glob(os.path.join(self.root, "setup_*.sql")))

    def all_sql(self):
        return "\n".join(self.read(f) or "" for f in self.sql_files())


def rx(text, pattern, flags=0):
    return text is not None and re.search(pattern, text, flags) is not None


def build_checks(P, key, page, tables, typ):
    """بترجع قايمة فحوصات: (id, مجموعة, وصف، ملف، نتيجة، علاج)"""
    k, pg = re.escape(key), re.escape(page)
    has_orders = typ == "orders"
    out = []

    def add(cid, group, desc, file, ok, fix, level="error", only=None):
        if only == "orders" and not has_orders:
            return
        out.append((cid, group, desc, file, ok, fix, level))

    C, PR, OR = P.read("common.js"), P.read("production.html"), P.read("orders.html")
    SE, WK, RP = P.read("search.html"), P.read("workers.html"), P.read("reports.js")
    IX, DS, AC = P.read("index.html"), P.read("dash.js"), P.read("activity.html")
    MF, SQL = P.read("manifest.json"), P.all_sql()

    # --- الصفحة نفسها
    page_src = P.read(page)
    add("page1", "الصفحة", "ملف الصفحة موجود", page, page_src is not None, f"اعمل {page} (انسخ casting.html أو repair.html كبداية)")
    add("page2", "الصفحة", "الصفحة بتطلب تسجيل الدخول والصلاحية", page,
        rx(page_src, r'requireAuth\(\s*["\']' + pg + r'["\']'), f'استدعي requireAuth("{page}") في آخر الصفحة')

    # --- common.js (القوائم والصلاحيات والأيقونة)
    add("c1", "الأساس (common.js)", "اسم القسم في SEC_AR", "common.js", rx(C, r"const SEC_AR=\{[^}]*\b" + k + r":"), f"ضيف {key}:\"الاسم\" في SEC_AR")
    add("c2", "الأساس (common.js)", "القسم في SECTIONS (القائمة والرئيسية)", "common.js",
        rx(C, r'\["' + pg + r'",\s*"[^"]+",\s*"' + k + r'"'), f'ضيف ["{page}","الاسم","{key}","#لون"] في SECTIONS')
    add("c3", "الأساس (common.js)", "الصفحة في خريطة KEY (الصلاحيات)", "common.js", rx(C, r'const KEY=\{[^}]*"' + pg + r'"\s*:\s*"' + k + r'"'),
        f'ضيف "{page}":"{key}" في KEY')
    add("c4", "الأساس (common.js)", "تبويبات القسم في SUBS", "common.js", rx(C, r'const SUBS=\{[\s\S]*?"' + pg + r'"\s*:\s*\[\['), f'ضيف "{page}":[[...]] في SUBS')
    add("c5", "الأساس (common.js)", "أيقونة القسم", "common.js", rx(C, r"^\s*" + k + r":'<path", re.M), f"ضيف أيقونة {key}:'<path .../>' في قائمة الأيقونات")
    add("c6", "الأساس (common.js)", "اسم الصفحة في GH_NAMES (سجل التحديثات)", "common.js", rx(C, r'const GH_NAMES=\{[^}]*"' + pg + r'"'), f'ضيف "{page}":"صفحة ..." في GH_NAMES', "warn")

    # --- تسجيل الإنتاج
    add("pr1", "تسجيل الإنتاج", "القسم في SEC داخل production.html", "production.html", rx(PR, r"\b" + k + r":\{name:"), f"ضيف {key}:{{name:..,color:..}} في SEC", only="orders")
    add("pr2", "تسجيل الإنتاج", "القسم في قايمة المدير allowed", "production.html", rx(PR, r'allowed=ME\.role==="admin"\?\[[^\]]*"' + k + '"'),
        f'ضيف "{key}" في قايمة المدير في آخر production.html', only="orders")

    # --- الطلبيات
    add("o1", "الطلبيات", "القسم في SECK (توزيع صنف على الأقسام)", "orders.html", rx(OR, r"const SECK=\{[\s\S]*?\b" + k + r":\{n:"), f"ضيف {key}:{{n:..,page:..}} في SECK", only="orders")
    add("o2", "الطلبيات", "جدول الطلبيات في T", "orders.html", rx(OR, r"const T=\{[^}]*\b" + k + r':"'), f'ضيف {key}:"{key}_orders" في T', only="orders")
    add("o3", "الطلبيات", "تجميع طلبيات القسم في صفحة الطلبيات", "orders.html", rx(OR, r"\b" + k + r"_orders\b"), f"اقرا {key}_orders وضيفه في mkItem (زي الصب)", only="orders")

    # --- البحث الشامل
    add("s1", "البحث الشامل", "مربع اختيار القسم", "search.html", rx(SE, r'data-s="' + k + '"'), f'ضيف <input type="checkbox" data-s="{key}">')
    add("s2", "البحث الشامل", "القسم في SECS", "search.html", rx(SE, r"const SECS=\[[^\]]*\"" + k + '"'), f'ضيف "{key}" في SECS')
    add("s3", "البحث الشامل", "اسم القسم في SN", "search.html", rx(SE, r"const SN=\{[^}]*\b" + k + r":"), f"ضيف {key}:\"الاسم\" في SN")
    add("s4", "البحث الشامل", "القسم في دالة البحث (SQL)", "setup_search.sql", rx(P.read("setup_search.sql"), r"'" + k + r"'\s*=\s*any\(p_secs\)"),
        f"ضيف فرع union لقسم {key} في setup_search.sql وشغّله في Supabase")

    # --- العمال
    add("w1", "العمال", "تبويب القسم في صفحة العمال", "workers.html", rx(WK, r'data-k="' + k + '"'), f'ضيف زر data-k="{key}"')
    add("w2", "العمال", "اسم القسم في SECN", "workers.html", rx(WK, r"const SECN=\{[^}]*\b" + k + r":"), f"ضيف {key}:\"الاسم\" في SECN")
    if has_orders:
        pat = r"(?:" + "|".join(re.escape(t) for t in tables) + r")" if tables else None
        add("w3", "العمال", "إنتاج القسم داخل معدل العامل اليومي", "workers.html", pat is not None and rx(WK, pat), "ضيف جدول تسجيلات القسم في حساب إنتاج العمال (workers.html)", "warn")

    # --- التقارير
    add("r1", "التقارير", "إعداد القسم في reports.js", "reports.js", rx(RP, r"^\s*" + k + r":\{name:", re.M), f"ضيف {key}:{{name:..,page:..,icon:..}} في إعدادات التقارير")
    for t in tables:
        add("r2:" + t, "التقارير", f"جدول {t} في قايمة TABLES", "reports.js", rx(RP, r"const TABLES=\[[^\]]*\"" + re.escape(t) + '"'), f'ضيف "{t}" في TABLES')

    # --- الرئيسية واللوحة
    add("i1", "الصفحة الرئيسية", "بطاقة القسم (ملخص اليوم)", "index.html", rx(IX, r'"' + pg + r'"\s*:\s*async'), f'ضيف "{page}":async()=>... في ملخص البطاقات')
    add("i2", "الصفحة الرئيسية", "تسجيلات القسم في DSRC (التقرير اليومي)", "index.html", rx(IX, r"const DSRC=\{[^}]*\"" + pg + r'"\s*:\s*\['), f'ضيف "{page}":[جدول,عمود التاريخ] في DSRC')
    add("i3", "الصفحة الرئيسية", "طلبيات القسم في SRC", "index.html", rx(IX, r"const SRC=\{[^}]*\"" + pg + r'"'), f'ضيف "{page}":"{key}_orders" في SRC', only="orders")
    add("i4", "الصفحة الرئيسية", "القسم في CFG (تنبيه التأخير)", "index.html", rx(IX, r'"' + pg + r'"\s*:\s*\["[a-z_]+_orders"'), f'ضيف "{page}":[...] في CFG', only="orders")
    add("i5", "الصفحة الرئيسية", "دوائر الإنجاز في dash.js", "dash.js", rx(DS, r'"' + pg + r'"\s*:\s*\{(?:s|o):'), f'ضيف "{page}":{{s:..,req:..,ok:..}} في RING_SRC', only="orders")

    # --- سجل النشاط والنسخ الاحتياطي
    add("a1", "سجل النشاط", "القسم في فلتر الأقسام", "activity.html", rx(AC, r'<option value="' + k + '"'), f'ضيف <option value="{key}"> في فلتر القسم')
    add("a2", "سجل النشاط", "تصنيف جداول القسم (SECT)", "activity.html", rx(AC, r"const SECT=.*" + k), f"ضيف شرط {key} في سطر SECT")
    for t in tables:
        add("a3:" + t, "سجل النشاط", f"جدول {t} في TBL", "activity.html", rx(AC, r"const TBL=\{[\s\S]*?\b" + re.escape(t) + r":\["), f'ضيف {t}:["الاسم","النوع"] في TBL')
        add("a4:" + t, "سجل النشاط", f"جدول {t} في النسخ الاحتياطي BK", "activity.html", rx(AC, r"const BK=\[[^\]]*\"" + re.escape(t) + '"'), f'ضيف "{t}" في BK')

    # --- التطبيق
    add("m1", "التطبيق", "اختصار القسم في manifest.json", "manifest.json", rx(MF, r'"url"\s*:\s*"' + pg + '"'), f"ضيف اختصار {page} في shortcuts", "warn")

    # --- قاعدة البيانات
    for t in tables:
        add("q1:" + t, "قاعدة البيانات", f"إنشاء جدول {t}", "setup_*.sql", rx(SQL, r"create table (?:if not exists )?(?:public\.)?" + re.escape(t) + r"\b", re.I), f"مش معرّف في ملفات setup — قسم جديد: اعمل setup_{key}.sql · قسم قديم اتعمل يدوي: تجاهل", "warn")
        add("q2:" + t, "قاعدة البيانات", f"تفعيل RLS على {t}", "setup_*.sql",
            rx(SQL, r"alter table (?:public\.)?" + re.escape(t) + r"\s+enable row level security", re.I) or rx(SQL, r"\('" + re.escape(t) + r"'\s*,\s*'" + k + r"'\)"),
            f"فعّل row level security على {t} وضيف سياسات can_section('{key}')")
        add("q3:" + t, "قاعدة البيانات", f"{t} في النسخ الاحتياطي (setup_backup.sql)", "setup_backup.sql", rx(P.read("setup_backup.sql"), r"'" + re.escape(t) + "'"), f"ضيف '{t}' في قايمة setup_backup.sql", "warn")
    add("q4", "قاعدة البيانات", f"سياسات can_section('{key}')", "setup_*.sql", rx(SQL, r"can_section\('" + k + r"'\)") or rx(SQL, r"\('[a-z_]+'\s*,\s*'" + k + r"'\)"),
        f"لازم سياسة أمان بـ can_section('{key}') لجداول القسم")
    return out


def infer_sections(P):
    """يقرا الأقسام الموجودة من SECTIONS ويستنتج جداولها ونوعها"""
    C, RP = P.read("common.js") or "", P.read("reports.js") or ""
    m = re.search(r"const SECTIONS=\[(.*?)\];", C, re.S)
    secs = re.findall(r'\["([a-z_]+\.html)",\s*"[^"]+",\s*"([a-z_]+)"', m.group(1)) if m else []
    tm = re.search(r"const TABLES=\[(.*?)\]", RP, re.S)
    tabs = re.findall(r'"([a-z_]+)"', tm.group(1)) if tm else []
    res = []
    for page, key in secs:
        tb = [t for t in tabs if t.startswith(key + "_")]
        typ = "orders" if (key + "_orders") in tb else "log"
        res.append((key, page, tb, typ))
    return res


def run(P, key, page, tables, typ, skip, quiet=False):
    checks = build_checks(P, key, page, tables, typ)
    bad = warn = good = 0
    groups = {}
    for cid, group, desc, file, ok, fix, level in checks:
        if cid.split(":")[0] in skip:
            continue
        groups.setdefault(group, []).append((cid, desc, file, ok, fix, level))
    for g, items in groups.items():
        lines = []
        for cid, desc, file, ok, fix, level in items:
            if ok:
                good += 1
                if not quiet:
                    lines.append(f"   {OK} {desc}")
            elif level == "warn":
                warn += 1
                lines.append(f"   {WARN} {desc}  [{file}] → {fix}  (id: {cid.split(':')[0]})")
            else:
                bad += 1
                lines.append(f"   {BAD} {desc}  [{file}] → {fix}  (id: {cid.split(':')[0]})")
        if lines:
            print(f" ▸ {g}")
            print("\n".join(lines))
    return good, warn, bad


def main():
    ap = argparse.ArgumentParser(description="فحص تسجيل قسم في برنامج MAS")
    ap.add_argument("root", help="مجلد البرنامج (اللي فيه common.js)")
    ap.add_argument("--key"), ap.add_argument("--page"), ap.add_argument("--tables", default="")
    ap.add_argument("--type", choices=["orders", "log"], default="orders")
    ap.add_argument("--skip", default="")
    ap.add_argument("--all", action="store_true", help="افحص كل الأقسام الموجودة")
    ap.add_argument("--quiet", action="store_true", help="اعرض الناقص بس")
    a = ap.parse_args()
    P = Project(a.root)
    if not P.read("common.js"):
        sys.exit("مش لاقي common.js في المجلد ده — تأكد من المسار")
    skip = {s.strip() for s in a.skip.split(",") if s.strip()}
    total_bad = 0
    if a.all:
        for key, page, tables, typ in infer_sections(P):
            print(f"\n══ قسم {key}  ({page}) · النوع: {typ} · الجداول: {', '.join(tables) or '—'}")
            g, w, b = run(P, key, page, tables, typ, skip, a.quiet)
            print(f"   النتيجة: {g} سليم · {w} تنبيه · {b} ناقص")
            total_bad += b
    else:
        if not (a.key and a.page):
            sys.exit("لازم --key و --page (أو استعمل --all)")
        tables = [t.strip() for t in a.tables.split(",") if t.strip()]
        print(f"══ قسم {a.key}  ({a.page}) · النوع: {a.type} · الجداول: {', '.join(tables) or '—'}")
        g, w, b = run(P, a.key, a.page, tables, a.type, skip, a.quiet)
        print(f"\nالنتيجة: {g} سليم · {w} تنبيه · {b} ناقص")
        total_bad = b
    print("\n" + ("كل حاجة تمام ✓" if total_bad == 0 else f"فيه {total_bad} مكان ناقص ✗ — راجع القايمة فوق"))
    sys.exit(1 if total_bad else 0)


if __name__ == "__main__":
    main()
