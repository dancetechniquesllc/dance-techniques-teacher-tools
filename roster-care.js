/* Shoe Check and Official Classroom move-ups. Live writes are narrow RPCs;
   only the existing localhost tour uses browser-local persistence. */
(() => {
  const states = ['unknown', 'has', 'too_small'];
  const status = (student, shoe) => states.includes(student.shoeStatus?.[shoe]) ? student.shoeStatus[shoe] : 'unknown';
  const label = (value) => ({unknown: 'No shoes', has: 'Has shoes', too_small: 'Too small'})[value];
  const nextStatus = (current, tooSmall) => tooSmall ? 'too_small' : current === 'has' ? 'unknown' : 'has';
  window.dtShoeIndicators = (student) => `<span class="shoe-indicators">${['tap', 'ballet'].map(shoe => `<span class="shoe-dot is-${status(student, shoe)}" role="img" aria-label="${shoe === 'tap' ? 'Tap' : 'Ballet'}: ${label(status(student, shoe))}" title="${shoe === 'tap' ? 'Tap' : 'Ballet'}: ${label(status(student, shoe))}">${shoe === 'tap' ? 'T' : 'B'}</span>`).join('')}</span>`;

  document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.createElement('dialog');
    dialog.id = 'roster-care-dialog';
    dialog.setAttribute('aria-labelledby', 'roster-care-title');
    document.body.append(dialog);
    let mode = '', tooSmall = false, busy = false, opening = false, opener, records = [], groups = [], selected = new Set(), dragId = '', pointer = null, suppressClick = false;
    const drafts = new Map();
    let duplicateFirstNames = new Set();
    const safe = value => rosterSafe(String(value ?? ''));
    const tour = () => document.body.dataset.tourMode === 'true' && ['localhost', '127.0.0.1'].includes(location.hostname);
    const visibleClasses = () => {
      const school = teacherRosterSelectedSchool();
      return teacherRosterClasses().filter(c => teacherRosterSchoolFilter === 'all' || (school && teacherRosterClassMatchesSchool(c, school)));
    };
    const photo = student => `<span class="roster-student-photo">${student.photo ? `<img src="${safe(student.photo)}" alt="">` : safe(rosterStudentInitials(student))}</span>`;
    const refreshRosters = () => { renderTeacherRosters(); renderClassesAndRosters(); renderStudentLibrary(); };
    const updateCopies = (id, change) => rosterClasses.forEach(c => c.students.forEach(s => { if (s.id === id) change(s); }));
    // Keep sample edits in IndexedDB: the older tour snapshot can fill localStorage.
    // This store is never read or written by authenticated sessions.
    let sampleDb, sampleSaved = {};
    const tourReady = tour() ? new Promise((resolve, reject) => {
      const request = indexedDB.open('dt-roster-care-tour', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('samples');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        sampleDb = request.result;
        const read = sampleDb.transaction('samples').objectStore('samples').get('dancers');
        read.onerror = () => reject(read.error);
        read.onsuccess = () => {
          sampleSaved = read.result || {};
          Object.entries(sampleSaved).forEach(([id, patch]) => updateCopies(id, student => {
            if (patch.shoeStatus) student.shoeStatus = patch.shoeStatus;
            if (typeof patch.officialClassroom === 'string') student.officialClassroom = patch.officialClassroom;
          }));
          renderTeacherRosters();
          resolve();
        };
      };
    }) : Promise.resolve();
    // Mark rejection handled immediately; opening the tool reports it to the user.
    tourReady.catch(() => {});
    const persistTour = async patches => {
      await tourReady;
      const next = {...sampleSaved};
      patches.forEach(([id, patch]) => { next[id] = {...next[id], ...patch}; });
      await new Promise((resolve, reject) => {
        const tx = sampleDb.transaction('samples', 'readwrite');
        tx.objectStore('samples').put(next, 'dancers');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      sampleSaved = next;
    };
    const errorText = error => error?.code === 'PGRST202' ? 'This update is not available on the shared app yet. Nothing was saved.' : 'Could not save. Your roster may have changed or the connection was interrupted. Close and reopen to refresh, then try again.';
    const say = text => { dialog.querySelector('[data-care-message]').textContent = text; };
    const countChanges = () => records.filter(r => drafts.get(r.student.id) !== r.original).length;
    const close = () => {
      if (busy) return;
      if (mode === 'moves' && countChanges() && !window.confirm('Discard these unsaved classroom moves?')) return;
      dialog.close(); selected.clear(); drafts.clear(); opener?.focus();
    };
    const buildGroups = classes => {
      const schools = assignedTeacherSchools().map(assigned => schoolLibrary.find(s => (assigned.id && s.id === assigned.id) || enrollmentSchoolNameMatches(s.name, assigned.name) || enrollmentSchoolNameMatches(s.nickname, assigned.name)) || assigned);
      const bySchool = new Map();
      for (const c of classes) {
        const school = schools.find(s => teacherRosterClassMatchesSchool(c, s));
        const key = String(school?.id || school?.name || c.partnerSchoolId || c.schoolName);
        if (!bySchool.has(key)) bySchool.set(key, {key, school, name: rosterSchoolNickname(school?.name || c.schoolName), classes: []});
        bySchool.get(key).classes.push(c);
      }
      return [...bySchool.values()].sort((a,b) => a.name.localeCompare(b.name));
    };
    const card = r => {
      const s = r.student, name = rosterStudentFullName(s);
      const displayName = rosterMultiStudentDisplayName(s, duplicateFirstNames);
      if (mode === 'shoes') return `<article class="care-dancer">${photo(s)}<strong title="${safe(name)}">${safe(displayName)}</strong><div class="shoe-controls">${['tap','ballet'].map(shoe => `<button type="button" class="shoe-dot is-${status(s,shoe)}" data-shoe="${shoe}" data-student="${safe(s.id)}" aria-label="${safe(name)} — ${shoe === 'tap' ? 'Tap' : 'Ballet'}: ${label(status(s,shoe))}" ${busy ? 'disabled' : ''}>${shoe === 'tap' ? 'T' : 'B'}</button>`).join('')}</div></article>`;
      const room = drafts.get(s.id) || '';
      return `<button type="button" class="care-dancer care-move-card ${selected.has(s.id) ? 'is-selected' : ''} ${room !== r.original ? 'is-moved' : ''}" data-move-student="${safe(s.id)}" draggable="true" aria-pressed="${selected.has(s.id)}" aria-label="Select ${safe(name)} for a classroom move" ${busy ? 'disabled' : ''}>${photo(s)}<strong title="${safe(name)}">${safe(displayName)}</strong><small>${safe(room || 'Unassigned')}</small><small>${safe(rosterAge(s.birthdate))}</small></button>`;
    };
    const render = () => {
      const title = mode === 'shoes' ? 'Shoe Check' : 'Move Ups';
      const scroll = dialog.querySelector('.care-content')?.scrollTop || 0;
      dialog.innerHTML = `<header class="care-header"><div><h2 id="roster-care-title">${title}</h2><p>${teacherRosterSchoolFilter === 'all' ? 'All Schools' : safe(rosterSchoolNickname(teacherRosterSelectedSchool()?.name || groups[0]?.name || 'Selected School'))}</p></div><div class="care-header-actions">${mode === 'shoes' ? `<button type="button" class="care-brick ${tooSmall ? 'is-active' : ''}" data-too-small aria-pressed="${tooSmall}" ${busy ? 'disabled' : ''}>Too Small${tooSmall ? ' ✓' : ''}</button>` : ''}<button type="button" class="care-close" data-care-close aria-label="Close ${title}" ${busy ? 'disabled' : ''}>×</button></div></header>
        <div class="care-toolbar">${mode === 'shoes' ? `<p>${tooSmall ? 'Too Small is on — tap T or B to mark shoes brick.' : 'Tap T or B to mark shoes green. Tap a green circle to clear it.'}</p><div class="care-legend" aria-label="Shoe status legend"><span class="care-legend-pill is-unknown">NO SHOES</span><span class="care-legend-pill is-has">HAS SHOES</span><span class="care-legend-pill is-too_small">TOO SMALL</span></div>` : `<p>Drag dancers to a classroom, or select dancers and tap “Move here.” Only Official Classroom changes.</p><span>${countChanges()} unsaved move${countChanges() === 1 ? '' : 's'} · ${selected.size} selected</span><button type="button" data-care-reset ${busy || !countChanges() ? 'disabled' : ''}>Undo All</button><button type="button" class="care-gold" data-care-save ${busy || !countChanges() ? 'disabled' : ''}>${busy ? 'Saving…' : 'Save Move Ups'}</button>`}</div>
        <p class="care-message" data-care-message role="status" aria-live="polite"></p><div class="care-content">${groups.map((g, gi) => `<section class="care-school"><h3>${safe(g.name)}</h3><div class="care-group-grid">${mode === 'shoes' ? g.classes.map(c => `<section class="care-group"><h4>${safe(c.name)}</h4><div class="care-dancers">${records.filter(r => r.classIds.has(c.id)).map(card).join('') || '<p>No enrolled dancers.</p>'}</div></section>`).join('') : g.rooms.map((room, ri) => `<section class="care-group" data-room-group="${gi}" data-room-index="${ri}"><div class="care-room-heading"><h4>${safe(room || 'Unassigned')}</h4><button type="button" data-move-here data-room-group="${gi}" data-room-index="${ri}" ${busy || !selected.size ? 'disabled' : ''}>Move here</button></div><div class="care-dancers">${records.filter(r => r.group === g.key && drafts.get(r.student.id) === room).map(card).join('') || '<p class="care-empty">Drop dancers here</p>'}</div></section>`).join('')}</div></section>`).join('') || '<p>No enrolled dancers are available for this school.</p>'}</div>`;
      dialog.querySelector('.care-content').scrollTop = scroll;
    };
    const open = async (kind, button) => {
      if (dialog.open || opening) return;
      opening = true;
      try {
      try { await tourReady; } catch { return showToast('Sample saving is unavailable in this browser.'); }
      if (!tour() && !sharedRosterReady) return showToast('Wait for your shared roster to finish loading.');
      if (!tour()) {
        button.disabled = true;
        try { if (!await loadSharedClassesAndRosters()) return showToast('Could not refresh your roster. Try again.'); }
        catch { return showToast('Could not refresh your roster. Try again.'); }
        finally { button.disabled = false; }
      }
      mode = kind; tooSmall = false; busy = false; opener = button; selected.clear(); drafts.clear(); records = [];
      groups = buildGroups(visibleClasses());
      for (const g of groups) {
        const unique = new Map();
        for (const c of g.classes) for (const s of rosterEnrolled(c)) {
          if (unique.has(s.id)) { unique.get(s.id).classIds.add(c.id); continue; }
          const r = {student: s, rosterClass: c, classIds: new Set([c.id]), group: g.key, original: String(s.officialClassroom || '')};
          unique.set(s.id, r); records.push(r); drafts.set(s.id, r.original);
        }
        g.rooms = ['', ...new Set([...(g.school?.classroomOptions || []), ...[...unique.values()].map(r => r.original)].filter(Boolean))].sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
      }
      records.sort((a,b) => rosterStudentFullName(a.student).localeCompare(rosterStudentFullName(b.student)));
      const firstNameCounts = new Map();
      [...new Map(records.map(r => [r.student.id, r.student])).values()].forEach(student => {
        const first = rosterStudentFirstName(student).trim().toLowerCase();
        firstNameCounts.set(first, (firstNameCounts.get(first) || 0) + 1);
      });
      duplicateFirstNames = new Set([...firstNameCounts].filter(([, count]) => count > 1).map(([first]) => first));
      render(); dialog.showModal(); dialog.querySelector('.care-close').focus();
      } finally { opening = false; }
    };
    const move = (gi, ri, ids = [...selected]) => {
      if (busy) return;
      const group = groups[Number(gi)], room = group?.rooms[Number(ri)];
      if (!group || room === undefined) return;
      const dancers = ids.map(id => records.find(r => r.student.id === id)).filter(Boolean);
      if (!dancers.length) return;
      if (dancers.some(r => r.group !== group.key)) return say('Choose a classroom within the same school.');
      dancers.forEach(r => drafts.set(r.student.id, room)); selected.clear(); render();
    };
    const saveMoves = async () => {
      if (busy) return;
      const changes = records.filter(r => drafts.get(r.student.id) !== r.original);
      if (!changes.length) return;
      busy = true; render();
      try {
        if (!tour()) {
          const payload = changes.map(r => ({student_id:r.student.id, dance_class_id:r.rosterClass.id, expected_classroom:r.original, official_classroom:drafts.get(r.student.id)}));
          const {error} = await window.dtSupabase.rpc('save_official_classroom_moves', {moves:payload});
          if (error) throw error;
        }
        if (tour()) await persistTour(changes.map(r => [r.student.id, {officialClassroom:drafts.get(r.student.id)}]));
        for (const r of changes) {
          const room = drafts.get(r.student.id);
          updateCopies(r.student.id, s => { s.officialClassroom = room; });
          enrollmentIntakeQueue.filter(e => e.placed_student_id === r.student.id).forEach(e => { e.official_classroom = room; });
          r.original = room;
        }
        refreshRosters(); busy = false; render(); say('Move Ups saved. Dance classes are unchanged.');
      } catch (error) { console.warn('Roster care save failed', error); busy = false; render(); say(errorText(error)); }
    };
    const saveShoe = async button => {
      if (busy) return;
      const r = records.find(r => r.student.id === button.dataset.student), shoe = button.dataset.shoe;
      if (!r || !['tap','ballet'].includes(shoe)) return;
      const before = status(r.student, shoe), next = nextStatus(before, tooSmall);
      if (before === next) return;
      busy = true; render();
      try {
        if (!tour()) {
          const {error} = await window.dtSupabase.rpc('set_dancer_shoe_status', {target_student:r.student.id, shoe_type:shoe, new_status:next, expected_status:before});
          if (error) throw error;
        }
        if (tour()) await persistTour([[r.student.id, {shoeStatus:{...r.student.shoeStatus, [shoe]:next}}]]);
        updateCopies(r.student.id, s => { s.shoeStatus = {...s.shoeStatus, [shoe]:next}; });
        refreshRosters(); busy = false; render(); say(`${rosterStudentFirstName(r.student)} — ${shoe}: ${label(next)}. Saved.`);
        dialog.querySelector(`[data-student="${CSS.escape(r.student.id)}"][data-shoe="${shoe}"]`)?.focus();
      } catch (error) { console.warn('Roster care save failed', error); busy = false; render(); say(errorText(error)); }
    };
    document.getElementById('teacher-roster-shoe-check')?.addEventListener('click', e => open('shoes', e.currentTarget));
    document.getElementById('teacher-roster-move-ups')?.addEventListener('click', e => open('moves', e.currentTarget));
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.addEventListener('click', e => {
      if (suppressClick) { suppressClick = false; return; }
      if (e.target.closest('[data-care-close]')) return close();
      if (busy) return;
      if (e.target.closest('[data-too-small]')) { tooSmall = !tooSmall; render(); dialog.querySelector('[data-too-small]').focus(); return; }
      const shoe = e.target.closest('[data-shoe]'); if (shoe) return void saveShoe(shoe);
      if (e.target.closest('[data-care-save]')) return void saveMoves();
      if (e.target.closest('[data-care-reset]')) { records.forEach(r => drafts.set(r.student.id, r.original)); selected.clear(); render(); return; }
      const card = e.target.closest('[data-move-student]');
      if (card) { const id = card.dataset.moveStudent; selected.has(id) ? selected.delete(id) : selected.add(id); render(); dialog.querySelector(`[data-move-student="${CSS.escape(id)}"]`)?.focus(); return; }
      const destination = e.target.closest('[data-move-here]'); if (destination) move(destination.dataset.roomGroup, destination.dataset.roomIndex);
    });
    dialog.addEventListener('dragstart', e => {
      const card = e.target.closest('[data-move-student]'); if (!card || busy) return e.preventDefault();
      dragId = card.dataset.moveStudent; e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move';
    });
    dialog.addEventListener('dragover', e => { if (dragId && e.target.closest('[data-room-group]')) e.preventDefault(); });
    dialog.addEventListener('drop', e => {
      const zone = e.target.closest('[data-room-group]'); if (!zone || !dragId) return;
      e.preventDefault(); move(zone.dataset.roomGroup, zone.dataset.roomIndex, selected.has(dragId) ? [...selected] : [dragId]); dragId = '';
    });
    dialog.addEventListener('dragend', () => { dragId = ''; });
    // Touch drag uses pointer capture; tapping cards and Move here is also available.
    dialog.addEventListener('pointerdown', e => {
      const card = e.target.closest('[data-move-student]'); if (!card || busy || e.pointerType === 'mouse') return;
      pointer = {id:e.pointerId, student:card.dataset.moveStudent, x:e.clientX, y:e.clientY, active:false};
      card.setPointerCapture(e.pointerId);
    });
    dialog.addEventListener('pointermove', e => {
      if (!pointer || pointer.id !== e.pointerId) return;
      if (Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>10) pointer.active = true;
      if (!pointer.active) return;
      const content = dialog.querySelector('.care-content'), bounds = content.getBoundingClientRect();
      if (e.clientY > bounds.bottom-55) content.scrollTop += 14;
      if (e.clientY < bounds.top+55) content.scrollTop -= 14;
      dialog.querySelectorAll('.is-drop-target').forEach(n => n.classList.remove('is-drop-target'));
      document.elementFromPoint(e.clientX,e.clientY)?.closest('.care-group')?.classList.add('is-drop-target');
    });
    dialog.addEventListener('pointerup', e => {
      if (!pointer || pointer.id !== e.pointerId) return;
      const current = pointer; pointer = null;
      if (current.active) {
        suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
        const zone = document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-room-group]');
        if (zone) move(zone.dataset.roomGroup, zone.dataset.roomIndex, selected.has(current.student) ? [...selected] : [current.student]);
      }
      dialog.querySelectorAll('.is-drop-target').forEach(n => n.classList.remove('is-drop-target'));
    });
    dialog.addEventListener('pointercancel', () => { pointer = null; dialog.querySelectorAll('.is-drop-target').forEach(n => n.classList.remove('is-drop-target')); });
  });
})();
