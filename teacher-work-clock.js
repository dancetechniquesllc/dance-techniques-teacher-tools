/* Working time is saved separately from class attendance and scheduled estimates. */
(function(root) {
  'use strict';
  const hoursFor = entry => {
    const value=entry?.ended_at && entry?.started_at ? (Date.parse(entry.ended_at)-Date.parse(entry.started_at))/3600000 : 0;
    return Number.isFinite(value) ? Math.max(0,value) : 0;
  };
  const eventKey = event => String(event?.sharedEventId || event?.eventId || event?.id || '');
  const payrollLines = (entries, inPeriod) => (entries || [])
    .filter(entry => entry.status === 'approved' && entry.ended_at && inPeriod(entry.work_date))
    .map(entry => ({ teacherId:entry.teacher_id, workSessionId:entry.id, eventId:entry.event_id || '',
      eventDate:entry.work_date, hours:Math.round(hoursFor(entry)*10000)/10000, type:'Working Hours',
      description:`${entry.description} · ${entry.work_date}${entry.school_name ? ` · ${entry.school_name}` : ''}`,
      amount:Math.round(hoursFor(entry)*20*100)/100, held:false }));
  const api = { hoursFor, eventKey, payrollLines, entries:[], eligible:false, ready:false, busy:false };
  if (typeof module === 'object' && module.exports) { module.exports=api; return; }
  root.DTWorkClock=api;
  const preview = () => document.body.dataset.tourMode === 'true';
  const ownEntries = () => api.entries.filter(row => row.teacher_id === profileTeacher.id);
  const active = () => ownEntries().find(row => !row.ended_at);
  const esc = value => escapeText(String(value || ''));
  const today = () => isoDate(homeWidgetDate);
  api.canClock = () => preview() ? profileTeacher?.payTier === 'tier_b_teacher'
    : api.ready && api.eligible && root.dtCurrentProfile?.id === profileTeacher?.id;
  api.forEvent = (event, teacherId=profileTeacher.id) => api.entries.find(row => row.teacher_id === teacherId && row.event_id === eventKey(event) && row.work_date === event.date);
  api.hasEventRecord = (event, teacherId) => Boolean(api.forEvent(event,teacherId));
  api.load = async () => {
    if (preview()) { api.ready=true; return true; }
    if (!root.dtSupabase || !root.dtCurrentProfile) return false;
    try {
      const {data,error}=await root.dtSupabase.rpc('teacher_work_context');
      if(error) throw error;
      api.entries=Array.isArray(data?.sessions) ? data.sessions : [];
      api.eligible=data?.eligible===true; api.ready=true; return true;
    } catch(error) { api.ready=false; return false; }
  };
  const clockTime = value => new Date(value).toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'});
  const durationLabel = row => {
    const seconds=Math.max(0,Math.floor(((row.ended_at ? Date.parse(row.ended_at) : Date.now())-Date.parse(row.started_at))/1000));
    return [Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(value=>String(value).padStart(2,'0')).join(':');
  };
  const summary = row => row ? `<p class="work-clock-status"><strong>${row.ended_at ? 'Checked out' : 'Checked in'}</strong> · ${esc(clockTime(row.started_at))}${row.ended_at ? `–${esc(clockTime(row.ended_at))}` : ''}<br><span data-work-elapsed="${esc(row.id)}">${durationLabel(row)}</span>${row.ended_at ? ` · ${row.status==='approved' ? 'Approved' : row.status==='denied' ? 'Not approved' : 'Awaiting director review'}` : ''}</p>` : '';
  const buttons = (eventId,row) => `<div class="work-clock-actions">${row?.ended_at
    ? '<button type="button" disabled>Checked Out</button>'
    : row ? `<button type="button" class="primary" data-work-end="${esc(row.id)}" ${api.busy ? 'disabled' : ''}>Check Out</button>`
    : `<button type="button" class="primary" data-work-start="${esc(eventId)}" ${active() || api.busy ? 'disabled' : ''}>Check In</button>`}</div>`;
  api.eventMarkup = event => {
    const row=api.forEvent(event);
    if (!api.canClock() && !(row && !row.ended_at)) return '';
    return `<div class="event-work-clock">${summary(row)}${buttons(eventKey(event),row)}${!row && active() ? '<small>Check out of your current event before checking in again.</small>' : ''}</div>`;
  };
  api.otherMarkup = events => {
    const running=active();
    if (!api.canClock() && !running) return '';
    // An unfinished clock remains reachable after midnight or a schedule edit.
    if (running && (!running.event_id || !events.some(event => eventKey(event)===running.event_id && event.date===running.work_date))) {
      return `<section class="panel work-clock-panel"><h3>${esc(running.description)}</h3>${summary(running)}${buttons('',running)}</section>`;
    }
    return `<section class="panel work-clock-panel"><img class="work-clock-badge" src="assets/event-check-in-out.png" alt="Event Check In / Out"><h3>Check In</h3><label>What are you working on?<input id="work-clock-description" maxlength="500" placeholder="Registration, demo preparation, etc." ${running ? 'disabled' : ''}></label>${buttons('',null)}${running ? '<small>An event is already running.</small>' : '<small>Check in when you begin. At checkout, confirm your time and add notes.</small>'}</section>`;
  };
  const reviewCard = row => {
    const teacher=teachers.find(t=>t.id===row.teacher_id) || {};
    const name=fullName(teacher) || 'Teacher';
    const color=teacherProfileColor(teacher);
    const date=new Date(`${row.work_date}T12:00:00`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    const status=!row.ended_at ? 'running' : row.status==='approved' ? 'approved' : row.status==='denied' ? 'denied' : 'pending';
    const labels={running:'In progress',approved:'✓ Approved',denied:'Not included',pending:'Awaiting review'};
    return `<article class="work-review-card">
      <div class="work-review-details">
        <header class="work-review-heading">
          <span class="work-review-avatar" style="border-color:${esc(color)}">${teacher.photo ? `<img src="${esc(teacher.photo)}" alt="${esc(name)}">` : esc(initialsFor(teacher) || 'T')}</span>
          <div><h4>${esc(name)}</h4><p class="work-review-title">${esc(row.description)}</p><p class="work-review-date">${esc(date)}</p>${row.school_name ? `<p class="work-review-school">${esc(row.school_name)}</p>` : ''}</div>
        </header>
        <div class="work-review-times"><div><span>Clocked In</span><strong>${esc(clockTime(row.started_at))}</strong></div><span class="work-review-arrow" aria-hidden="true">→</span><div><span>Clocked Out</span><strong>${row.ended_at ? esc(clockTime(row.ended_at)) : '—'}</strong></div></div>
        <div class="work-review-duration"><span class="work-review-label">Working Time</span><div><strong data-work-elapsed="${esc(row.id)}">${durationLabel(row)}</strong><span class="work-review-badge is-${status}">${labels[status]}</span></div></div>
      </div>
      <div class="work-review-actions">${row.ended_at ? `<button type="button" class="primary" data-work-review="${esc(row.id)}" data-work-approve="true" ${row.status==='approved' ? 'disabled' : ''}>Approve Working Hours</button><button type="button" class="secondary" data-work-review="${esc(row.id)}" data-work-approve="false" ${row.status==='denied' ? 'disabled' : ''}>Do Not Include</button>` : '<p>Still running — not included in payroll.</p>'}</div>
      <div class="work-review-notes"><span class="work-review-label">Work Notes</span><p>${row.notes ? esc(row.notes) : 'No notes added.'}</p></div>
    </article>`;
  };
  api.reviewMarkup = () => {
    const rows=api.entries.filter(row=>payrollDateIsInRange(row.work_date)).sort((a,b)=>b.started_at.localeCompare(a.started_at));
    return `<section class="work-clock-review"><h3>Recorded Working Hours</h3><p>$20 per hour · Approve completed time for this pay period.</p>${!api.ready && !preview() ? '<p>Working hours could not load. Refresh before reviewing payroll.</p>' : !rows.length ? '<p>No recorded working hours yet.</p>' : rows.map(reviewCard).join('')}</section>`;
  };
  const put = row => { api.entries=api.entries.filter(entry=>entry.id!==row.id);api.entries.push(row); };
  let checkoutDraft=null;
  const openCheckout = row => {
    checkoutDraft=row;
    let dialog=document.getElementById('work-checkout-dialog');
    if(!dialog) {
      dialog=document.createElement('dialog');dialog.id='work-checkout-dialog';dialog.className='work-checkout-dialog';
      dialog.setAttribute('aria-labelledby','work-checkout-title');document.body.append(dialog);
    }
    const proposed={...row,ended_at:row.checkout_requested_at || new Date().toISOString()};
    dialog.innerHTML=`<h3 id="work-checkout-title">Confirm Your Time</h3><strong>${esc(row.description)}</strong><p>Check in: ${esc(clockTime(row.started_at))}<br>Check out: ${esc(clockTime(proposed.ended_at))}</p><p class="work-checkout-total">Total time <strong>${durationLabel(proposed)}</strong></p><label>Notes<textarea id="work-checkout-notes" maxlength="2000" rows="3" placeholder="Add anything your director should know">${esc(row.notes)}</textarea></label><div class="work-clock-actions"><button type="button" class="secondary" data-work-cancel>Keep Working</button><button type="button" class="primary" data-work-confirm>Confirm Check Out</button></div>`;
    dialog.showModal();
  };
  document.addEventListener('click',async event=>{
    if(event.target.closest('#teacher-work-launcher')) { setTimeout(()=>document.querySelector('.event-work-clock, .work-clock-panel')?.scrollIntoView({block:'center'}),0);return; }
    const start=event.target.closest('[data-work-start]');
    const end=event.target.closest('[data-work-end]');
    const review=event.target.closest('[data-work-review]');
    const confirm=event.target.closest('[data-work-confirm]');
    if(event.target.closest('[data-work-cancel]')) { document.getElementById('work-checkout-dialog')?.close();checkoutDraft=null;return; }
    const button=start || end || review || confirm;
    if(!button || api.busy) return;
    const description=document.getElementById('work-clock-description')?.value.trim() || '';
    const notes=document.getElementById('work-checkout-notes')?.value || '';
    if(start && !start.dataset.workStart && !description) { showToast('Add a short description of your work');return; }
    if(start && !api.canClock()) { showToast('Working hours are available only on the Teacher pay tier');return; }
    if(confirm && !checkoutDraft) return;
    api.busy=true;button.disabled=true;
    try {
      let row;
      if(preview()) {
        if(start) {
          const item=(profileTeacher.scheduleEvents || []).find(item=>eventKey(item)===start.dataset.workStart);
          row=active() || {id:`preview-work-${Date.now()}`,teacher_id:profileTeacher.id,event_id:start.dataset.workStart || null,work_date:today(),description:item?.title || description,school_name:item?.schoolName || '',started_at:new Date().toISOString(),ended_at:null,status:'running'};
        } else {
          row=api.entries.find(item=>item.id===(end?.dataset.workEnd || review?.dataset.workReview || checkoutDraft?.id));
          if(!row) throw new Error('The clock could not be found.');
          row={...row,...(end ? {checkout_requested_at:new Date().toISOString()} : confirm ? {ended_at:checkoutDraft.checkout_requested_at,notes,status:'pending'} : {status:review.dataset.workApprove==='true' ? 'approved' : 'denied'})};
        }
      } else {
        const name=start ? 'start_teacher_work' : end ? 'prepare_teacher_work_checkout' : confirm ? 'end_teacher_work' : 'review_teacher_work';
        const args=start ? {target_event_id:start.dataset.workStart || null,work_description:description || null} : end ? {session_id:end.dataset.workEnd} : confirm ? {session_id:checkoutDraft.id,work_notes:notes,expected_checkout_at:checkoutDraft.checkout_requested_at} : {session_id:review.dataset.workReview,approve:review.dataset.workApprove==='true'};
        const {data,error}=await root.dtSupabase.rpc(name,args);
        if(error) throw error;
        row=data;
      }
      put(row);api.busy=false;
      if(end && !row.ended_at) {openCheckout(row);return;}
      if(confirm) {document.getElementById('work-checkout-dialog')?.close();checkoutDraft=null;}
      renderMyDay();renderTeacherEventApprovals();
      if(typeof payrollState!=='undefined' && document.getElementById('payroll-workspace')?.hidden===false) renderPayrollWizard();
      showToast(start ? 'Checked in — your time is being recorded' : confirm ? 'Checked out — time and notes saved for director review' : 'Working hours review saved');
    } catch(error) { showToast(error.message || 'Could not save your clock. Please try again.'); }
    finally {api.busy=false;button.disabled=false;}
  });
  // Resume/open on another device loads the authoritative running clock.
  document.addEventListener('visibilitychange',async()=>{
    if(document.hidden || !root.dtCurrentProfile || preview()) return;
    if(await api.load()) { renderMyDay();renderTeacherEventApprovals(); }
  });
  setInterval(()=>{
    document.querySelectorAll('[data-work-elapsed]').forEach(node=>{
      const row=api.entries.find(row=>row.id===node.dataset.workElapsed);
      if(row) node.textContent=durationLabel(row);
    });
  },1000);
})(typeof window==='undefined' ? globalThis : window);
