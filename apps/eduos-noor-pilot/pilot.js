/* © 2026 NAFAS FOR ARTIFICIAL INTELLIGENCE · CN-6573712 */
import {EXPECTED_DATABASE,ALLOWED_FRONTENDS,validateConfig,validateAccessToken,allowedRequest,displayValue,dubaiDay,pilotWeek} from './pilot-boundary.js';
const $=id=>document.getElementById(id);
const state={config:null,token:null,profile:null,records:[],dirty:false,active:false,busy:false,requestVersion:0,identityVersion:0,expiresAt:0,lastActivity:Date.now(),expiryTimer:null};
const fields={'class-name':'class_id','week-number':'week_number','subject-name':'subject_name','topic-main':'topic_main','weekly-keywords':'weekly_keywords','activities-planned':'activities_planned','resources-planned':'resources_planned','assessment-types':'assessment_types','bloom-levels':'bloom_levels','diff-gifted':'differentiation_gifted','diff-remedial':'differentiation_remedial','diff-sen':'differentiation_sen','notes-main':'notes'};
const trustedRoles=new Set(['teacher','sub_teacher','principal','vice_principal','admin','coordinator']);
function status(message,kind='info'){$('connection-status').textContent=message;$('connection-status').dataset.kind=kind;}
function resetRecords(message){state.records=[];const row=document.createElement('tr');const cell=document.createElement('td');cell.colSpan=5;cell.textContent=message;row.append(cell);$('records-body').replaceChildren(row);$('records-wrap').hidden=false;$('records-message').hidden=true;$('records-message').textContent=message;if($('metric-tracks'))$('metric-tracks').textContent='—';if($('metric-updated'))$('metric-updated').textContent='—';}
function resetForm(){
 for(const id of Object.keys(fields)){const el=$(id);if(el){el.value='';el.readOnly=id==='class-name'||id==='week-number';el.disabled=false;}}
 state.dirty=false;
 if($('selected-label'))$('selected-label').textContent='لا يوجد سجل محدد';
 if($('dirty-status'))$('dirty-status').textContent='لا تعديل محفوظ في هذه النسخة';
 if(location.hash)history.replaceState(null,'',location.pathname+location.search);
}
function formBusy(value){for(const id of Object.keys(fields)){if($(id))$(id).disabled=value;}}
function clearIdentity(){
 state.identityVersion++;state.requestVersion++;clearTimeout(state.expiryTimer);state.expiryTimer=null;state.expiresAt=0;
 $('identity-context').textContent='';$('identity-context').hidden=true;state.active=false;state.busy=false;state.token=null;state.profile=null;
 $('refresh-button').disabled=true;$('login-link').textContent='دخول حساب النور';
 $('academic-context').textContent='العام والفصل والأسبوع: لم تُحمّل بيانات التقويم';
 resetRecords('لم تُحمّل بيانات الحساب.');resetForm();
}
function endSession(message){const hadToken=!!state.token;clearIdentity();if(hadToken){try{sessionStorage.removeItem('edoos_user');}catch{}}status(message,'error');}
function checkPrivacy(now=Date.now()){
 if(state.expiresAt&&now>=state.expiresAt){endSession('انتهت صلاحية الجلسة؛ مُسحت البيانات والتعديلات المحلية. سجّل الدخول مجدداً.');return;}
 const hasContent=state.token||state.active||state.dirty||state.records.length||Object.keys(fields).some(id=>$(id)?.value);
 if(hasContent&&now-state.lastActivity>=15*60000)endSession('مُسحت البيانات والتعديلات المحلية بعد 15 دقيقة من عدم النشاط. يلزم تسجيل الدخول مجدداً لقراءة الحساب.');
}
function armExpiry(expiresAt){state.expiresAt=expiresAt;clearTimeout(state.expiryTimer);state.expiryTimer=setTimeout(()=>checkPrivacy(),Math.max(0,Math.min(expiresAt-Date.now(),2147483647)));}
function startPrivacyMonitor(){
 const activity=()=>{checkPrivacy();state.lastActivity=Date.now();};
 for(const event of['pointerdown','keydown','touchstart'])document.addEventListener(event,activity,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkPrivacy();});
 window.addEventListener('focus',()=>checkPrivacy());setInterval(()=>checkPrivacy(),1000);
}
async function fetchJson(url,headers={}){const r=await fetch(url,{method:'GET',headers,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok){if(r.status===401||r.status===403){const error=new Error('رفضت الخلفية الوصول. لا تُستبدل البيانات بقائمة فارغة.');error.authentication=true;throw error;}if(r.status===404)throw new Error('مسار القراءة غير متاح في الخلفية.');throw new Error('تعذر تحميل البيانات من الخلفية.');}return r.json();}
async function read(path,params={}){
 if(!state.config||!state.token)throw new Error('لا توجد جلسة موثقة لقراءة البيانات.');
 const identityVersion=state.identityVersion;
 try{validateAccessToken(state.token);}catch(error){endSession(error.message);throw error;}
 const u=new URL(path,EXPECTED_DATABASE);for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));allowedRequest(u.href);
 try{return await fetchJson(u.href,{apikey:state.config.key,Authorization:'Bearer '+state.token});}
 catch(error){if(error.authentication&&identityVersion===state.identityVersion)endSession(error.message);throw error;}
}
function clock(){const now=new Date();$('clock').dateTime=now.toISOString();$('clock').textContent=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit'}).format(now);}
async function loadCalendar(){
 const version=state.identityVersion;
 try{const now=new Date();const day=dubaiDay(now);const y=Number(day.slice(0,4));const year=Number(day.slice(5,7))>=9?y:y-1;
 const rows=await read('/rest/v1/academic_calendar',{select:'academic_year,term_number,term_name_ar,start_date,end_date',academic_year:'eq.'+year+'-'+(year+1),order:'term_number',limit:3});
 checkPrivacy();if(version!==state.identityVersion||!state.active)return;
 const w=pilotWeek(window.EDOOS_ACADEMIC_CALENDAR,window.getPlatformWeek,rows,now);
 $('academic-context').textContent=w.academicYear+' · '+w.termName+' · '+(w.isHoliday?'خارج الفصل الدراسي':'الأسبوع '+w.weekNum)+' — من تقويم قاعدة التجربة';
 }catch{if(version===state.identityVersion&&state.active)$('academic-context').textContent='العام والفصل والأسبوع: تعذر تحميل التقويم؛ لا يُستخدم تقويم مدرسة أخرى.';}
}
function addCell(row,text){const cell=document.createElement('td');cell.textContent=text;row.append(cell);return cell;}
function hasDraft(){return state.dirty&&!!$('track-form');}
function confirmDiscard(){return !hasDraft()||window.confirm('التعديلات داخل النموذج غير محفوظة. هل تريد تركها؟');}
function fillForm(record){if(!confirmDiscard())return;for(const[id,key]of Object.entries(fields)){const el=$(id);if(!el)continue;const value=record[key];el.value=typeof value==='number'?String(value):displayValue(value,id==='activities-planned'||id==='resources-planned'||id==='assessment-types'?'\n':'، ');el.readOnly=id==='class-name'||id==='week-number'||record.is_locked===true;}$('selected-label').textContent=record.is_locked?'سجل مقفل — قراءة فقط':'تفاصيل السجل · دون حفظ';$('dirty-status').textContent='تفاصيل مقروءة من قاعدة التجربة؛ الحفظ معطّل.';state.dirty=false;$('form-heading').scrollIntoView({behavior:'auto',block:'start'});history.replaceState(null,'','#record='+encodeURIComponent(record.id));}
function renderRecords(selectedId=null){const body=$('records-body');body.replaceChildren();const rows=state.records;if(!rows.length){resetRecords('لا بيانات للمسارات ضمن حساب التجربة المتحقق. هذه ليست نتيجة إجمالية للمدرسة.');if($('metric-tracks'))$('metric-tracks').textContent='0';return;}$('records-message').hidden=true;$('records-wrap').hidden=false;for(const record of rows){const row=document.createElement('tr');addCell(row,displayValue(record.class_id)||'غير محددة');addCell(row,String(record.week_number??'—'));addCell(row,displayValue(record.subject_name)||'غير مسجلة');const cell=addCell(row,'');const label=document.createElement('span');label.className='np-tag';label.textContent=record.is_locked?'مقفل':record.is_published?'منشور':'مسودة';cell.append(label);const action=addCell(row,'');if($('track-form')){const button=document.createElement('button');button.className='np-btn secondary';button.type='button';button.textContent='فتح';button.addEventListener('click',()=>fillForm(record));action.append(button);}else{const a=document.createElement('a');a.className='np-btn secondary';a.href='./weekly.html#record='+encodeURIComponent(record.id);a.textContent='فتح';action.append(a);}body.append(row);}if($('metric-tracks'))$('metric-tracks').textContent=String(rows.length);if($('metric-updated')){const dates=rows.map(r=>Date.parse(r.updated_at)).filter(Number.isFinite);$('metric-updated').textContent=dates.length?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Dubai'}).format(new Date(Math.max(...dates))):'غير مسجل';}if($('track-form')){const selected=rows.find(r=>String(r.id)===selectedId);if(selected)fillForm(selected);}}
async function loadRecords(){
 checkPrivacy();if(!state.active||state.busy)return;if(!confirmDiscard())return;
 const selectedId=new URLSearchParams(location.hash.slice(1)).get('record');resetForm();resetRecords('جارٍ إعادة قراءة المسارات…');
 state.busy=true;formBusy(true);const version=++state.requestVersion;$('refresh-button').disabled=true;status('جارٍ قراءة مسارات الحساب من قاعدة التجربة…');
 try{const rows=await read('/rest/v1/weekly_track',{select:'id,class_id,academic_year,week_number,is_published,is_locked,updated_at,subject_name,topic_main,weekly_keywords,activities_planned,resources_planned,assessment_types,bloom_levels,differentiation_gifted,differentiation_remedial,differentiation_sen,notes',staff_db_id:'eq.'+state.profile.id,order:'updated_at.desc',limit:30});
 if(version!==state.requestVersion||!state.active)return;checkPrivacy();if(version!==state.requestVersion||!state.active)return;
 if(!Array.isArray(rows))throw new Error('صيغة بيانات المسار غير متوقعة.');state.records=rows;renderRecords(selectedId);
 status('اكتملت قراءة نتائج الاستعلام، حتى 30 سجلاً. لا يغني ذلك عن فحص المخطط والصلاحيات؛ الحفظ والنشر معطّلان.','ok');
 }catch(error){if(version!==state.requestVersion)return;resetRecords('تعذر تحميل المسارات. لا يمكن تفسير الخطأ بأنه لا توجد مسارات.');resetForm();status(error.message+' يلزم فحص المخطط والصلاحيات قبل إكمال الربط.','error');
 }finally{if(version===state.requestVersion){state.busy=false;formBusy(false);$('refresh-button').disabled=!state.active;}}
}
async function initialize(){startPrivacyMonitor();clock();setInterval(clock,60000);$('refresh-button').addEventListener('click',loadRecords);const form=$('track-form');if(form){form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('input',e=>{if(e.target.readOnly||e.target.disabled)return;state.dirty=true;$('dirty-status').textContent='تعديلات محلية غير محفوظة؛ لم يُرسل طلب كتابة.';});}
 document.querySelectorAll('a').forEach(a=>a.addEventListener('click',e=>{if(a.classList.contains('np-skip'))return;if(!confirmDiscard())e.preventDefault();}));window.addEventListener('beforeunload',e=>{if(hasDraft()){e.preventDefault();e.returnValue='';}});
 if(!ALLOWED_FRONTENDS.has(location.origin)){status('معاينة محلية معزولة: لا اتصال بقاعدة بيانات ولا بيانات بديلة.','info');resetRecords('لم تُحمّل البيانات في المعاينة المحلية.');return;}
 try{state.config=validateConfig(await fetchJson(new URL('/api/config',location.origin).href));}catch(error){status(error.message,'error');resetRecords('أُوقفت قراءة البيانات لحماية عزل التجربة.');return;}
 let session;try{session=JSON.parse(sessionStorage.getItem('edoos_user')||'null');}catch{session=null;}
 if(!session?.token){status('إعداد النور مطابق. سجّل الدخول بحساب النور لتحميل بياناته؛ لا تُقرأ بيانات دون جلسة.');resetRecords('يلزم حساب تجربة موثق لعرض المسارات. النموذج خالٍ، والحفظ معطّل.');return;}
 const version=state.identityVersion;
 try{const claims=validateAccessToken(session.token);state.token=session.token;armExpiry(claims.exp*1000);
 const user=await read('/auth/v1/user');checkPrivacy();if(version!==state.identityVersion)return;
 if(user.id!==claims.sub||typeof user.email!=='string')throw new Error('تعذر مطابقة هوية الحساب بالخلفية.');
 const profiles=await read('/rest/v1/staff_profiles',{select:'id,role_key',email:'eq.'+user.email,limit:2});checkPrivacy();if(version!==state.identityVersion)return;
 if(!Array.isArray(profiles)||profiles.length!==1||!trustedRoles.has(profiles[0].role_key))throw new Error('لا توجد هوية كادر واحدة مخولة لهذه التجربة. لا تُستخدم صلاحية من التخزين المحلي.');
 state.profile=profiles[0];state.active=true;$('identity-context').textContent='حساب كادر موثق';$('identity-context').hidden=false;$('login-link').textContent='حساب التجربة';await loadCalendar();if(version===state.identityVersion)await loadRecords();
 }catch(error){if(version===state.identityVersion){clearIdentity();status(error.message,'error');}}
}
initialize().catch(()=>{clearIdentity();status('تعذر تهيئة تجربة التصميم. لم يُرسل أي طلب كتابة.','error');});
