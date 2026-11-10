/* Director corner controls. Statuses are manual and independent per person. */
(() => {
 const actions=document.querySelector('.session-actions'); if(!actions) return;
 const tour=()=>document.body.dataset.tourMode==='true';
 let sampleDb;
 const sampleChannel=new BroadcastChannel('dt-director-availability-preview');
 const sampleStore=async(person,status)=>{
  sampleDb ||= new Promise((resolve,reject)=>{const r=indexedDB.open('dt-director-availability-preview',1);r.onupgradeneeded=()=>r.result.createObjectStore('people',{keyPath:'person'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const db=await sampleDb;
  return new Promise((resolve,reject)=>{const tx=db.transaction('people',person?'readwrite':'readonly'),store=tx.objectStore('people');const req=person?store.get(person):store.getAll();req.onsuccess=()=>{if(person)store.put({person,status,revision:(req.result?.revision||0)+1});};tx.oncomplete=()=>resolve(person?null:Object.fromEntries(req.result.map(r=>[r.person,r])));tx.onerror=()=>reject(tx.error);});
 };
 const names={lexi:'Lexi',tiffany:'Tiffany'};
 const portraits={};let portraitCheckedAt=0,portraitLoading=false,portraitAccount='';
 const canEdit=()=>tour()||['admin','director'].includes(window.dtCurrentProfile?.role);
 const labels={busy:'Online and Busy',open:'Online and Open',offline:'Offline'};
 const safe=value=>escapeText(String(value||''));
 window.dtNotificationCategory=item=>{
  const type=String(item.notification_type||'').toLowerCase();
  if(['direct_message','studio_announcement','website_inquiry'].includes(type))return 'messages';
  if(/enrollment|roster|provisional|schedule|school_closure|jotform/.test(type))return 'enrollment';
  const text=[type,item.action_url,item.title].join(' ').toLowerCase();
  if(/feedback|shape.?the.?magic|shape-magic/.test(text)) return 'magic';
  if(/boutique|shirt|kit_|kit-|order|fulfill/.test(text)) return 'boutique';
  if(/direct_message|studio_announcement|open=messages/.test(text)) return 'messages';
  return 'enrollment';
 };
 const top=document.createElement('div'),middle=document.createElement('div'),bottom=document.createElement('div');
 top.className='director-corner-row director-corner-top';middle.className='director-corner-row director-corner-middle';bottom.className='director-corner-row director-corner-bottom';
 const original=actions.querySelector('.director-session-notifications'); const template=original.cloneNode(true);
 const messageShortcut=actions.querySelector('.director-message-shortcut');
 const icons={messages:messageShortcut.querySelector('svg').innerHTML,enrollment:'<circle cx="12" cy="6" r="3"/><path d="M8 10h8l3 11H5z"/>',boutique:'<path d="M5 8h14v13H5zM8 8V6a4 4 0 0 1 8 0v2"/><path d="M8 13c2-3 4 0 4 0s2-3 4 0c0 2-4 5-4 5s-4-3-4-5Z"/>',magic:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>'};
 let messagesPanel;
 for(const [category,title] of Object.entries({enrollment:'Enrollment Notifications',boutique:'Boutique Notifications',magic:'Magic Notifications',messages:'Message Notifications'})) {
  const panel=category==='enrollment'?original:template.cloneNode(true);
  panel.dataset.directorCategory=category;
  const summary=panel.querySelector('summary');summary.setAttribute('aria-label',title);summary.title=title;
  summary.querySelector('svg').innerHTML=icons[category];
  panel.querySelector('.notification-panel-head strong').textContent=title;
  if(category==='messages'){
   summary.querySelector('[data-notification-unread]').replaceWith(messageShortcut.querySelector('[data-notification-unread]'));
   messagesPanel=panel;
   continue;
  }
  const link=document.createElement('button');link.type='button';link.className='secondary';link.textContent=category==='magic'?'Open Shape the Magic':category==='boutique'?'Open Boutique':'Open Enrollment & Students';
  if(category==='magic'){link.classList.add('director-magic-artwork');link.setAttribute('aria-label','Open Shape the Magic');link.title='Open Shape the Magic';link.textContent='';const image=document.createElement('img');image.src='assets/director-open-shape-magic.png';image.alt='';link.append(image);}
  link.addEventListener('click',()=>{panel.open=false;openAdminSection(category==='magic'?'shape-the-magic':category==='boutique'?'boutique-backend':'student-library');});
  panel.querySelector('.teacher-notification-panel').append(link);
  top.append(panel);
 }
 const panels=[...top.querySelectorAll('details'),messagesPanel];
 for(const panel of panels){
  panel.addEventListener('toggle',()=>{
   if(!panel.open)return;
   for(const other of panels)if(other!==panel)other.open=false;
   if(panel.dataset.directorCategory==='magic')void loadStaffFeedbackInbox();
   if(panel===messagesPanel){
    void refreshWebInquiryCount();
    void loadSharedFamilyConversations();
   }
  });
 }
 [...panels.map(panel=>panel.querySelector('.teacher-notification-panel')),...document.querySelectorAll('.teacher-notification-panel:not(.director-session-notifications *)')].forEach(popup=>{
  const close=document.createElement('button');close.type='button';close.className='notification-popup-close';close.textContent='×';close.setAttribute('aria-label','Close Notifications');
  close.addEventListener('click',()=>{const details=popup.closest('details');details.open=false;details.querySelector('summary')?.focus();});
  popup.querySelector('.notification-panel-head').append(close);
 });
 middle.append(actions.querySelector('.director-task-shortcut'),messagesPanel,actions.querySelector('.director-settings-shortcut'));
 messageShortcut.remove();
 const messageChannels=[
  {view:'parents',label:'Parent Portal',description:'Need Attention'},
  {view:'team',label:'Teaching Team',description:'Unread'},
  {view:'web',label:'Web Submissions',description:'Unresolved'}
 ];
 const channelLinks=document.createElement('nav');
 channelLinks.className='director-message-channels';
 channelLinks.setAttribute('aria-label','Message Channels');
 for(const channel of messageChannels){
  const link=document.createElement('button');
  link.type='button';
  link.className='secondary director-message-channel';
  link.textContent=channel.label;
  channel.counter=document.createElement('span');
  link.append(channel.counter);
  link.addEventListener('click',()=>{
   messagesPanel.open=false;
   openCommunicationStudioView(channel.view);
  });
  channelLinks.append(link);
 }
 messagesPanel.querySelector('[data-notification-list]').before(channelLinks);
 let webInquiryCount,webInquiryAccount='',webInquiryRefreshAt=0,webInquiryRequest=0;
 const refreshWebInquiryCount=async({force=false}={})=>{
  const profile=window.dtCurrentProfile;
  if(tour()||!profile?.id||!canEdit()||!window.dtSupabase)return;
  if(webInquiryAccount!==profile.id){
   webInquiryAccount=profile.id;
   webInquiryCount=undefined;
   webInquiryRefreshAt=0;
   window.dtRenderMessagesCorner();
  }
  if(!force&&Date.now()-webInquiryRefreshAt<30000)return;
  webInquiryRefreshAt=Date.now();
  const request=++webInquiryRequest;
  try{
   const {count,error}=await window.dtSupabase.from('website_contact_submissions').select('id',{count:'exact',head:true}).neq('status','resolved');
   if(!error&&count!==null&&request===webInquiryRequest&&window.dtCurrentProfile?.id===profile.id){
    webInquiryCount=count;
    window.dtRenderMessagesCorner();
   }
  }catch{/* Keep the last known count until the next refresh. */}
 };
 window.dtRefreshWebInquiryCount=()=>refreshWebInquiryCount({force:true});
 window.addEventListener('dt-web-inquiry-count',({detail})=>{
  if(!detail?.profileId||detail.profileId!==window.dtCurrentProfile?.id||!canEdit())return;
  ++webInquiryRequest;
  webInquiryAccount=detail.profileId;
  webInquiryRefreshAt=Date.now();
  webInquiryCount=detail.count;
  window.dtRenderMessagesCorner();
 });
 window.dtRenderMessagesCorner=()=>{
  const unread=notificationCenterItems.filter(item=>!item.read_at&&!item.dismissed_at&&(!item.expires_at||new Date(item.expires_at)>new Date()));
  const countType=type=>unread.filter(item=>item.notification_type===type).length;
  const counts=[
   tour()||loadedFamilyConversationProfile===window.dtCurrentProfile?.id
    ? teacherParentPreviewConversations.filter(adminParentConversationNotReplied).length : 0,
   Math.max(unreadThreadCountFor('Admin',messageThreads),countType('direct_message'))+countType('studio_announcement'),
   (webInquiryAccount===window.dtCurrentProfile?.id?webInquiryCount:undefined)??countType('website_inquiry')
  ];
  messageChannels.forEach(({counter,description},index)=>{
   const label=counts[index]+' '+description;
   if(counter.textContent!==label)counter.textContent=label;
  });
  const count=counts.reduce((total,value)=>total+value,0);
  const badge=messagesPanel.querySelector('[data-notification-unread]');
  badge.textContent=count>99?'99+':String(count);
  badge.classList.toggle('active',count>0);
  messagesPanel.querySelector('summary').setAttribute('aria-label',count?'Message Notifications, '+count+' need attention':'Message Notifications');
  messagesPanel.querySelector('.notification-empty')?.toggleAttribute('hidden',count>0);
 };
 let rows={},editing='',busy=false,unavailable=false,channel,profileId='',request=0;
 const dialog=document.createElement('dialog');dialog.className='director-status-dialog';dialog.setAttribute('aria-labelledby','director-presence-title');
 dialog.innerHTML='<h2 id="director-presence-title">Availability</h2><div class="director-status-options">'+Object.entries(labels).map(([value,label])=>`<button type="button" data-availability="${value}" aria-pressed="false"><i aria-hidden="true" style="--dot:${value==='busy'?'#d6a11a':value==='open'?'#4b9a51':'#c34548'}"></i>${label}</button>`).join('')+'</div><p class="director-status-note" role="status"></p><button type="button" data-presence-close>Close</button>';
 dialog.querySelector('[data-presence-close]').onclick=()=>dialog.close();
 const note=text=>dialog.querySelector('[role=status]').textContent=text;
 const render=()=>{
  for(const person of Object.keys(names)) {
   const button=bottom.querySelector(`[data-director-person="${person}"]`);if(!button)continue;
   const record=unavailable?null:rows[person];
   if(record)button.dataset.status=record.status;else delete button.dataset.status;
   button.setAttribute('aria-label',`${names[person]}: ${record?labels[record.status]:(unavailable?'Status unavailable':'Status not set')}${canEdit()?'. Set availability':''}`);
   button.setAttribute('aria-disabled',String(!canEdit()));
   button.title=`${names[person]} · ${record?labels[record.status]:(unavailable?'Status unavailable':'Status not set')}`;
   const teacher=teachers.find(t=>String(t.firstName||'').toLowerCase()===person);
   const photo=portraits[person]??teacher?.photo??'';
   if(button.dataset.photo!==photo){button.replaceChildren();if(photo){const img=document.createElement('img');img.src=photo;img.alt=names[person];button.append(img);}else button.textContent=names[person][0];button.dataset.photo=photo;}
  }
 };
 const idleLimit=60*60*1000;
 let promptedAccount='',sessionDirector='',lastActivityAt=0,syncedActivityAt=0,lastActivityRequest=0,activityPending=false;
 const availabilityPreview=new URLSearchParams(location.search).get('availability-preview');
 const namedDirector=()=>{
  if(tour())return availabilityPreview==='1'?'lexi':'';
  if(!canEdit())return '';
  const first=String(window.dtCurrentProfile?.full_name||'').trim().toLowerCase().replace(/^ms\.?\s+/,'').split(/\s+/)[0];
  return Object.hasOwn(names,first)?first:'';
 };
 const ownDirector=()=>namedDirector()||sessionDirector;
 const options=dialog.querySelector('.director-status-options');
 const chooser=document.createElement('div');
 chooser.className='director-status-options';
 chooser.hidden=true;
 for(const [person,label] of Object.entries(names)){
  const choice=document.createElement('button');
  choice.type='button';
  choice.textContent=label;
  choice.addEventListener('click',()=>{
   sessionDirector=person;
   showAvailability(person);
  });
  chooser.append(choice);
 }
 options.before(chooser);
 const showAvailability=person=>{
  editing=person;
  chooser.hidden=Boolean(person);
  options.hidden=!person;
  document.getElementById('director-presence-title').textContent=person?names[person]+"’s Availability":'Who’s Working in DD?';
  dialog.querySelectorAll('[data-availability]').forEach(button=>button.setAttribute('aria-pressed',String(rows[person]?.status===button.dataset.availability)));
  note(person?'Choose your availability. After an hour without activity in DD, it switches to Offline.':'Choose whose availability to set.');
  if(!dialog.open)dialog.showModal();
  else options.querySelector('button')?.focus();
 };
 const promptOnDashboard=()=>{
  const account=tour()?(availabilityPreview?'preview':''):window.dtCurrentProfile?.id;
  if(!canEdit()||!account||document.body.dataset.mode!=='admin'||promptedAccount===account)return;
  promptedAccount=account;
  showAvailability(ownDirector());
 };
 const recordDashboardActivity=event=>{
  if(!event.isTrusted||document.hidden||document.body.dataset.mode!=='admin'||!ownDirector())return;
  const now=Date.now();
  if(lastActivityAt&&now-lastActivityAt>=idleLimit&&rows[ownDirector()]?.status==='offline')showAvailability(ownDirector());
  lastActivityAt=now;
  void syncDashboardActivity();
 };
 const syncDashboardActivity=async()=>{
  const person=ownDirector(),account=window.dtCurrentProfile?.id,now=Date.now();
  if(!person||document.body.dataset.mode!=='admin'||!lastActivityAt||activityPending||busy)return;
  const row=rows[person];
  if(!row||!['open','busy'].includes(row.status))return;
  if(tour()){
   if(now-lastActivityAt>=idleLimit){await sampleStore(person,'offline');sampleChannel.postMessage('changed');await refresh();}
   return;
  }
  const age=Math.floor((now-lastActivityAt)/1000);
  if(age>=3600||lastActivityAt<=syncedActivityAt||now-lastActivityRequest<30000)return;
  const activity=lastActivityAt;
  lastActivityRequest=now;
  activityPending=true;
  try{
   const {error}=await window.dtSupabase.rpc('record_director_dashboard_activity',{expected_account:account,target_person:person,expected_revision:row.revision,activity_age_seconds:age});
   if(!error&&account===window.dtCurrentProfile?.id)syncedActivityAt=activity;
  }catch{/* Retry from the next active DD sync. */}
  finally{activityPending=false;}
 };
 for(const person of Object.keys(names)) {
  const button=document.createElement('button');button.type='button';button.className='director-presence';button.dataset.directorPerson=person;button.textContent=names[person][0];
  button.onclick=()=>{if(!canEdit())return;showAvailability(person);void refresh();};
  bottom.append(button);
 }
 bottom.append(actions.querySelector('#auth-sign-out'));actions.classList.add('director-corner');actions.prepend(top,middle);document.body.append(dialog);
 const footer=document.createElement('div');footer.className='director-corner director-corner-footer';footer.append(bottom);document.getElementById('session-strip').append(footer);
 const refresh=async()=>{
  if(busy)return;
  const current=++request;
  try{
   if(tour()){rows=await sampleStore();}
   else{
    const id=window.dtCurrentProfile?.id;if(!id||!['admin','director','teacher'].includes(window.dtCurrentProfile?.role))return;
    const {data,error}=await window.dtSupabase.rpc('get_director_availability');
    if(error)throw error;if(current!==request)return;rows=Object.fromEntries((data||[]).map(r=>[r.person,r]));
   }
   unavailable=false;render();
  }catch{unavailable=true;render();if(dialog.open)note('Status could not sync. Please try again.');}
 };
 dialog.querySelectorAll('[data-availability]').forEach(button=>button.onclick=async()=>{
  if(busy||!canEdit())return;busy=true;++request;dialog.querySelectorAll('[data-availability]').forEach(b=>b.disabled=true);note('Saving…');
  const person=editing,status=button.dataset.availability;
  try{
   if(tour()){
    await sampleStore(person,status);rows=await sampleStore();sampleChannel.postMessage('changed');render();
   }else{
    const {error}=await window.dtSupabase.rpc('set_director_availability',{expected_account:window.dtCurrentProfile.id,target_person:person,new_status:status,expected_revision:rows[person]?.revision||0});if(error)throw error;
   }
   if(person===ownDirector()&&document.body.dataset.mode==='admin')lastActivityAt=syncedActivityAt=Date.now();
   note('Status saved');dialog.close();
  }catch(error){note(error.message||'Status did not save. Please try again.');}
  finally{busy=false;dialog.querySelectorAll('[data-availability]').forEach(b=>b.disabled=false);await refresh();}
 });
 const refreshPortraits=async()=>{
  if(tour()||portraitLoading||!window.dtSupabase||!['admin','director'].includes(window.dtCurrentProfile?.role))return;
  if(portraitAccount!==window.dtCurrentProfile.id){portraitAccount=window.dtCurrentProfile.id;portraitCheckedAt=0;for(const person of Object.keys(names))delete portraits[person];}
  if(Date.now()-portraitCheckedAt<60000)return;
  const people=Object.keys(names).map(person=>({person,teacher:teachers.find(t=>String(t.firstName||'').trim().toLowerCase()===person)})).filter(p=>isUuid(p.teacher?.id));
  if(people.length!==2)return;
  portraitLoading=true;
  try{
   const {data,error}=await window.dtSupabase.from('teacher_portal_state').select('teacher_id,photo:payload->teacher->>photo').in('teacher_id',people.map(p=>p.teacher.id));
   if(error)return;
   for(const person of people){const saved=data?.find(row=>row.teacher_id===person.teacher.id);if(typeof saved?.photo==='string')portraits[person.person]=saved.photo;}
   portraitCheckedAt=Date.now();render();
  }finally{portraitLoading=false;}
 };
 const connect=async()=>{
  render();void refreshWebInquiryCount();void refreshPortraits().catch(()=>{});
  if(!tour()&&window.dtSupabase&&window.dtCurrentProfile?.id!==profileId){
   if(channel)await window.dtSupabase.removeChannel(channel);profileId=window.dtCurrentProfile?.id||'';
   if(profileId)channel=window.dtSupabase.channel('director-availability-'+profileId).on('postgres_changes',{event:'*',schema:'public',table:'director_availability'},refresh).subscribe();
  }
  await refresh();
  promptOnDashboard();
  await syncDashboardActivity();
  window.dtRenderBoutiqueCorner?.();
 };
 window.dtRenderBoutiqueCorner=()=>{
  const panel=top.querySelector('[data-director-category=boutique] .teacher-notification-panel');
  panel.querySelector('[data-boutique-pending]')?.remove();
  const box=document.createElement('div');box.dataset.boutiquePending='';let pending=0;
  for(const [id,label,selector] of [['boutique-kits-not-ready','T-Shirts & Bags to fill','[data-boutique-summary-status="waiting"]'],['boutique-orders-to-fill','Boutique orders to fill','[data-boutique-order-summary-status="to_fill"]']]){
   const count=Number(document.getElementById(id)?.textContent)||0;pending+=count;
   if(count){const button=document.createElement('button');button.type='button';button.className='notification-item';button.textContent=`${count} ${label}`;button.onclick=()=>{top.querySelector('[data-director-category=boutique]').open=false;openAdminSection('boutique-backend');document.querySelector(selector)?.click();};box.append(button);}
  }
  panel.append(box);const count=pending+notificationCenterItems.filter(i=>window.dtNotificationCategory(i)==='boutique'&&!i.read_at&&!i.dismissed_at&&(!i.expires_at||new Date(i.expires_at)>new Date())).length;
  const badge=top.querySelector('[data-director-category=boutique] [data-notification-unread]');badge.textContent=String(count);badge.classList.toggle('active',count>0);badge.setAttribute('aria-label',`${count} Boutique updates`);
  panel.querySelector('.notification-empty')?.toggleAttribute('hidden',pending>0);
 };
 window.dtRenderMagicCorner=()=>{
  const panel=top.querySelector('[data-director-category=magic] .teacher-notification-panel');
  panel.querySelector('[data-magic-submissions]')?.remove();
  const items=staffFeedbackSubmissions.filter(i=>i.status==='new');
  const box=document.createElement('div');box.dataset.magicSubmissions='';
  for(const item of items){const b=document.createElement('button');b.type='button';b.className='notification-item';b.textContent=`${item.source==='parent'?'Parent':'Teacher'} · ${item.submitter_name} · ${item.category}`;b.onclick=()=>{top.querySelector('[data-director-category=magic]').open=false;shapeMagicSource=item.source==='parent'?'parent':'teacher';openAdminSection('shape-the-magic');renderStaffFeedbackInbox();};box.append(b);}
  panel.append(box);panel.querySelector('.notification-empty')?.toggleAttribute('hidden',items.length>0);
  const badge=top.querySelector('[data-director-category=magic] [data-notification-unread]');const count=items.length+notificationCenterItems.filter(i=>window.dtNotificationCategory(i)==='magic'&&!i.read_at&&!i.dismissed_at&&(!i.expires_at||new Date(i.expires_at)>new Date())).length;badge.textContent=String(count);badge.classList.toggle('active',count>0);badge.setAttribute('aria-label',`${count} new Magic notifications`);
 };
 sampleChannel.onmessage=()=>{if(tour())void refresh();};
 window.addEventListener('dt-auth-ready',()=>{
  void connect();
  if(canEdit())void loadSharedFamilyConversations();
 });
 window.addEventListener('dt-auth-cleared',()=>{
  promptedAccount='';sessionDirector='';lastActivityAt=syncedActivityAt=lastActivityRequest=0;
  if(dialog.open)dialog.close();
 });
 for(const type of ['pointerdown','keydown','wheel','touchstart','input']){
  document.addEventListener(type,recordDashboardActivity,{capture:true,passive:true});
 }
 new MutationObserver(promptOnDashboard).observe(document.body,{attributes:true,attributeFilter:['data-mode']});
 window.addEventListener('focus',connect);window.addEventListener('online',connect);
 setInterval(()=>{if(!document.hidden)void connect();},5000);
 const countObserver=new MutationObserver(()=>window.dtRenderBoutiqueCorner());
 for(const id of ['boutique-kits-not-ready','boutique-orders-to-fill']){const el=document.getElementById(id);if(el)countObserver.observe(el,{childList:true,subtree:true,characterData:true});}
 renderNotificationCenter();render();void connect();
})();
