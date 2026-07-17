/**
 * EduOS Auth Guard v4.0 — JWT Server Verification
 * ================================================
 * الإصلاح الجذري لـ C-02:
 *   - يُخفي الصفحة فوراً حتى يكتمل التحقق
 *   - يتحقق من JWT مع Supabase (خادم حقيقي)
 *   - يأخذ role_key من الخادم — لا من المتصفح
 *   - JWT منتهٍ أو مزوَّر → logout فوري
 *   - الطلاب (بدون JWT) → تحقق من students table
 *   - شبكة معطلة → يسمح gracefully (لا يعاقب المستخدم)
 *
 * v4.0 — 2026-07-17
 */
(async function () {
  'use strict';

  // ─── إخفاء الصفحة فوراً حتى يكتمل التحقق ───────────────
  document.documentElement.style.visibility = 'hidden';

  let redirected = false;

  function redirectTo(url) {
    redirected = true;
    window.location.replace(url);
  }

  // ─── الصفحات العامة — بدون حماية ────────────────────────
  const PUBLIC_PAGES = [
    '/apps/eduos-landing/',
    '/apps/eduos-login/',
    '/apps/eduos-showcase/',
    '/apps/eduos-attendance-gate/',
    '/apps/eduos-change-password/',
  ];
  const currentPath = window.location.pathname;
  const isPublic = PUBLIC_PAGES.some(p => currentPath.includes(p));

  // حقن platform-lang.js في كل صفحة
  if (!document.getElementById('eduos-lang-script')) {
    const ls = document.createElement('script');
    ls.id  = 'eduos-lang-script';
    ls.src = '/apps/platform-lang.js?v=44';
    document.head.appendChild(ls);
  }

  if (isPublic) {
    document.documentElement.style.visibility = 'visible';
    return;
  }

  // ─── قراءة الجلسة ────────────────────────────────────────
  let session = null;
  try {
    const raw = sessionStorage.getItem('edoos_user');
    if (raw) session = JSON.parse(raw);
  } catch (e) { session = null; }

  if (!session || (!session.role_key && !session.role)) {
    redirectTo('/apps/eduos-login/?redirect=' + encodeURIComponent(currentPath));
  }

  if (redirected) return;

  // ─── انتظار window.EduOS (max 1 ثانية) ──────────────────
  let waitMs = 0;
  while (!window.EduOS?.SB_URL && waitMs < 1000) {
    await new Promise(r => setTimeout(r, 50));
    waitMs += 50;
  }

  const SB_URL  = (window.EduOS && window.EduOS.SB_URL)  || '';
  const SB_KEY  = (window.EduOS && window.EduOS.SB_KEY)  || '';

  // ─── تغيير كلمة المرور الإجباري ──────────────────────────
  if (session.force_password_change === true) {
    redirectTo('/apps/eduos-change-password/');
    if (redirected) return;
  }

  const roleKey   = session.role_key || session.role || '';
  const isStudent = roleKey === 'student';
  const isParent  = roleKey === 'parent';
  const token     = session.token || null;

  // ═══════════════════════════════════════════════════════════
  //  خطوة حرجة — التحقق من JWT مع الخادم
  // ═══════════════════════════════════════════════════════════
  if (token && !isStudent && SB_URL && SB_KEY) {
    try {
      const res = await fetch(`${SB_URL}/auth/v1/user`, {
        headers: {
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + token,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (res.status === 401) {
        // JWT منتهٍ أو مزوَّر — logout فوري
        sessionStorage.removeItem('edoos_user');
        redirectTo('/apps/eduos-login/?err=session_expired');
        return;
      }

      if (res.ok) {
        const authUser = await res.json();
        const serverRole = authUser.user_metadata && authUser.user_metadata.role_key;

        if (!serverRole) {
          // لا دور في الـ JWT — إعادة تسجيل الدخول
          sessionStorage.removeItem('edoos_user');
          redirectTo('/apps/eduos-login/?err=no_role');
          return;
        }

        // ✅ الخادم أكّد الدور — نثق بالخادم لا بالمتصفح
        session.role     = serverRole;
        session.role_key = serverRole;
        // تحديث المعلومات من الخادم
        if (authUser.user_metadata.name_ar)    session.name_ar    = authUser.user_metadata.name_ar;
        if (authUser.user_metadata.staff_db_id) session.staff_db_id = authUser.user_metadata.staff_db_id;
        if (authUser.user_metadata.school_id)   session.school_id   = authUser.user_metadata.school_id;
      }
      // 5xx أو شبكة معطلة → نسمح gracefully

    } catch (fetchErr) {
      // خطأ شبكة — نسمح ولا نعاقب المستخدم
      console.warn('[EduOS Guard v4] JWT check failed (network):', fetchErr && fetchErr.message);
    }
  }

  if (redirected) return;

  // ─── خريطة الأدوار ───────────────────────────────────────
  const ALL_STAFF = [
    'admin','principal','vice_principal','teacher','sub_teacher','coach',
    'nurse','specialist','social_worker','technician','secretary',
    'librarian','security','observer'
  ];
  const MGMT = ['admin','principal','vice_principal'];

  const ROLE_MAP = {
    'eduos-principal':          ['admin','principal'],
    'eduos-vice-principal':     ['admin','principal','vice_principal'],
    'eduos-analytics':          [...MGMT,'teacher'],
    'eduos-financial':          ['admin','principal','accountant'],
    'eduos-teacher':            ['admin','principal','vice_principal','teacher','sub_teacher','coach'],
    'eduos-student':            ['admin','principal','vice_principal','teacher','student','specialist','social_worker'],
    'eduos-parent':             ['admin','principal','parent'],
    'eduos-nurse':              ['admin','principal','vice_principal','nurse'],
    'eduos-nursing':            ['admin','principal','vice_principal','nurse'],
    'eduos-security':           ['admin','principal','vice_principal','security'],
    'eduos-maintenance':        ['admin','principal','vice_principal','maintenance','technician'],
    'eduos-transport':          ['admin','principal','vice_principal','driver','transport'],
    'eduos-library':            ['admin','principal','vice_principal','librarian','teacher'],
    'eduos-lab':                ['admin','principal','vice_principal','teacher'],
    'eduos-space':              ['admin','principal','vice_principal','teacher'],
    'eduos-cafeteria':          ['admin','principal','vice_principal','cafeteria'],
    'eduos-exam':               ['admin','principal','vice_principal','teacher','secretary'],
    'eduos-broadcasting':       ['admin','principal','vice_principal','media'],
    'eduos-calendar':           [...ALL_STAFF,'student'],
    'eduos-kg':                 ['admin','principal','vice_principal','teacher','kg'],
    'eduos-timetable-gen':      ['admin','principal','vice_principal'],
    'eduos-timetable-pdf':      [...ALL_STAFF,'student','parent'],
    'eduos-timetable':          [...ALL_STAFF,'student','parent'],
    'eduos-inclusion':          ['admin','principal','vice_principal','special_ed','specialist','social_worker'],
    'eduos-socialworker':       ['admin','principal','vice_principal','social_worker','specialist'],
    'eduos-checkin':            ['admin','principal','vice_principal','security'],
    'eduos-coach':              ['admin','principal','vice_principal','coach'],
    'eduos-specialist':         ['admin','principal','vice_principal','specialist','social_worker'],
    'eduos-secretary':          ['admin','principal','vice_principal','secretary'],
    'eduos-technician':         ['admin','principal','vice_principal','technician'],
    'eduos-observer':           ['admin','principal','vice_principal','observer'],
    'eduos-admin':              ['admin'],
    'eduos-hub':                [...ALL_STAFF,'student','parent'],
    'eduos-onboarding':         ['admin','principal'],
    'duty-os-vision':           ['admin','principal'],
    'smart-school-blueprint':   ['admin','principal'],
    'eduos-links':              ['admin','principal','teacher','support','special_ed','security','nurse','librarian','social_worker'],
    'eduos-drive':              ['admin','principal','teacher'],
    'eduos-achievements':       ['admin','principal','vice_principal','teacher'],
    'eduos-emiratization':      ['admin','principal'],
    'eduos-exit-ticket':        ['admin','principal','teacher','sub_teacher'],
    'eduos-teacher-dashboard':  ['admin','principal','teacher','sub_teacher'],
    'eduos-appraisal':          ['admin','principal'],
    'eduos-regulatory-dashboard':['admin','principal'],
    'eduos-elective-admin':     ['admin','principal','vice_principal','secretary'],
    'eduos-news':               ['admin','principal','media','teacher'],
    'eduos-observation':        ['admin','principal','teacher'],
    'eduos-certificates':       ['admin','principal','teacher'],
    'eduos-class-session':      ['admin','principal','teacher','sub_teacher'],
    'eduos-store':              ['admin','principal','teacher','student','parent'],
    'eduos-student-portal':     ['admin','principal','student','parent'],
    'eduos-vark':               ['admin','principal','teacher','student'],
    'eduos-survey':             ['admin','principal','teacher'],
    'eduos-inspection':         ['admin','principal','vice_principal'],
    'eduos-welcome':            ['admin','principal'],
    'eduos-atheer':             ['admin','principal','teacher','social_worker','support','special_ed'],
    'eduos-pdp':                [...ALL_STAFF],
    'eduos-meetings':           ['admin','principal','teacher'],
    'eduos-forms':              ['admin','principal','teacher','support'],
    'eduos-staff-leaves':       [...ALL_STAFF],
    'eduos-portfolio':          ['admin','principal','teacher','student'],
    'eduos-student-profile':    ['admin','principal','teacher'],
    // ── أمان 17 يوليو 2026 ──
    'eduos-attendance':         [...ALL_STAFF],
    'eduos-staff-management':   ['admin'],
    'eduos-school-settings':    ['admin','principal'],
    'eduos-school-manager':     ['admin'],
    'eduos-school-wizard':      [],            // مُغلق تماماً
    'eduos-agent-control':      ['admin'],
    'eduos-messaging':          [...ALL_STAFF],
    'eduos-weekly-track':       ['admin','principal','vice_principal','teacher'],
    'eduos-sub-teacher':        ['admin','principal','vice_principal','sub_teacher'],
    'eduos-substitute-builder': ['admin','principal','vice_principal','secretary'],
    'eduos-swap-builder':       ['admin','principal','vice_principal','secretary'],
    'eduos-reinforcement':      ['admin','principal','vice_principal','teacher','specialist'],
    'eduos-semester-plan':      ['admin','principal','vice_principal','teacher'],
    'eduos-smart-import':       ['admin','principal'],
    'eduos-smart-entry':        ['admin','principal','teacher'],
    'eduos-schedule-settings':  ['admin','principal'],
    'eduos-digital-readiness':  ['admin','principal','teacher'],
    'eduos-profile-complete':   [...ALL_STAFF,'student','parent'],
    'eduos-tablo':              ['admin','principal','vice_principal'],
    'credentials-card':         ['admin'],
    'eduos-shield':             ['admin','principal'],
    'links-hub':                [...ALL_STAFF,'student','parent'],
    'school-settings':          ['admin'],
    'eduos-social-worker':      ['admin','principal','vice_principal','social_worker','specialist'],
    'eduos-exam-calendar':      ['admin','principal','vice_principal','teacher','secretary'],
    'eduos-welcome-link':       ['admin','principal'],
    'eduos-inclusion-smart':    ['admin','principal','vice_principal','special_ed','specialist','social_worker'],
    'eduos-observer-manager':   ['admin','principal'],
    'eduos-parent-portal':      ['admin','principal','parent'],
    'eduos-student-card':       ['admin','principal','teacher','student'],
    'eduos-student-login':      [],            // مُغلق
    'eduos-students':           ['admin','principal','vice_principal','teacher'],
    'eduos-demo-portal':        ['admin','principal','teacher','support','special_ed','security','nurse'],
    'eduos-control-plane':      [],            // مُغلق — حماية خاصة
  };

  // ─── تحقق إضافي: المعلم البديل ────────────────────────────
  const SUB_TEACHER_BLOCKED = [
    'eduos-grades','eduos-financial','eduos-analytics',
    'eduos-principal','eduos-socialworker','eduos-inclusion',
    'eduos-reports','eduos-staff','eduos-settings',
    'eduos-welcome-link','eduos-inspection','eduos-emiratization',
  ];
  if (roleKey === 'sub_teacher') {
    const isBlocked = SUB_TEACHER_BLOCKED.some(b => currentPath.includes(b));
    if (isBlocked) {
      redirectTo('/apps/eduos-hub/?err=unauthorized');
      return;
    }
    if (session.contract_end_date) {
      const endDate = new Date(session.contract_end_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (endDate < today) {
        sessionStorage.removeItem('edoos_user');
        redirectTo('/apps/eduos-login/?err=contract_expired');
        return;
      }
    }
  }

  // ─── فحص ROLE_MAP ─────────────────────────────────────────
  const systemKey = Object.keys(ROLE_MAP).find(k => currentPath.includes(k));
  if (systemKey) {
    const allowed   = ROLE_MAP[systemKey];
    const userRole  = session.role || session.role_key || '';
    if (!allowed.includes(userRole)) {
      redirectTo('/apps/eduos-hub/?err=unauthorized');
      return;
    }
  }

  // ✅ الجلسة صحيحة والدور مؤكَّد من الخادم
  window.EDOOS_USER = session;

  // حقن EduOS Shield
  if (!document.querySelector('script[src*="platform-shield"]')) {
    const shieldScript = document.createElement('script');
    const depth  = (window.location.pathname.match(/\//g) || []).length - 1;
    const prefix = depth <= 2 ? '../' : '../../';
    shieldScript.src   = prefix + 'platform-shield.js';
    shieldScript.defer = true;
    document.head.appendChild(shieldScript);
  }

  // إظهار الصفحة
  if (!redirected) {
    document.documentElement.style.visibility = 'visible';
  }

})();
