/**
 * platform-pdp.js — Professional Development Plan (PDP) System
 * EduOS · NAFAS FOR ARTIFICIAL INTELLIGENCE · CN-6573712
 *
 * Features:
 *  - SMART goal assistant powered by Gemini AI
 *  - Term-locked progress (only current term is editable)
 *  - Evidence upload per goal per term
 *  - Save/load from staff_pdp table
 *
 * Usage: call window.initPDP({ containerId, staffDbId, role })
 */

(function () {
  'use strict';

  var PDP = window.EduOS_PDP = {};

  // ── helpers ────────────────────────────────────────────────────────────────
  function getSB() {
    return {
      url: (window.EduOS && window.EduOS.SB_URL) || '',
      key: (window.EduOS && window.EduOS.SB_KEY) || ''
    };
  }

  async function sbGet(table, query) {
    var sb = getSB();
    var r = await fetch(sb.url + '/rest/v1/' + table + '?' + query, {
      headers: { apikey: sb.key, Authorization: 'Bearer ' + sb.key }
    });
    return r.ok ? r.json() : [];
  }

  async function sbUpsert(table, payload, onConflict) {
    var sb = getSB();
    var url = sb.url + '/rest/v1/' + table;
    if (onConflict) url += '?on_conflict=' + onConflict;
    var r = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: sb.key,
        Authorization: 'Bearer ' + sb.key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(payload)
    });
    return r.ok ? r.json() : null;
  }

  async function sbPatch(table, filter, payload) {
    var sb = getSB();
    var r = await fetch(sb.url + '/rest/v1/' + table + '?' + filter, {
      method: 'PATCH',
      headers: {
        apikey: sb.key,
        Authorization: 'Bearer ' + sb.key,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    return r.ok ? r.json() : null;
  }

  async function getSettings() {
    var rows = await sbGet('app_settings', 'key=in.(pdp_open,pdp_current_term)&select=key,value');
    var map = {};
    (rows || []).forEach(function (r) { map[r.key] = r.value; });
    return {
      pdpOpen: map['pdp_open'] === 'true',
      currentTerm: parseInt(map['pdp_current_term'] || '1', 10)
    };
  }

  // ── AI SMART analysis ───────────────────────────────────────────────────────
  async function analyzeGoal(goalText, role) {
    var sb = getSB();
    var prompt = [
      'أنت مستشار تطوير مهني متخصص في التعليم.',
      'المنصب الوظيفي: ' + (role || 'موظف تعليمي'),
      'الهدف المكتوب: "' + goalText + '"',
      '',
      'حلِّل هذا الهدف وفق معايير SMART الخمسة:',
      '1. محدَّد (Specific): هل الهدف واضح ومحدد بدقة؟',
      '2. قابل للقياس (Measurable): هل يمكن قياسه بمعيار رقمي أو نوعي واضح؟',
      '3. قابل للتحقيق (Achievable): هل هو واقعي وقابل للإنجاز خلال عام دراسي؟',
      '4. ذو صلة (Relevant): هل يرتبط بمهام وأهداف المنصب الوظيفي؟',
      '5. محدَّد زمنياً (Time-bound): هل يتضمن إطاراً زمنياً أو مراحل واضحة؟',
      '',
      'أجب بصيغة JSON فقط بهذا الشكل:',
      '{',
      '  "specific": { "score": 0-2, "note": "تعليق موجز" },',
      '  "measurable": { "score": 0-2, "note": "تعليق موجز" },',
      '  "achievable": { "score": 0-2, "note": "تعليق موجز" },',
      '  "relevant": { "score": 0-2, "note": "تعليق موجز" },',
      '  "timeBound": { "score": 0-2, "note": "تعليق موجز" },',
      '  "improved": "نسخة محسّنة ومكتملة من الهدف",',
      '  "totalScore": 0-10',
      '}',
      'score: 2=ممتاز, 1=جزئي, 0=غائب. لا تضف أي نص خارج JSON.'
    ].join('\n');

    try {
      var r = await fetch(sb.url + '/functions/v1/askAI', {
        method: 'POST',
        headers: {
          apikey: sb.key,
          Authorization: 'Bearer ' + sb.key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: prompt })
      });
      var text = await r.text();
      var match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (e) { /* fall through */ }
    return null;
  }

  // ── render SMART badge ──────────────────────────────────────────────────────
  function smartBadge(score, label) {
    var color = score === 2 ? '#16a34a' : score === 1 ? '#d97706' : '#dc2626';
    var icon = score === 2 ? '&#10003;' : score === 1 ? '&#9888;' : '&#10007;';
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:12px;font-weight:600;color:#fff;background:' + color + ';margin:2px">' + icon + ' ' + label + '</span>';
  }

  // ── term label ──────────────────────────────────────────────────────────────
  function termLabel(t) {
    return ['', 'الفصل الأول', 'الفصل الثاني', 'الفصل الثالث'][t] || ('الفصل ' + t);
  }

  // ── goal card HTML ──────────────────────────────────────────────────────────
  function goalCardHTML(i, g, planningOpen, currentTerm, termData, readOnly) {
    var num = i + 1;
    var termKeys = [
      { key: 'term1_data', label: 'الفصل الأول', t: 1 },
      { key: 'term2_data', label: 'الفصل الثاني', t: 2 },
      { key: 'term3_data', label: 'الفصل الثالث', t: 3 }
    ];

    var goalVal = g || '';
    var html = '<div class="pdp-goal-card" id="pdp-goal-' + i + '" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:16px">';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">';
    html += '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6C3DD6,#22D3EE);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0">' + num + '</div>';
    html += '<span style="font-weight:700;color:#1e293b;font-size:15px">الهدف ' + num + '</span>';
    html += '</div>';

    if (planningOpen && !readOnly) {
      // Goal text area
      html += '<div style="margin-bottom:12px">';
      html += '<label style="font-size:13px;color:#64748b;display:block;margin-bottom:4px">&#127919; الهدف التطويري</label>';
      html += '<textarea id="goal-text-' + i + '" rows="2" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-family:Tajawal,Arial,sans-serif;font-size:14px;resize:vertical;box-sizing:border-box" placeholder="اكتب هدفك هنا...">' + goalVal + '</textarea>';
      html += '<button onclick="EduOS_PDP.analyzeGoalUI(' + i + ')" style="margin-top:6px;padding:6px 14px;background:linear-gradient(135deg,#6C3DD6,#22D3EE);color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:Tajawal,Arial,sans-serif;font-size:13px">&#128161; تحليل SMART</button>';
      html += '</div>';
      html += '<div id="smart-result-' + i + '" style="margin-bottom:12px"></div>';

      // Implementation plan
      html += '<div style="margin-bottom:12px">';
      html += '<label style="font-size:13px;color:#64748b;display:block;margin-bottom:4px">&#128196; الخطة التنفيذية</label>';
      var planVal = (window._pdpCurrentData && window._pdpCurrentData['plan_' + num]) || '';
      html += '<textarea id="plan-text-' + i + '" rows="3" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-family:Tajawal,Arial,sans-serif;font-size:14px;resize:vertical;box-sizing:border-box" placeholder="كيف ستُنفّذ هذا الهدف؟ ما الخطوات والموارد والمعايير؟">' + planVal + '</textarea>';
      html += '</div>';

    } else {
      // Read-only goal display
      html += '<div style="background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:12px">';
      html += '<p style="margin:0;color:#1e293b;font-size:14px">' + (goalVal || '<em style="color:#94a3b8">لم يُكتب بعد</em>') + '</p>';
      var planVal = (window._pdpCurrentData && window._pdpCurrentData['plan_' + num]) || '';
      if (planVal) {
        html += '<p style="margin:8px 0 0;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:8px">&#128196; ' + planVal + '</p>';
      }
      html += '</div>';
    }

    // Term progress strips (only if not in planning mode)
    if (!planningOpen || readOnly) {
      html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">';
      termKeys.forEach(function (tk) {
        var tData = (termData && termData[tk.key]) || {};
        var gKey = 'goal' + num;
        var prog = (tData[gKey] && tData[gKey].progress !== undefined) ? tData[gKey].progress : null;
        var evi = (tData[gKey] && tData[gKey].evidence) ? tData[gKey].evidence : '';
        var isOpen = (tk.t === currentTerm) && !readOnly;
        var isFuture = tk.t > currentTerm;
        var isBg = isFuture ? '#f1f5f9' : '#fff';
        var isBorder = isFuture ? '#e2e8f0' : (isOpen ? '#6C3DD6' : '#e2e8f0');
        var lockIcon = isFuture ? ' &#128274;' : '';

        html += '<div style="border:1px solid ' + isBorder + ';border-radius:10px;padding:10px;background:' + isBg + '">';
        html += '<div style="font-size:12px;font-weight:700;color:' + (isFuture ? '#94a3b8' : '#475569') + ';margin-bottom:8px">' + tk.label + lockIcon + '</div>';

        if (isFuture) {
          html += '<div style="font-size:11px;color:#94a3b8;text-align:center;padding:8px 0">&#128274; مقفل</div>';
        } else if (isOpen) {
          html += '<label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px">نسبة الإنجاز</label>';
          html += '<input type="number" id="prog-' + i + '-' + tk.t + '" min="0" max="100" value="' + (prog !== null ? prog : '') + '" style="width:100%;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;box-sizing:border-box" placeholder="0-100">';
          html += '<label style="font-size:11px;color:#64748b;display:block;margin-top:6px;margin-bottom:3px">الأدلة والملاحظات</label>';
          html += '<textarea id="evi-' + i + '-' + tk.t + '" rows="2" style="width:100%;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;resize:none;box-sizing:border-box" placeholder="أدلة / رابط / ملاحظة...">' + evi + '</textarea>';
        } else {
          // Past term — read only
          var pct = prog !== null ? prog : '—';
          var pColor = prog >= 80 ? '#16a34a' : prog >= 50 ? '#d97706' : '#dc2626';
          html += '<div style="text-align:center;font-size:20px;font-weight:700;color:' + (prog !== null ? pColor : '#94a3b8') + '">' + (prog !== null ? pct + '%' : '—') + '</div>';
          if (evi) html += '<div style="font-size:11px;color:#64748b;margin-top:4px;word-break:break-word">' + evi + '</div>';
        }
        html += '</div>';
      });
      html += '</div>'; // end grid
    }

    html += '</div>'; // end goal card
    return html;
  }

  // ── main render ─────────────────────────────────────────────────────────────
  PDP.init = async function (opts) {
    var containerId = opts.containerId;
    var staffDbId = opts.staffDbId;
    var role = opts.role || 'موظف';
    var container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:40px;color:#64748b"><div style="font-size:24px">&#8987;</div><div style="margin-top:8px">جار تحميل خطة التطوير...</div></div>';

    var settings = await getSettings();
    var rows = await sbGet('staff_pdp', 'staff_db_id=eq.' + encodeURIComponent(staffDbId) + '&limit=1&select=*');
    var pdp = (rows && rows.length > 0) ? rows[0] : null;
    window._pdpCurrentData = pdp;
    window._pdpStaffDbId = staffDbId;
    window._pdpRole = role;
    window._pdpSettings = settings;

    // Load term data from DB
    var termData = {};
    if (pdp) {
      termData.term1_data = pdp.term1_data || {};
      termData.term2_data = pdp.term2_data || {};
      termData.term3_data = pdp.term3_data || {};
    }
    window._pdpTermData = termData;

    var planningOpen = settings.pdpOpen;
    var currentTerm = settings.currentTerm;

    var html = '';

    // ── Status bar ───────────────────────────────────────────────────────────
    html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:20px">';
    html += '<div>';
    html += '<h3 style="margin:0;color:#1e293b;font-size:18px">&#127919; خطة التطوير المهني</h3>';
    html += '<p style="margin:4px 0 0;color:#64748b;font-size:13px">السنة الأكاديمية: ' + (pdp ? pdp.academic_year : '—') + '</p>';
    html += '</div>';

    // Status pill
    if (planningOpen) {
      html += '<div style="padding:6px 16px;background:#fef9c3;color:#854d0e;border-radius:20px;font-size:13px;font-weight:600">&#9997; فترة كتابة الخطة مفتوحة</div>';
    } else {
      html += '<div style="padding:6px 16px;background:#f0fdf4;color:#166534;border-radius:20px;font-size:13px;font-weight:600">&#128336; ' + termLabel(currentTerm) + ' — جارٍ</div>';
    }
    html += '</div>';

    // ── No PDP yet (planning closed) ────────────────────────────────────────
    if (!pdp && !planningOpen) {
      html += '<div style="text-align:center;padding:60px 20px;background:#f8fafc;border-radius:14px;border:2px dashed #cbd5e1">';
      html += '<div style="font-size:48px;margin-bottom:12px">&#128196;</div>';
      html += '<p style="color:#475569;font-size:15px">لم تُكتب خطة تطوير لهذا العام بعد.</p>';
      html += '<p style="color:#94a3b8;font-size:13px">تُفتح نافذة كتابة الخطة في نهاية الفصل الثالث.</p>';
      html += '</div>';
      container.innerHTML = html;
      return;
    }

    // ── Planning mode ────────────────────────────────────────────────────────
    if (planningOpen) {
      html += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 18px;margin-bottom:20px">';
      html += '<p style="margin:0;color:#1e40af;font-size:13px">&#128161; <strong>مساعد الأهداف الذكية (SMART)</strong> — اكتب هدفك ثم اضغط "تحليل SMART" لتحسينه وضمان استيفاء المعايير قبل الحفظ.</p>';
      html += '</div>';
    }

    // ── Goal cards ───────────────────────────────────────────────────────────
    var goals = [
      pdp ? pdp.goal_1 : '',
      pdp ? pdp.goal_2 : '',
      pdp ? pdp.goal_3 : ''
    ];

    html += '<div id="pdp-goals-container">';
    for (var i = 0; i < 3; i++) {
      html += goalCardHTML(i, goals[i], planningOpen, currentTerm, termData, false);
    }
    html += '</div>';

    // ── Action buttons ───────────────────────────────────────────────────────
    html += '<div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px">';
    if (planningOpen) {
      html += '<button onclick="EduOS_PDP.savePlan()" style="padding:10px 28px;background:linear-gradient(135deg,#6C3DD6,#22D3EE);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:Tajawal,Arial,sans-serif;font-size:15px;font-weight:600">&#128190; حفظ الخطة</button>';
    } else {
      html += '<button onclick="EduOS_PDP.saveProgress()" style="padding:10px 28px;background:linear-gradient(135deg,#6C3DD6,#22D3EE);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:Tajawal,Arial,sans-serif;font-size:15px;font-weight:600">&#128190; حفظ التقدم</button>';
    }
    html += '</div>';

    // ── Principal note (if any) ──────────────────────────────────────────────
    if (pdp && pdp.principal_note) {
      html += '<div style="margin-top:20px;background:#fef3c7;border:1px solid #fde68a;border-radius:12px;padding:14px 18px">';
      html += '<p style="margin:0;color:#92400e;font-size:13px"><strong>&#128204; ملاحظة المدير/ة:</strong> ' + pdp.principal_note + '</p>';
      html += '</div>';
    }

    container.innerHTML = html;
  };

  // ── analyzeGoalUI — called from button ──────────────────────────────────────
  PDP.analyzeGoalUI = async function (i) {
    var textEl = document.getElementById('goal-text-' + i);
    var resultEl = document.getElementById('smart-result-' + i);
    if (!textEl || !resultEl) return;

    var goalText = textEl.value.trim();
    if (!goalText) { resultEl.innerHTML = '<p style="color:#dc2626;font-size:13px">&#9888; الرجاء كتابة الهدف أولاً.</p>'; return; }

    resultEl.innerHTML = '<div style="text-align:center;padding:16px;color:#64748b;font-size:13px">&#128161; يحلّل الذكاء الاصطناعي هدفك...</div>';

    var analysis = await analyzeGoal(goalText, window._pdpRole);
    if (!analysis) {
      resultEl.innerHTML = '<p style="color:#dc2626;font-size:13px">&#9888; تعذّر التحليل، حاول مجدداً.</p>';
      return;
    }

    var labels = {
      specific: 'محدَّد',
      measurable: 'قابل للقياس',
      achievable: 'قابل للتحقيق',
      relevant: 'ذو صلة',
      timeBound: 'محدَّد زمنياً'
    };

    var html = '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px">';

    // SMART badges
    html += '<div style="margin-bottom:10px">';
    Object.keys(labels).forEach(function (k) {
      if (analysis[k]) html += smartBadge(analysis[k].score, labels[k]);
    });
    html += '</div>';

    // Notes per criterion
    html += '<div style="display:grid;gap:6px;margin-bottom:12px">';
    Object.keys(labels).forEach(function (k) {
      if (!analysis[k]) return;
      var s = analysis[k].score;
      var color = s === 2 ? '#16a34a' : s === 1 ? '#d97706' : '#dc2626';
      html += '<div style="font-size:12px;color:#475569"><span style="color:' + color + ';font-weight:700">' + labels[k] + ':</span> ' + analysis[k].note + '</div>';
    });
    html += '</div>';

    // Score bar
    var total = analysis.totalScore || 0;
    var pct = (total / 10) * 100;
    var barColor = total >= 8 ? '#16a34a' : total >= 5 ? '#d97706' : '#dc2626';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">';
    html += '<span style="font-size:13px;color:#475569;white-space:nowrap">تقييم الهدف:</span>';
    html += '<div style="flex:1;background:#e2e8f0;border-radius:4px;height:8px"><div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:4px"></div></div>';
    html += '<span style="font-size:13px;font-weight:700;color:' + barColor + ';white-space:nowrap">' + total + '/10</span>';
    html += '</div>';

    // Improved version
    if (analysis.improved) {
      html += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;margin-bottom:10px">';
      html += '<p style="margin:0 0 6px;font-size:12px;color:#166534;font-weight:700">&#10024; الهدف المقترح المحسَّن:</p>';
      html += '<p style="margin:0;font-size:13px;color:#1e293b">' + analysis.improved + '</p>';
      html += '<button onclick="document.getElementById(\'goal-text-' + i + '\').value=' + JSON.stringify(analysis.improved) + ';document.getElementById(\'smart-result-' + i + '\').innerHTML=\'\'" style="margin-top:8px;padding:5px 14px;background:#16a34a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:Tajawal,Arial,sans-serif;font-size:12px">&#10004; قبول الاقتراح</button>';
      html += '</div>';
    }

    html += '</div>';
    resultEl.innerHTML = html;
  };

  // ── savePlan ─────────────────────────────────────────────────────────────────
  PDP.savePlan = async function () {
    var goals = [0, 1, 2].map(function (i) {
      var el = document.getElementById('goal-text-' + i);
      return el ? el.value.trim() : '';
    });
    var plans = [0, 1, 2].map(function (i) {
      var el = document.getElementById('plan-text-' + i);
      return el ? el.value.trim() : '';
    });

    if (!goals[0] && !goals[1] && !goals[2]) {
      alert('الرجاء كتابة هدف واحد على الأقل.');
      return;
    }

    var sb = getSB();
    var staffDbId = window._pdpStaffDbId;
    var existing = window._pdpCurrentData;

    var year = new Date().getFullYear();
    var academicYear = (new Date().getMonth() < 8 ? (year - 1) : year) + '-' + (new Date().getMonth() < 8 ? year : year + 1);

    var payload = {
      staff_db_id: staffDbId,
      academic_year: academicYear,
      goal_1: goals[0],
      goal_2: goals[1],
      goal_3: goals[2],
      plan_1: plans[0],
      plan_2: plans[1],
      plan_3: plans[2],
      status: 'مسودة'
    };

    var btn = document.querySelector('[onclick="EduOS_PDP.savePlan()"]');
    if (btn) { btn.disabled = true; btn.textContent = '...جار الحفظ'; }

    var result;
    if (existing && existing.id) {
      result = await sbPatch('staff_pdp', 'id=eq.' + existing.id, payload);
    } else {
      result = await sbUpsert('staff_pdp', payload, 'staff_db_id,academic_year');
    }

    if (result) {
      window._pdpCurrentData = Array.isArray(result) ? result[0] : result;
      showToast('&#10004; تم حفظ الخطة بنجاح');
    } else {
      showToast('&#9888; تعذّر الحفظ', true);
    }
    if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ الخطة'; }
  };

  // ── saveProgress ──────────────────────────────────────────────────────────────
  PDP.saveProgress = async function () {
    var currentTerm = (window._pdpSettings && window._pdpSettings.currentTerm) || 1;
    var existing = window._pdpCurrentData;
    if (!existing || !existing.id) { alert('لا توجد خطة مسجّلة.'); return; }

    var termKey = 'term' + currentTerm + '_data';
    var termData = existing[termKey] || {};

    [0, 1, 2].forEach(function (i) {
      var gKey = 'goal' + (i + 1);
      var progEl = document.getElementById('prog-' + i + '-' + currentTerm);
      var eviEl = document.getElementById('evi-' + i + '-' + currentTerm);
      if (progEl) {
        termData[gKey] = {
          progress: parseInt(progEl.value || '0', 10),
          evidence: eviEl ? eviEl.value.trim() : ''
        };
      }
    });

    var patch = {};
    patch[termKey] = termData;

    // Calc overall progress
    var total = 0; var count = 0;
    [1, 2, 3].forEach(function (t) {
      var d = existing['term' + t + '_data'] || {};
      [1, 2, 3].forEach(function (g) {
        var gd = d['goal' + g];
        if (gd && gd.progress !== undefined) { total += gd.progress; count++; }
      });
    });
    patch.progress = count > 0 ? Math.round(total / count) : 0;

    var btn = document.querySelector('[onclick="EduOS_PDP.saveProgress()"]');
    if (btn) { btn.disabled = true; btn.textContent = '...جار الحفظ'; }

    var result = await sbPatch('staff_pdp', 'id=eq.' + existing.id, patch);
    if (result) {
      window._pdpCurrentData = Array.isArray(result) ? result[0] : result;
      showToast('&#10004; تم حفظ التقدم بنجاح');
    } else {
      showToast('&#9888; تعذّر الحفظ', true);
    }
    if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ التقدم'; }
  };

  // ── toast helper ──────────────────────────────────────────────────────────────
  function showToast(msg, isError) {
    var t = document.createElement('div');
    t.innerHTML = msg;
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:10px;color:#fff;font-family:Tajawal,Arial,sans-serif;font-size:14px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.2);background:' + (isError ? '#dc2626' : '#16a34a');
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }

  // ── public alias ──────────────────────────────────────────────────────────────
  PDP.initPDP = PDP.init;

})();
