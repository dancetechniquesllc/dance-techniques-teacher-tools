// One opt-in writing control for teacher prose; never submits forms or changes recipients.
const selectors=['article[aria-label="Teacher mobile PWA"] textarea','[data-reschedule-reason]','[data-partner-school-notes]','#future-reschedule-reason','#schedule-event-notes','textarea[id^="teacher-"]','textarea[id^="tt-"]','#teacher-activities-content textarea','#teacher-activities-content input[type="text"]','#teacher-class-post-custom-title','#teacher-desktop-task-input','[data-practice-title]','[data-practice-caption]','[data-dt-touch-field]'];
export function mountWritingFields({root=document,getClient=()=>window.dtSupabase,isPreview=()=>document.body.dataset.tourMode==='true'}={}) {
 const attach=field=>{
  if(field.dataset.dtTouchDisabled==='true'||field.dataset.dtTouchMounted||field.id==='teacher-parent-shared-reply'||field.readOnly||field.disabled||field.type==='search')return;
  if(/search|phone|email|birth|medical|password|url/i.test(field.id))return;
  field.dataset.dtTouchMounted='true';
  const wrap=document.createElement('div');wrap.className='dt-writing-field';
  field.before(wrap);wrap.append(field);
  const touch=document.createElement('button');touch.type='button';touch.className='dt-writing-touch';touch.setAttribute('aria-label','Add the DT Touch to '+(field.getAttribute('aria-label')||'this draft'));touch.title='Add the DT Touch ✨';touch.innerHTML='<img src="assets/dance-techniques-logo-only.png" alt="">';
  const undo=document.createElement('button');undo.type='button';undo.className='dt-writing-undo';undo.textContent='↶ Undo';undo.hidden=true;
  const status=document.createElement('small');status.className='dt-writing-status';status.setAttribute('role','status');wrap.append(touch,undo,status);
  let original='',lastRewrite='';
  undo.onclick=event=>{event.preventDefault();field.value=original;lastRewrite='';undo.hidden=true;status.textContent='Original draft restored.';field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));field.focus();};
  touch.onclick=async event=>{
   event.preventDefault();if(touch.disabled)return;
   const snapshot=field.value;if(!snapshot.trim()){status.textContent='Write your draft first.';field.focus();return;}
   if(snapshot===lastRewrite){status.textContent='DT Touch is already applied. You can keep editing.';return;}
   const client=getClient();if(!client||isPreview()){status.textContent='AI rewrites require signed-in Teacher Tools. Your draft is unchanged.';return;}
   touch.disabled=true;touch.setAttribute('aria-busy','true');status.textContent='Adding the DT Touch…';
   try{
    const audience=/task|note|feedback/i.test(field.id)?'internal_notes':/message-draft|reply-draft/i.test(field.id)?'staff':'parents_guardians';
    const {data,error}=await client.functions.invoke('dt-touch-rewrite',{body:{originalText:snapshot,context:'general',audience,fieldKind:/title/i.test(field.id)?'title':/caption/i.test(field.id)?'caption':audience==='internal_notes'?'note':'message',maxLength:field.maxLength>0?field.maxLength:6000}});
    if(error||!data?.ok){let details=data;if(error?.context?.json){try{details=await error.context.json();}catch{}}throw Error(details?.message||'DT Touch could not finish. Your draft is unchanged.');}
    if(!field.isConnected||field.value!==snapshot){status.textContent='Your draft changed. Please try again.';return;}
    if(typeof data.rewritten_text!=='string'||!window.DTTouch?.validateRewrite(window.DTTouch.analyze(snapshot),data.rewritten_text).valid)throw Error('A protected detail changed. Your draft is unchanged.');
    if(field.maxLength>0&&data.rewritten_text.length>field.maxLength)throw Error('The rewrite is too long for this field. Your draft is unchanged.');
    original=snapshot;lastRewrite=data.rewritten_text;field.value=lastRewrite;undo.hidden=false;status.textContent='DT Touch added. Review before sending or saving.';
    field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));field.focus();
   }catch(error){status.textContent=error.message;}finally{touch.disabled=false;touch.removeAttribute('aria-busy');}
  };
 };
 const scan=()=>root.querySelectorAll(selectors.join(',')).forEach(attach);
 new MutationObserver(scan).observe(root===document?document.body:root,{childList:true,subtree:true});scan();
}
mountWritingFields();
