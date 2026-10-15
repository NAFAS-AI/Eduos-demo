/* © 2026 NAFAS FOR ARTIFICIAL INTELLIGENCE · CN-6573712 */
export const EXPECTED_DATABASE = 'https://xdkiktwuuwghvzcukvew.supabase.co';
export const ALLOWED_FRONTENDS = new Set(['https://demo.eduos.ae','https://eduos.ae']);
export const READ_TABLES = new Set(['staff_profiles','weekly_track','academic_calendar']);
export function decodeClaims(token) {
  if(typeof token!=='string'||token.split('.').length!==3) throw new Error('رمز الجلسة غير صالح.');
  try { const part=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(part)); }
  catch { throw new Error('تعذر قراءة معلومات الجلسة.'); }
}
export function validateConfig(config) {
  if(!config||config.schoolId!=='demo'||config.url!==EXPECTED_DATABASE)throw new Error('توقفت التجربة: إعداد الاتصال لا يطابق قاعدة النور.');
  if(typeof config.key!=='string')throw new Error('إعداد النشر العام غير متوفر.');
  if(config.key.startsWith('sb_publishable_')) return config;
  const claims=decodeClaims(config.key);
  if(claims.role!=='anon'||claims.ref!=='xdkiktwuuwghvzcukvew')throw new Error('توقفت التجربة: نوع مفتاح الاتصال غير مسموح.');
  if(claims.exp&&claims.exp*1000<Date.now())throw new Error('مفتاح النشر العام منتهي الصلاحية.');
  return config;
}
export function validateAccessToken(token) {
  const claims=decodeClaims(token);
  if(claims.iss!==EXPECTED_DATABASE+'/auth/v1'||claims.role!=='authenticated'||typeof claims.sub!=='string'||!claims.exp||claims.exp*1000<=Date.now())throw new Error('الجلسة ليست جلسة صالحة لقاعدة النور. سجّل الدخول من بوابة التجربة.');
  return claims;
}
export function allowedRequest(url,method='GET') {
  const parsed=new URL(url);
  if(method!=='GET')throw new Error('الكتابة غير مسموحة في تجربة التصميم.');
  if(parsed.origin!==EXPECTED_DATABASE)throw new Error('أُوقف طلب خارج قاعدة التجربة.');
  if(parsed.pathname==='/auth/v1/user')return parsed;
  const table=parsed.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
  if(!table||!READ_TABLES.has(table))throw new Error('المسار غير مسموح في تجربة التصميم.');
  return parsed;
}
export function displayValue(value,separator='، ') {
  if(Array.isArray(value))return value.filter(v=>typeof v==='string').join(separator);
  return typeof value==='string'?value:'';
}

// The shared calculator uses local-midnight Dates. Give it a synthetic local
// school day and local-midnight term boundaries, never UTC date-only strings.
export function dubaiDay(date=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=name=>parts.find(p=>p.type===name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function pilotWeek(calendar,calculator,rows,date=new Date()) {
  if(!calendar||typeof calculator!=='function'||!Array.isArray(rows)||!rows.length)throw new Error('تقويم التجربة غير متوفر.');
  const dateValue=value=>{
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('تاريخ التقويم غير صالح.');
    const timestamp=Date.parse(value+'T00:00:00Z');
    if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==value)throw new Error('تاريخ التقويم غير صالح.');
    return timestamp;
  };
  const year=rows[0].academic_year;
  if(typeof year!=='string'||!/^\d{4}-\d{4}$/.test(year))throw new Error('العام الدراسي غير صالح.');
  const seen=new Set();let previousEnd=-Infinity;
  const semesters=rows.map(row=>{
    const start=dateValue(row.start_date),end=dateValue(row.end_date);
    if(row.academic_year!==year||!Number.isInteger(row.term_number)||row.term_number<1||row.term_number>3||seen.has(row.term_number)||end<start||start<=previousEnd)throw new Error('حدود الفصول غير صالحة.');
    seen.add(row.term_number);previousEnd=end;
    return {num:row.term_number,name:displayValue(row.term_name_ar)||'الفصل '+row.term_number,start:row.start_date+'T00:00:00',end:row.end_date+'T00:00:00',weeks:Math.ceil((end-start+86400000)/604800000)};
  });
  const saved={year:calendar.year,semesters:calendar.semesters,holidays:calendar.holidays};
  try {
    Object.assign(calendar,{year,semesters,holidays:[]});
    const result=calculator(new Date(dubaiDay(date)+'T00:00:00'));
    if(!result||!Number.isFinite(result.weekNum)||typeof result.termName!=='string')throw new Error('تعذر حساب أسبوع التجربة.');
    return {...result,academicYear:year};
  } finally { Object.assign(calendar,saved); }
}
