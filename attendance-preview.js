/* Shared attendance workflows. Sample data is restricted to explicit local review mode. */
window.DTAttendancePreview = (() => {
  const demo = new URLSearchParams(location.search).get('attendance-preview') === '1'
    && ['127.0.0.1','localhost'].includes(location.hostname);
  const enabled=true;
  let initialized=false,busy=false,workspaceReady=demo;
  const historyCache=new Map(),historyLoading=new Set();
  let sessionDrafts={};
  let api, state, selectedStudent = null, editing = false, drafts = {}, panel, selected = new Set(), message = '';
  const generation=localStorage.getItem('dt-attendance-preview-generation')||'v1';
  const key = 'dt-attendance-review-preview-'+generation;
  const e = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => api.date();
  const name = s => [s.preferredName || s.firstName,s.lastName].filter(Boolean).join(' ');
  const time = s => s ? new Date(s).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : '—';
  const dateLabel = date => new Date(date+'T12:00:00').toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'});
  const statusOf = row => typeof row === 'string' ? row : row?.status || '';
  const uid = () => crypto.randomUUID();
  const allClasses = () => api.classes;
  const cls = id => allClasses().find(c=>c.id===id);
  const find = id => allClasses().flatMap(c=>c.students.map(student=>({student,rosterClass:c}))).find(r=>r.student.id===id);
  const dayEntry = (c,id,date=today()) => c.attendance?.[date]?.[id];
  const lessonClasses = school => api.teacherClasses().filter(c=>c.schoolName===school);
  const attendees = c => c.students.filter(s=>s.status==='enrolled' || api.trialPending(s));
  const completeClass = c => {
    const day = c.attendance?.[today()] || {};
    if (day.__classStartedAt && day.__classEndedAt) return true;
    const rows=attendees(c).map(s=>day[s.id]);
    return rows.some(r=>r?.checkOutAt) && rows.every(r=>statusOf(r)==='absent' || (['present','tardy'].includes(statusOf(r))&&r?.checkOutAt));
  };
  const write = (c,studentId,date,entry) => {
    c.attendance ||= {}; c.attendance[date] ||= {}; c.attendance[date][studentId]=entry;
    state.records[`${c.id}|${studentId}|${date}`]={classId:c.id,studentId,date,...entry};
  };
  const storage=()=>window.DTAttendanceStorage;
  async function reload(){
    if(demo||!api?.client||!api?.profile)return;
    const account=api.profile.id;
    const data=await storage().loadWorkspace(api.client,today());
    if(api.profile?.id!==account)return;
    state.absences=data.absences;state.days={};state.records={};historyCache.clear();
    data.days.forEach(row=>{const day={...row.payload,revision:row.revision,schoolId:row.school_id};state.days[day.school+'|'+day.date]=day;});
    workspaceReady=true;refreshSchoolNote();
  }
  async function persist(){
    if(demo){localStorage.setItem(key,JSON.stringify(state));api.save();return;}
    const day=activeDay();if(!day)return;
    const row=await storage().saveDay(api.client,day.schoolId,day.date,day.revision||0,day);
    state.days[state.activeDay]={...row.payload,revision:row.revision,schoolId:row.school_id};
    const attendance=await storage().loadClassAttendance(api.client);
    attendance.data.forEach(r=>{const c=cls(r.dance_class_id);if(!c)return;c.attendance||={};c.attendance[r.attendance_date]||={};c.attendance[r.attendance_date][r.student_id]={status:r.status,checkInAt:r.check_in_at||'',checkOutAt:r.check_out_at||''};});
    state.records={};historyCache.clear();api.refresh();
  }
  function loadHistory(studentId){
    if(demo||historyCache.has(studentId)||historyLoading.has(studentId))return;
    historyLoading.add(studentId);storage().history(api.client,studentId).then(rows=>{
      historyLoading.delete(studentId);historyCache.set(studentId,rows.map(r=>({...r,id:r.record_id,classId:r.dance_class_id,studentId,date:String(r.attendance_date).slice(0,10),checkInAt:r.check_in_at||'',checkOutAt:r.check_out_at||'',className:r.class_name})));refreshHistory();
    }).catch(error=>api.toast('Attendance history could not load: '+error.message)).finally(()=>historyLoading.delete(studentId));
  }
  const label = s => ({present:'Present',tardy:'Tardy',absent:'Absent'}[s] || 'Choose status');
  const pill = s => `<span class="aw-pill is-${e(s)}">${label(s)}</span>`;
  const options = (value,blank=false) => `${blank?'<option value="">Choose…</option>':''}${['present','tardy','absent'].map(s=>`<option value="${s}" ${value===s?'selected':''}>${label(s)}</option>`).join('')}`;
  const allHistory = studentId => {
    if(!demo)return historyCache.get(studentId)||[];
    const rows=new Map();
    allClasses().forEach(c=>Object.entries(c.attendance||{}).forEach(([date,entries])=>{
      const entry=entries[studentId];if(!statusOf(entry))return;
      rows.set(`${c.id}|${studentId}|${date}`,{classId:c.id,studentId,date,...(typeof entry==='string'?{status:entry}:entry)});
    }));
    Object.entries(state.records).forEach(([id,row])=>{if(row.studentId===studentId)rows.set(id,row);});
    return [...rows.entries()].map(([id,row])=>({id,...row})).sort((a,b)=>b.date.localeCompare(a.date)||a.classId.localeCompare(b.classId));
  };
  const sessionTimes = row => {
    const group=Object.values(state.days).flatMap(day=>day.groups).find(g=>g.id===row.sessionId);
    if(group)return {inAt:group.startAt||'',outAt:group.endAt||row.checkOutAt||''};
    const source=cls(row.classId)?.attendance?.[row.date] || {};
    const entries=Object.entries(source).filter(([id,r])=>!id.startsWith('__')&&['present','tardy'].includes(statusOf(r))).map(([,r])=>r);
    return {inAt:source.__classStartedAt||entries.map(r=>r.checkInAt).filter(Boolean).sort()[0]||'',outAt:source.__classEndedAt||entries.map(r=>r.checkOutAt).filter(Boolean).sort().at(-1)||''};
  };
  const corrected = (row,status) => {
    const {inAt,outAt}=sessionTimes(row);
    return {...row,status,checkInAt:status==='present'?inAt:'',checkOutAt:status==='absent'?'':outAt};
  };
  const known = (id,date) => state.absences.find(a=>!a.canceled&&a.studentId===id&&a.date===date);
  function history(c,s) {
    if(!state)return '';
    selectedStudent={c,s};loadHistory(s.id);
    const rows=allHistory(s.id),absences=state.absences.filter(a=>!a.canceled&&a.studentId===s.id).sort((a,b)=>a.date.localeCompare(b.date));
    return `<section class="aw-history" data-aw-history><div class="aw-history-heading"><h4>Attendance History · ${rows.filter(r=>r.status==='tardy').length} Tardy · ${rows.filter(r=>r.status==='absent').length} Absent</h4>${editing?'':`<button class="aw-pencil" data-aw="edit-history" aria-label="Edit attendance history">✎</button>`}</div>
      <div class="aw-history-toolbar"><button class="secondary" data-aw="known-absence">Known Absence</button>${editing?'<button class="secondary" data-aw="cancel-history">Cancel</button><button class="primary" data-aw="save-history">Save</button>':''}</div>
      ${absences.length?`<div class="aw-known-list">${absences.map(a=>`<article><span><strong>Known Absence · ${dateLabel(a.date)}</strong><small>${e(a.note||'No note')}</small></span><button class="secondary" data-aw="edit-absence" data-id="${a.id}">Edit</button><button class="secondary" data-aw="remove-absence" data-id="${a.id}">Cancel Absence</button></article>`).join('')}</div>`:''}
      ${rows.map(row=>`<article class="aw-history-entry"><div><strong>${dateLabel(row.date)}</strong>${editing?`<select aria-label="Attendance status ${dateLabel(row.date)} ${e(row.className||cls(row.classId)?.name||'Previous class')}" data-aw-status="${e(row.id)}">${options(drafts[row.id]||row.status)}</select>${(drafts[row.id]||row.status)!=='absent'&&row.combined_session_id==='unassigned'&&row.combined_sessions?.length?`<label>Class attended<select data-aw-history-session="${e(row.id)}"><option value="">Choose class…</option>${row.combined_sessions.map((g,i)=>`<option value="${e(g.id)}" ${sessionDrafts[row.id]===g.id?'selected':''}>Class ${i+1} · ${time(g.startAt)}–${time(g.endAt)}</option>`).join('')}</select></label>`:''}`:pill(row.status)}</div><strong>${e(row.className||cls(row.classId)?.name||'Previous class')}</strong><small>In ${time(row.checkInAt)}</small><small>Out ${time(row.checkOutAt)}</small></article>`).join('')||(historyLoading.has(s.id)?'<p>Loading attendance history…</p>':'<p>No recorded attendance yet.</p>')}</section>`;
  }
  const refreshHistory = () => {const target=document.querySelector('[data-aw-history]');if(target&&selectedStudent)target.outerHTML=history(selectedStudent.c,selectedStudent.s);};
  function renderKnownAbsence(id='') {
    const found=state.absences.find(a=>a.id===id);
    renderShell('Known Absence',`<p>Record a date and note without starting class.</p><form id="aw-absence-form"><label>Date<input type="date" name="date" min="${today()}" value="${found?.date||today()}" required></label><label>Note<textarea name="note" maxlength="600" placeholder="For example: parent reported an appointment">${e(found?.note||'')}</textarea></label><input type="hidden" name="id" value="${e(id)}"><div class="aw-actions"><button class="secondary" type="button" data-aw="close">Cancel</button><button class="primary" type="submit">Save Known Absence</button></div></form>`);
  }
  function renderShell(title,body) {
    panel.innerHTML=`<header><div>${demo?'<small>Attendance preview · sample dancers only</small>':''}<h2>${e(title).replace(/EXCLUDE/g,'<span class="aw-exclude-bubble">EXCLUDE</span>')}</h2></div><button class="aw-close" data-aw="close" aria-label="${demo?'Close attendance preview':'Close attendance'}">×</button></header>${message?`<p class="aw-message" role="status">${e(message)}</p>`:''}${body}`;
    document.getElementById('aw-overlay').classList.add('active');document.getElementById('aw-overlay').setAttribute('aria-hidden','false');
  }
  function openCombine() {
    if(!workspaceReady){api.toast('Attendance is still loading. Please try again in a moment.');return;}
    const schools=[...new Set(api.teacherClasses().map(c=>c.schoolName))];
    if(!schools.length){api.toast('Choose a teacher with assigned classes.');return;}
    if(!api.selectedSchool()&&schools.length>1){api.toast('Choose a school in My Rosters before combining classes.');return;}
    const school=api.selectedSchool()?.name||schools[0];
    const existing=state.days[school+'|'+today()];
    state.setup={school,excluded:lessonClasses(school).filter(completeClass).map(c=>c.id)};
    renderSetup();
  }
  function renderSetup() {
    const setup=state.setup;
    const savedDay=state.days[setup.school+'|'+today()];
    renderShell('What classes are we combining today?',`<p class="aw-school-name">${e(setup.school)}</p><ul class="aw-setup-notes"><li>Excluded classes will check in and out as usual.</li><li>Completed classes are excluded automatically. Choose Combine to bring one back if needed.</li></ul><div class="aw-class-list">${lessonClasses(setup.school).map(c=>`<article class="aw-exclusion-class"><div class="aw-exclusion-row"><div class="aw-class-summary"><strong>${e(c.name)}</strong><small>${attendees(c).length} dancers${completeClass(c)?' · Already completed today':''}</small><div class="aw-class-toggle" role="group" aria-label="${e(c.name)} combining"><button type="button" data-aw="set-class-mode" data-id="${e(c.id)}" data-mode="combine" aria-pressed="${!setup.excluded.includes(c.id)}">Combine</button><button type="button" data-aw="set-class-mode" data-id="${e(c.id)}" data-mode="exclude" aria-pressed="${setup.excluded.includes(c.id)}">Exclude</button></div></div><button class="aw-class-expand" type="button" data-aw="toggle-class-roster" data-id="${e(c.id)}" aria-label="Show dancers in ${e(c.name)}" aria-expanded="false" aria-controls="aw-class-roster-${e(c.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button></div><div class="aw-class-roster" id="aw-class-roster-${e(c.id)}" hidden><div class="teacher-roster-student-grid">${attendees(c).map(student=>`<div class="teacher-roster-student-tile"><span class="roster-student-photo">${api.photo(student)}</span><strong>${e(name(student))}</strong><small>${e(student.officialClassroom||student.classroom||'Classroom not set')}</small></div>`).join('')||'<p>No dancers assigned.</p>'}</div></div></article>`).join('')}</div><div class="aw-actions"><button class="secondary" data-aw="close">Cancel</button>${savedDay&&savedDay.phase!=='complete'?'<button class="secondary" data-aw="resume-day">Resume</button>':''}<button class="primary" data-aw="choose-count">Next</button></div>`);
  }
  function renderCount() {
    const included=lessonClasses(state.setup.school).filter(c=>!state.setup.excluded.includes(c.id));
    renderShell('Combine remaining classes into how many classes?',`<p>${included.map(c=>e(c.name)).join(' · ')}</p><label>Classes to teach today<select id="aw-group-count">${Array.from({length:Math.max(1,included.length)},(_,i)=>`<option value="${i+1}" ${i===Math.min(1,included.length-1)?'selected':''}>${i+1}</option>`).join('')}</select></label><div class="aw-actions"><button class="secondary" data-aw="setup">Back</button><button class="primary" data-aw="begin-day">Continue</button></div>`);
  }
  const activeDay = () => state.days[state.activeDay];
  const dayStudents = day => {
    const seen=new Set();
    return day.classIds.flatMap(id=>{const c=cls(id);return c?attendees(c).map(student=>({student,rosterClass:c})):[];}).filter(r=>{if(seen.has(r.student.id))return false;seen.add(r.student.id);return true;});
  };
  const finishedIds = day => new Set(day.groups.flatMap(g=>g.checkedOut));
  function rosterMarkup(day,mode) {
    const done=finishedIds(day),group=day.groups.at(-1),buckets=new Map();
    dayStudents(day).forEach(r=>{const room=r.student.officialClassroom||r.student.classroom||'Official classroom not set';if(!buckets.has(room))buckets.set(room,[]);buckets.get(room).push(r);});
    return [...buckets].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([room,records])=>`<section class="teacher-roster-classroom"><h4>${e(room)}</h4><div class="teacher-roster-student-grid">${records.map(({student,rosterClass})=>{
      const isDone=done.has(student.id),absence=known(student.id,day.date),inGroup=group?.members.includes(student.id),pending=selected.has(student.id);
      const disabled=isDone || mode==='teaching';
      const isAbsent=!inGroup&&!isDone&&!pending&&(Boolean(absence)||statusOf(dayEntry(rosterClass,student.id,day.date))==='absent');
      const checkedIn=inGroup||pending;
      const circleLabel=isDone?'Class complete':isAbsent?'Known absent':checkedIn?'Checked in':'Not checked in';
      const action=mode==='checkout'?'check out':'check in';
      return `<div class="teacher-roster-student-tile ${isAbsent?'is-absent':''} ${isDone?'aw-is-complete':''}"><button class="teacher-roster-profile-button ${pending?'is-pending':''}" data-aw="select-dancer" data-id="${e(student.id)}" aria-label="${e(name(student))}: ${circleLabel}${disabled?'':` · ${pending?'Remove':'Select'} for ${action}`}" aria-pressed="${pending}" ${disabled?'disabled':''} title="${e(absence?.note||circleLabel)}"><span class="roster-student-photo">${api.photo(student)}</span>${isAbsent?'<span class="teacher-roster-selection-check aw-absence-x" aria-hidden="true">×</span>':isDone?'<span class="teacher-roster-selection-check is-safe" aria-hidden="true">✓</span>':checkedIn?'<span class="teacher-roster-selection-check" aria-hidden="true">✓</span>':''}</button><strong>${e(name(student))}</strong>${absence&&!inGroup&&!isDone?'<span class="aw-known-caption">Known absence</span>':''}</div>`;
    }).join('')}</div>${['checkin','checkout'].includes(mode)?`<div class="teacher-classroom-selected-count"><span>${records.filter(({student})=>mode==='checkout'?group?.members.includes(student.id)&&!done.has(student.id)&&!selected.has(student.id):selected.has(student.id)).length}</span></div>`:''}</section>`).join('');
  }

  function renderDay() {
    const day=activeDay();if(!day)return;
    const group=day.groups.at(-1),done=finishedIds(day),students=dayStudents(day);
    const progress=`<p class="aw-progress">${students.filter(r=>done.has(r.student.id)).length} of ${students.length} dancers combined</p>`;
    let body=progress;
    if(day.phase==='ready') {
      body+=`<p>${day.groups.length<day.plannedCount?`Ready for class ${day.groups.length+1} of ${day.plannedCount}.`:'All planned classes are complete.'}</p><div class="aw-actions">${day.groups.length<day.plannedCount?`<button class="primary" data-aw="start-group">Start<br>Class ${day.groups.length+1} of ${day.plannedCount}</button>`:''}<div class="aw-day-completion"><button class="secondary aw-complete-day" data-aw="review-day">Complete<br>Dance Day</button></div></div>`;
      if(day.groups.length>=day.plannedCount&&students.some(r=>!done.has(r.student.id)))body+='<button class="secondary" data-aw="add-group">Add Another Class</button>';
      body+=rosterMarkup(day,'teaching');
    } else if(day.phase==='checkin') {
      body+=`<h3>Class ${day.groups.length} · Select dancers to check in</h3><p>Known absences are labeled. You can select a dancer if they arrive after all.</p><div class="aw-actions"><strong>${selected.size} selected</strong><button class="primary" data-aw="save-checkin" ${!selected.size?'disabled':''}>Check In</button><button class="secondary" data-aw="cancel-group">Cancel This Class</button></div>`+rosterMarkup(day,'checkin');
    } else if(day.phase==='teaching') {
      body+=`<h3>Class ${day.groups.length} · In progress</h3><p>${group.members.length} dancers checked in at ${time(group.startAt)}.</p><div class="aw-actions"><button class="primary" data-aw="end-group">End<br>Class ${day.groups.length} of ${day.plannedCount}</button></div>`+rosterMarkup(day,'teaching');
    } else if(day.phase==='checkout') {
      body+=`<h3>Class ${day.groups.length} · Check dancers back out</h3><p>Select each dancer returned to their classroom. If you missed a check-in, select that dancer too; you’ll review Present or Tardy before saving.</p><div class="aw-actions"><strong>${selected.size} selected</strong><button class="primary" data-aw="save-checkout" ${!selected.size?'disabled':''}>Check Out</button></div>`+rosterMarkup(day,'checkout');
    } else if(day.phase==='missed') {
      body+=`<h3>Missed Check-In Review</h3><p>Were these dancers present from the start, or tardy?</p>${day.missed.map(id=>{const r=find(id);return `<div class="aw-review-row"><strong>${e(name(r.student))}</strong><select data-aw-missed="${e(id)}" aria-label="Attendance for ${e(name(r.student))}"><option value="">Choose…</option><option value="present" ${day.choices[id]==='present'?'selected':''}>Present</option><option value="tardy" ${day.choices[id]==='tardy'?'selected':''}>Tardy</option></select></div>`;}).join('')}<div class="aw-actions"><button class="secondary" data-aw="back-checkout">Back to Check-Out</button><button class="primary" data-aw="confirm-checkout" ${day.missed.some(id=>!day.choices[id])?'disabled':''}>Save Check-Out</button></div>`;
    } else if(day.phase==='review') {
      const remaining=students.filter(r=>!done.has(r.student.id));
      body+=`<h3>Complete Dance Day · Attendance Review</h3><p>Review the remaining dancers. Known absences are prefilled. No dancer was marked absent just because an earlier group ended.</p>${remaining.map(({student})=>{const value=day.review[student.id]||'',groupId=day.reviewGroup[student.id]||'';return `<div class="aw-review-row"><div><strong>${e(name(student))}</strong>${known(student.id,day.date)?`<small>${e(known(student.id,day.date).note)}</small>`:''}</div><select data-aw-final-status="${e(student.id)}" aria-label="Final attendance for ${e(name(student))}">${options(value,true)}</select>${['present','tardy'].includes(value)?`<label>Class attended<select data-aw-final-group="${e(student.id)}"><option value="">Choose class…</option>${day.groups.filter(g=>g.endAt).map((g,i)=>`<option value="${g.id}" ${g.id===groupId?'selected':''}>Class ${i+1} · ${time(g.startAt)}–${time(g.endAt)}</option>`).join('')}</select></label>`:''}</div>`;}).join('')||'<p>Everyone has attended and checked out.</p>'}<div class="aw-actions"><button class="secondary" data-aw="back-day">Back</button><button class="primary" data-aw="finish-day" ${remaining.some(({student:s})=>!day.review[s.id]||(['present','tardy'].includes(day.review[s.id])&&!day.reviewGroup[s.id]))?'disabled':''}>Save & Complete Dance Day</button></div>`;
    } else body+=`<h3>✓ Dance day complete</h3><p>Attendance is saved, attached to each dancer’s regular class. Excluded classes keep their normal attendance workflow.</p><button class="primary" data-aw="close">Done</button>`;
    renderShell('Combined Classes',body);
  }
  async function commitCheckout() {
    const day=activeDay(),group=day.groups.at(-1),outAt=day.checkoutAt||new Date().toISOString();
    for(const id of day.checkoutSelection){const r=find(id);if(!r)continue;
      const prior=dayEntry(r.rosterClass,id,day.date),status=group.members.includes(id)?(statusOf(prior)||'present'):day.choices[id];
      if(!['present','tardy'].includes(status))throw new Error('A missing check-in needs review.');
      if(!group.members.includes(id))group.members.push(id);
      write(r.rosterClass,id,day.date,{status,checkInAt:status==='present'?group.startAt:'',checkOutAt:outAt,sessionId:group.id});
      if(!group.checkedOut.includes(id))group.checkedOut.push(id);
    }
    selected.clear();day.checkoutSelection=[];day.missed=[];
    if(group.members.every(id=>group.checkedOut.includes(id))){group.endAt=outAt;day.phase='ready';message='Class complete — dancers have returned to their classrooms.';}else{day.phase='checkout';message='Check out the remaining dancers before starting the next class.';}
    await persist();api.refresh();renderDay();
  }
  function refreshSchoolNote() {
    const list=document.getElementById('teacher-roster-list');if(!list)return;
    const old=document.getElementById('aw-known-today');if(old)old.remove();
    const relevant=state.absences.filter(a=>!a.canceled&&a.date===today()&&api.teacherClasses().some(c=>c.students.some(s=>s.id===a.studentId)));
    if(!relevant.length)return;
    const note=document.createElement('aside');note.id='aw-known-today';note.className='teacher-new-enrollment-alert aw-known-absence-alert';note.setAttribute('aria-label','Known Absences Today');note.innerHTML=`<div class="teacher-new-enrollment-heading"><span class="teacher-new-enrollment-alert-icon" aria-hidden="true">A</span><h3>Known Absences Today</h3><button type="button" class="aw-known-close" data-aw="dismiss-known" aria-label="Dismiss known absences notice">×</button></div><div class="teacher-new-enrollment-grid">${relevant.map(a=>{const s=find(a.studentId).student;return `<button type="button" class="teacher-new-enrollment-card" data-aw="view-known-reason" data-id="${e(a.id)}" aria-label="View absence reason for ${e(name(s))}"><span class="teacher-new-enrollment-photo">${api.photo(s)}</span><strong>${e(name(s))}</strong></button>`;}).join('')}</div>`;list.before(note);
  }
  function init(context) {
    if(initialized)return;initialized=true;
    if(!demo&&document.body.dataset.tourMode==='true')return;
    api=context;
    if(demo)try{state=JSON.parse(localStorage.getItem(key)||'null');}catch{}
    state ||= {records:{},absences:[],days:{},seeded:false};
    state.days ||= {};state.records ||= {};state.absences ||= [];
    if(demo){
    // Sample creation is isolated from all authenticated production startup.
    const sample=api.teacherClasses()[0],school=sample?.schoolName;
    if(school&&!allClasses().some(c=>c.id==='aw-sample-class-3')){
      for(let i=3;i<=4;i++)allClasses().push({id:`aw-sample-class-${i}`,name:`Class ${i}`,schoolName:school,teacherId:sample.teacherId,ageGroup:i===3?'Preschool':'PreK',level:i===3?2:3,day:sample.day,time:i===3?'10:30 AM':'11:00 AM',capacity:12,sourceActive:true,students:Array.from({length:4},(_,j)=>({id:`aw-dancer-${i}-${j}`,firstName:['Harper','Riley','Quinn','Emerson'][j],lastName:i===3?'Sample':'Example',status:'enrolled',classroom:j<2?'Room 3':'Room 4',officialClassroom:j<2?'Room 3':'Room 4',birthdate:'2022-03-12'}))});
    }
    if(sample&&!state.deliverySeeded){
      sample.students.filter(s=>s.status==='enrolled').slice(0,2).forEach(s=>{s.kitReceived=false;s.kitReady=true;s.kitPickedUp=true;});state.deliverySeeded=true;
    }
    if(!state.seeded&&sample){
      const c4=cls('aw-sample-class-4'),start=new Date();start.setHours(9,0,0,0);const end=new Date(start.getTime()+30*60000);
      if(!generation.startsWith('reset-')) {
        for(const s of c4.students)write(c4,s.id,today(),{status:'present',checkInAt:start.toISOString(),checkOutAt:end.toISOString()});
        c4.attendance[today()].__classStartedAt=start.toISOString();c4.attendance[today()].__classEndedAt=end.toISOString();
      }
      const s=sample.students.find(s=>s.status==='enrolled');
      const old={id:'aw-previous-class',name:'Previous Class · September',schoolName:school,teacherId:sample.teacherId,sourceActive:false,students:[],attendance:{}};allClasses().push(old);
      for(const [i,date] of ['2026-09-04','2026-09-11','2026-09-18','2026-09-25'].entries()){
        const inAt=`${date}T14:00:00Z`,outAt=`${date}T14:40:00Z`;old.attendance[date]={__classStartedAt:inAt,__classEndedAt:outAt};
        write(old,s.id,date,{status:i===2?'tardy':'present',checkInAt:i===2?'':inAt,checkOutAt:outAt});
      }
      const date='2026-10-09',inAt=date+'T14:00:00Z',outAt=date+'T14:40:00Z';sample.attendance ||= {};sample.attendance[date]={__classStartedAt:inAt,__classEndedAt:outAt};write(sample,s.id,date,{status:'present',checkInAt:inAt,checkOutAt:outAt});
      state.absences.push({id:uid(),studentId:sample.students[1].id,date:today(),note:'Parent reported a family appointment.'});state.seeded=true;
    }
    // Restore the previous class metadata without enrolling anyone back in that class.
    if(!cls('aw-previous-class'))allClasses().push({id:'aw-previous-class',name:'Previous Class · September',schoolName:school,teacherId:sample?.teacherId,sourceActive:false,students:[],attendance:{}});
    Object.values(state.records).forEach(r=>{const c=cls(r.classId);if(c){c.attendance ||= {};c.attendance[r.date] ||= {};c.attendance[r.date][r.studentId]=r;}});
    } // End sample-only data setup.
    document.body.classList.add('aw-workflows');
    const style=document.createElement('link');style.rel='stylesheet';style.href='attendance-preview.css?v=attendance-workflows-20261020';document.head.append(style);
    const overlay=document.createElement('div');overlay.id='aw-overlay';overlay.className='confirm-overlay';overlay.setAttribute('aria-hidden','true');overlay.innerHTML='<section class="aw-panel" role="dialog" aria-modal="true" aria-label="Attendance"></section>';document.body.append(overlay);panel=overlay.firstElementChild;
    if(demo){const banner=document.createElement('div');banner.className='aw-preview-banner';banner.innerHTML='<strong>Attendance Preview · Updated TT Layout</strong><span>Sample dancers only · live attendance is unchanged</span><button data-aw="launch-combine">Try Combine Classes</button><button data-aw="sample-history">Try Attendance History</button><button data-aw="reset-preview">Reset Preview</button>';document.querySelector('.session-strip')?.after(banner);}
    const combine=document.createElement('button');combine.className='teacher-roster-multi-class-edit';combine.id='aw-combine-classes';combine.textContent='Combine Classes';combine.dataset.aw='launch-combine';document.querySelector('.teacher-roster-management-row')?.append(combine);
    const managementRows=[...document.querySelectorAll('#teacher-rosters-view .teacher-roster-management-row')];
    const firstManagement=document.getElementById('teacher-roster-multi-class-edit')?.closest('.teacher-roster-management-row');
    if(firstManagement){
      const launch=document.createElement('button');launch.type='button';launch.className='aw-class-actions-launch';launch.dataset.aw='class-actions';launch.setAttribute('aria-label','Class Actions');launch.innerHTML='<img src="assets/teacher-class-actions.png" alt="Class Actions">';firstManagement.before(launch);
      firstManagement.classList.add('aw-original-class-actions');document.getElementById('teacher-roster-shoe-check')?.closest('.teacher-roster-management-row')?.classList.add('aw-original-class-actions');
    }
    if(demo)void persist();api.refresh();refreshSchoolNote();
    // Keep the note visible when TT re-renders its normal roster.
    new MutationObserver(()=>{if(!document.getElementById('aw-known-today'))refreshSchoolNote();}).observe(document.getElementById('teacher-roster-list'),{childList:true});
    document.addEventListener('change',event=>{
      const t=event.target;
      if(t.matches('[data-aw-status]')){drafts[t.dataset.awStatus]=t.value;refreshHistory();return;}
      if(t.matches('[data-aw-history-session]')){sessionDrafts[t.dataset.awHistorySession]=t.value;return;}
      if(t.matches('[data-aw-school]')){state.setup={school:t.value,excluded:lessonClasses(t.value).filter(completeClass).map(c=>c.id)};renderSetup();return;}
      if(t.matches('[data-aw-exclude]')){const id=t.dataset.awExclude;state.setup.excluded=state.setup.excluded.filter(x=>x!==id);if(t.checked)state.setup.excluded.push(id);const badge=t.closest(".aw-exclusion-class").querySelector(".aw-excluded-badge");badge.textContent=t.checked?"Excluded":"Combine";badge.classList.toggle("is-excluded",t.checked);badge.classList.toggle("is-combined",!t.checked);return;}
      const day=activeDay();if(!day)return;
      if(t.matches('[data-aw-missed]'))day.choices[t.dataset.awMissed]=t.value;
      else if(t.matches('[data-aw-final-status]'))day.review[t.dataset.awFinalStatus]=t.value;
      else if(t.matches('[data-aw-final-group]'))day.reviewGroup[t.dataset.awFinalGroup]=t.value;
      else return;renderDay();
    });
    document.addEventListener('submit',async event=>{
      if(event.target.getAttribute('id')!=='aw-absence-form')return;event.preventDefault();const values=new FormData(event.target),date=String(values.get('date')),note=String(values.get('note')||'').trim(),id=String(values.get('id')||'');
      if(!selectedStudent||date<today())return;
      const attendance=allHistory(selectedStudent.s.id).find(r=>r.date===date&&['present','tardy'].includes(r.status));
      if(attendance){message='Attendance is already recorded for this date. Edit its status in Attendance History instead.';renderKnownAbsence(id);return;}
      const previous=state.absences.find(a=>a.id===id)||state.absences.find(a=>a.studentId===selectedStudent.s.id&&a.date===date);
      if(busy)return;busy=true;
      try{
        if(!demo){
          if(previous&&previous.date!==date)throw new Error('Cancel the previous absence before choosing a different date.');
          await storage().saveKnownAbsence(api.client,{studentId:selectedStudent.s.id,date,note,revision:previous?.revision||0});await reload();
        }else{if(previous)Object.assign(previous,{date,note});else state.absences.push({id:uid(),studentId:selectedStudent.s.id,date,note});await persist();}
      }catch(error){api.toast('Absence not saved: '+error.message);return;}finally{busy=false;}
      document.getElementById('aw-overlay').classList.remove('active');refreshHistory();refreshSchoolNote();api.toast('Known absence saved');
    });
    document.addEventListener('click',async event=>{
      const button=event.target.closest('[data-aw]');if(!button)return;event.preventDefault();const action=button.dataset.aw;message='';if(busy)return;
      const before=JSON.stringify(state),attendanceBefore=new Map(allClasses().map(c=>[c.id,JSON.parse(JSON.stringify(c.attendance||{}))]));busy=true;try{
      if(action==='close'){document.getElementById('aw-overlay').classList.remove('active');document.getElementById('aw-overlay').setAttribute('aria-hidden','true');selected.clear();return;}
      if(action==='reset-preview'){api.reset();localStorage.removeItem(key);localStorage.setItem('dt-attendance-preview-generation','reset-'+Date.now().toString(36));location.reload();return;}
      if(action==='dismiss-known'){document.getElementById('aw-known-today').hidden=true;return;}
      if(action==='view-known-reason'){
        const absence=state.absences.find(a=>a.id===button.dataset.id);if(!absence)return;
        const student=find(absence.studentId)?.student;if(!student)return;
        renderShell(name(student),`<p class="aw-absence-reason-date">${dateLabel(absence.date)}</p><h3>Known Absence</h3><p>${e(absence.note||'No reason provided.')}</p><div class="aw-actions"><button data-aw="close">Close</button></div>`);return;
      }
      if(action==='class-actions'){
        const choices=[['Rearrange Classes','teacher-roster-multi-class-edit'],['Combine Classes','aw-combine-classes'],['Shoe Check','teacher-roster-shoe-check'],['Move Ups','teacher-roster-move-ups'],['Print Rosters','teacher-roster-print']];
        renderShell('Class Actions',`<div class="aw-class-actions-menu">${choices.map(([label,id])=>`<button type="button" data-aw="run-class-action" data-id="${id}" ${document.getElementById(id)?.disabled?'disabled':''}>${label}</button>`).join('')}</div>`);return;
      }
      if(action==='run-class-action'){const target=document.getElementById(button.dataset.id);document.getElementById('aw-overlay').classList.remove('active');document.getElementById('aw-overlay').setAttribute('aria-hidden','true');queueMicrotask(()=>target?.click());return;}
      if(action==='launch-combine'){openCombine();return;}
      if(action==='sample-history'){const c=api.teacherClasses()[0];editing=false;drafts={};api.openStudent(c,c.students.find(s=>s.status==='enrolled'));return;}
      if(action==='edit-history'){editing=true;drafts={};sessionDrafts={};refreshHistory();return;}
      if(action==='cancel-history'){editing=false;drafts={};refreshHistory();return;}
      if(action==='save-history'){
        if(!demo){
          const changes=allHistory(selectedStudent.s.id).filter(row=>drafts[row.id]&&drafts[row.id]!==row.status).map(record=>({record,status:drafts[record.id],sessionId:sessionDrafts[record.id]}));
          await storage().correctStatuses(api.client,changes);
          historyCache.delete(selectedStudent.s.id);editing=false;drafts={};refreshHistory();api.toast('Attendance history saved');return;
        }
        allHistory(selectedStudent.s.id).forEach(row=>{if(!drafts[row.id]||drafts[row.id]===row.status)return;const updated=corrected(row,drafts[row.id]);write(cls(row.classId),row.studentId,row.date,updated);});
        persist();editing=false;drafts={};refreshHistory();api.refresh();api.toast('Attendance history saved');return;
      }
      if(action==='known-absence'||action==='edit-absence'){renderKnownAbsence(button.dataset.id||'');return;}
      if(action==='remove-absence'){const a=state.absences.find(a=>a.id===button.dataset.id);if(!demo){await storage().saveKnownAbsence(api.client,{studentId:a.studentId,date:a.date,note:a.note,revision:a.revision,canceled:true});await reload();}else{state.absences=state.absences.filter(a=>a.id!==button.dataset.id);await persist();}refreshHistory();refreshSchoolNote();return;}
      if(action==='set-class-mode'){
        const id=button.dataset.id,excluded=button.dataset.mode==='exclude';
        state.setup.excluded=state.setup.excluded.filter(x=>x!==id);if(excluded)state.setup.excluded.push(id);
        button.closest('.aw-class-toggle').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.mode==='exclude')===excluded)));return;
      }
      if(action==='toggle-class-roster'){
        const roster=document.getElementById('aw-class-roster-'+button.dataset.id);
        if(!roster)return;
        const expanded=roster.hidden;roster.hidden=!expanded;
        button.setAttribute('aria-expanded',String(expanded));
        button.setAttribute('aria-label',(expanded?'Hide':'Show')+' dancers in '+(cls(button.dataset.id)?.name||'class'));
        return;
      }
      if(action==='setup'){renderSetup();return;}
      if(action==='resume-day'){state.activeDay=state.setup.school+'|'+today();selected.clear();renderDay();return;}
      if(action==='choose-count'){if(lessonClasses(state.setup.school).every(c=>state.setup.excluded.includes(c.id))){message='Leave at least one class included.';renderSetup();return;}renderCount();return;}
      if(action==='begin-day'){
        const {school,excluded}=state.setup;state.activeDay=school+'|'+today();
        const previous=state.days[state.activeDay];
        if(previous?.groups.some(g=>g.members.some(id=>!g.checkedOut.includes(id)))){
          message='There is a class still in progress. Finish its check-out before changing the included classes.';
          selected.clear();renderDay();return;
        }
        const included=lessonClasses(school).filter(c=>!excluded.includes(c.id)).map(c=>c.id);
        // Retain completed groups so reopening setup cannot erase recorded progress.
        const groups=previous?.groups||[];
        state.days[state.activeDay]={school,schoolId:previous?.schoolId||lessonClasses(school)[0]?.partnerSchoolId,revision:previous?.revision||0,date:today(),excluded:[...excluded],classIds:included,plannedCount:groups.length+Number(document.getElementById('aw-group-count').value),groups,phase:'ready',review:previous?.review||{},reviewGroup:previous?.reviewGroup||{}};
        selected.clear();await persist();renderDay();return;
      }
      const day=activeDay();if(!day||day.date!==today()){api.toast('Open Combine Classes for today before continuing.');return;}
      const group=day.groups.at(-1);
      if(action==='start-group'){day.groups.push({id:uid(),members:[],checkedOut:[],startAt:'',endAt:''});day.phase='checkin';selected.clear();}
      if(action==='cancel-group'){day.groups.pop();day.phase='ready';selected.clear();}
      if(action==='add-group'){day.plannedCount++;}
      if(action==='select-dancer'){if(!finishedIds(day).has(button.dataset.id)){if(selected.has(button.dataset.id))selected.delete(button.dataset.id);else selected.add(button.dataset.id);}}
      if(action==='save-checkin'){
        if(!selected.size)return;group.startAt=new Date().toISOString();group.members=[...selected];
        for(const id of selected){const r=find(id);write(r.rosterClass,id,day.date,{status:'present',checkInAt:group.startAt,checkOutAt:'',sessionId:group.id});}
        selected.clear();day.phase='teaching';api.refresh();
      }
      if(action==='end-group'){day.phase='checkout';selected.clear();}
      if(action==='save-checkout'){
        if(!selected.size)return;day.checkoutSelection=[...selected];day.checkoutAt=new Date().toISOString();day.missed=[...selected].filter(id=>!group.members.includes(id));day.choices={};
        if(day.missed.length){day.phase='missed';}else{await commitCheckout();return;}
      }
      if(action==='back-checkout'){day.phase='checkout';}
      if(action==='confirm-checkout'){if(day.missed.some(id=>!day.choices[id]))return;await commitCheckout();return;}
      if(action==='review-day'){
        if(day.groups.some(g=>g.members.some(id=>!g.checkedOut.includes(id)))){message='Check out every dancer still in class before completing the dance day.';renderDay();return;}
        if(day.groups.length<day.plannedCount){message='You can finish early if no more classes are needed. Review the remaining dancers below.';}
        day.phase='review';day.review ||= {};day.reviewGroup ||= {};dayStudents(day).forEach(({student:s})=>{if(known(s.id,day.date)&&!finishedIds(day).has(s.id))day.review[s.id] ||= 'absent';});
      }
      if(action==='back-day')day.phase='ready';
      if(action==='finish-day'){
        const remaining=dayStudents(day).filter(r=>!finishedIds(day).has(r.student.id));
        if(remaining.some(r=>!day.review[r.student.id]||(['present','tardy'].includes(day.review[r.student.id])&&!day.reviewGroup[r.student.id])))return;
        remaining.forEach(({student:s,rosterClass:c})=>{const status=day.review[s.id],g=day.groups.find(g=>g.id===day.reviewGroup[s.id]);write(c,s.id,day.date,{status,checkInAt:status==='present'?g.startAt:'',checkOutAt:status==='absent'?'':g.endAt,sessionId:g?.id||null});});
        day.phase='complete';api.refresh();
      }
      if(action!=='select-dancer')await persist();renderDay();
      }catch(error){state=JSON.parse(before);allClasses().forEach(c=>{if(attendanceBefore.has(c.id))c.attendance=attendanceBefore.get(c.id);});selected.clear();api.toast('Attendance was not saved: '+error.message);if(!demo)await reload().catch(()=>{});api.refresh();api.save();if(action.includes('history'))refreshHistory();else if(activeDay())renderDay();}
      finally{busy=false;}
    });
    if(new URLSearchParams(location.search).get('show-combine')==='1')openCombine();
  }
  return {enabled,demo,init,history,reload,knownFor:(id,date)=>state?known(id,date):null};
})();
