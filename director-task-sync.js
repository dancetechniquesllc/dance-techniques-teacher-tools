/* Shared director inbox: per-task changes, durable outbox, additive legacy import.
   Original browser-only data is retained under its original key for recovery. */
(() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const tour = () => document.body.dataset.tourMode === 'true';
  let account = '', ready = false, running = false, baseline = [], outbox = [], database, starting;
  const status = text => { const el = document.getElementById('director-task-sync-status'); if (el) el.textContent = text; };
  const db = () => database ||= new Promise((resolve,reject) => {
    const request = indexedDB.open('dt-shared-director-tasks',1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const storage = async (key,value) => {
    const database = await db();
    return new Promise((resolve,reject) => {
      const tx = database.transaction('state',value === undefined ? 'readonly' : 'readwrite');
      const req = value === undefined ? tx.objectStore('state').get(key) : tx.objectStore('state').put(value,key);
      tx.oncomplete = () => resolve(req.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  };
  const authorized = () => !tour() && ['director','admin'].includes(window.dtCurrentProfile?.role);
  const read = async () => {
    const rows=[];
    for(let offset=0;;offset+=500) {
      const {data,error} = await window.dtSupabase.from('director_tasks').select('id,task,deleted').eq('account_id',account).order('id').range(offset,offset+499);
      if(error) throw error;
      rows.push(...(data || []));
      if(!data || data.length<500) return rows;
    }
  };
  const apply = rows => {
    baseline = rows.filter(r=>!r.deleted).map(r=>r.task);
    directorParentTasks = clone(baseline);
    window.dtDirectorTaskDeleted = new Set(rows.filter(r=>r.deleted).map(r=>r.id));
    renderDirectorParentTasks();
  };
  const send = async changes => {
    if(!changes.length) return;
    const {error} = await window.dtSupabase.rpc('save_director_task_changes',{changes,expected_account:account});
    if(error) throw error;
  };
  const flush = async () => {
    if(running || !ready) return;
    running = true;
    try {
      while(outbox.length) {
        status('Saving shared tasks…');
        const batch = outbox.slice();
        await storage(account+':outbox',outbox);
        await send(batch);
        outbox.splice(0,batch.length);
        await storage(account+':outbox',outbox);
      }
      const rows = await read();
      if(!outbox.length) { apply(rows); status('Shared with this account · Up to date'); }
    } catch(error) {
      status('Not shared yet — '+(error.message || 'Check your connection')+'. Use Retry or Review shared tasks.');
    } finally { running=false; }
  };
  const ensure = async () => {
    if(!authorized()) return;
    if(ready && account===window.dtCurrentProfile.id) return;
    if(starting) return starting;
    starting = (async()=>{
      account = window.dtCurrentProfile.id;
      directorParentTasks=[]; renderDirectorParentTasks();
      ready=false; status('Opening shared tasks…');
      outbox = await storage(account+':outbox') || [];
      if(!await storage(account+':imported')) {
        let legacy=[];
        try { const value=JSON.parse(localStorage.getItem('dt-director-parent-tasks') || '[]'); if(Array.isArray(value)) legacy=value.filter(t=>t && typeof t.id==='string').map(t=>({...t,notes:Array.isArray(t.notes)?t.notes:[]})); } catch {}
        await storage(account+':original-tasks',legacy);
        for(let i=0;i<legacy.length;i+=200) await send(legacy.slice(i,i+200).map(task=>({kind:'import',id:task.id,task})));
        await storage(account+':imported',true);
      }
      apply(await read());
      ready=true;
      await flush();
    })().catch(error=>{status('Shared tasks unavailable — '+(error.message || 'Check your connection')+'. Your original tasks are preserved.');throw error;}).finally(()=>{starting=null;});
    return starting;
  };
  window.dtEnsureDirectorTasks = ensure;
  window.dtSaveDirectorTasks = () => {
    if(!authorized()) { localStorage.setItem('dt-director-parent-tasks',JSON.stringify(directorParentTasks)); return; }
    if(!ready) { status('Wait for shared tasks to finish loading.'); return; }
    const before = new Map(baseline.map(t=>[t.id,t]));
    const after = new Map(directorParentTasks.map(t=>[t.id,t]));
    for(const [id,task] of after) {
      const old=before.get(id);
      if(!old) { if(!window.dtDirectorTaskDeleted?.has(id)) outbox.push({kind:'create',id,task:clone(task)}); }
      else {
        const patch={};
        for(const key of Object.keys(task)) if(JSON.stringify(old[key])!==JSON.stringify(task[key])) patch[key]=clone(task[key]);
        if(Object.keys(patch).length) outbox.push({kind:'patch',id,patch,expected:clone(old)});
      }
    }
    for(const [id,task] of before) if(!after.has(id)) outbox.push({kind:'delete',id,expected:clone(task)});
    baseline=clone(directorParentTasks);
    status('Saving shared tasks…');
    void flush();
  };
  const refresh = async () => {
    if(!authorized() || running) return;
    try { await ensure(); if(outbox.length) await flush(); else { running=true; apply(await read()); status('Shared with this account · Up to date'); } }
    catch(error) { status('Could not refresh shared tasks. Check your connection.'); }
    finally { running=false; }
  };
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-director-task-retry]')) { void refresh(); return; }
    if(event.target.closest('[data-director-task-review]')) {
      if(running) return;
      if(outbox.length && !confirm('Show the latest shared list? Your unsaved changes will be kept in a recovery copy on this device, but will not be applied.')) return;
      void (async()=>{ running=true; try { await storage(account+':recovery:'+Date.now(),outbox); await storage(account+':outbox',[]); outbox=[]; } catch { status('Could not keep a recovery copy. Your pending changes have been retained.'); return; } finally { running=false; } await refresh(); })();
      return;
    }
    if(authorized() && (!ready || running) && event.target.closest('[data-director-task-add],#director-task-list,[data-task-complete-confirm],[data-task-remove-confirm]')) {
      event.preventDefault(); event.stopImmediatePropagation(); status('Please wait while shared tasks save or refresh.');
    }
    if(event.target.closest('[data-open-director-tasks]')) void refresh();
  },true);
  document.addEventListener('change',event=>{
    if(authorized() && (!ready || running) && event.target.closest('#director-task-list')) { event.stopImmediatePropagation(); renderDirectorParentTasks(); }
  },true);
  window.addEventListener('dt-auth-ready',()=>{ void ensure().then(()=>loadParentServiceRequestTasks()).catch(()=>{}); });
  window.addEventListener('online',()=>void refresh());
  window.addEventListener('focus',()=>void refresh());
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) void refresh(); });
  setInterval(()=>{ if(!document.hidden) void refresh(); },15000);
  if(tour()) { status('Preview tasks · This device only'); document.querySelector('[data-director-task-retry]')?.setAttribute('hidden',''); document.querySelector('[data-director-task-review]')?.setAttribute('hidden',''); }
  else void ensure().then(()=>loadParentServiceRequestTasks()).catch(()=>{});
})();
