import {generalNewsletterContext,cleanNewsletterWebHtml,newsletterWebUrl} from './newsletter-web-shared.mjs';
export async function openNewsletterWebDialog({client,buildSnapshot}) {
 const snapshot=buildSnapshot(generalNewsletterContext());
 const html=cleanNewsletterWebHtml(snapshot.html,{videoUrl:snapshot.videoUrl}),title=Array.from((String(snapshot.title||'').trim()||'Dance Techniques Newsletter')).slice(0,160).join('');
 if(html.length>8000000)throw new Error('This web version is too large. Use smaller uploaded pictures and retry. Your draft is unchanged.');
 const requestId=crypto.randomUUID();
 const dialog=document.createElement('dialog');dialog.className='newsletter-web-dialog';
 dialog.setAttribute('aria-labelledby','newsletter-web-title');
 dialog.innerHTML=`<div class="newsletter-web-heading"><h2 id="newsletter-web-title">General Web Newsletter</h2><button type="button" data-web-close aria-label="Close web newsletter">×</button></div><p>Uses your current design, with general wording instead of family fields. School-only text is left out. Anyone with the link can view this saved version; later draft edits won’t change it.</p><iframe title="General newsletter preview" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe><div class="newsletter-web-actions"><button type="button" class="primary" data-web-create>Create Web Link</button><button type="button" class="secondary" data-web-close>Close</button></div><p data-web-status role="status" aria-live="polite"></p><div data-web-result hidden><label>Link for Brightwheel<input readonly aria-label="Newsletter web link"></label><button type="button" class="secondary" data-web-copy>Copy Link</button><a target="_blank" rel="noopener noreferrer">Open Web View</a></div><h3>Recent Web Links</h3><div data-web-recent>Loading links…</div>`;
 document.body.append(dialog);dialog.querySelector('iframe').srcdoc=html;dialog.showModal();
 const status=dialog.querySelector('[data-web-status]'),create=dialog.querySelector('[data-web-create]');
 const say=(message,error=false)=>{status.textContent=message;status.classList.toggle('error',error);};
 const copy=async(url,input)=>{try{await navigator.clipboard.writeText(url);say('Link copied. Paste it into Brightwheel.');}catch{if(input){input.focus();input.select();}say('Select and copy the link above to paste into Brightwheel.');}};
 let createdUrl='';
 dialog.querySelectorAll('[data-web-close]').forEach(button=>button.onclick=()=>dialog.close());
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.querySelector('[data-web-copy]').onclick=()=>copy(createdUrl,dialog.querySelector('[data-web-result] input'));
 async function loadRecent(){
  const container=dialog.querySelector('[data-web-recent]');
  if(!client){container.textContent='Sign in to create and manage web links.';create.disabled=true;return;}
  try{
   const {data,error}=await client.from('newsletter_web_views').select('id,title,token,published_at,revoked_at').order('published_at',{ascending:false}).limit(10);
   if(error)throw error;
   container.replaceChildren();
   for(const record of data||[]){
    if(record.id===requestId&&record.revoked_at){createdUrl='';dialog.querySelector('[data-web-result]').hidden=true;create.textContent='Link Disabled';create.disabled=true;}
    const row=document.createElement('div');row.className='newsletter-web-recent-row';
    const name=document.createElement('strong');name.textContent=record.title;row.append(name);
    const date=document.createElement('small');date.textContent=new Date(record.published_at).toLocaleDateString()+(record.revoked_at?' · Link disabled':'');row.append(date);
    if(!record.revoked_at){
     const url=newsletterWebUrl(record.token);
     const input=document.createElement('input');input.readOnly=true;input.value=url;input.setAttribute('aria-label',`Web link for ${record.title}`);row.append(input);
     const buttons=document.createElement('div');buttons.className='newsletter-web-actions';
     const copyButton=document.createElement('button');copyButton.type='button';copyButton.className='secondary';copyButton.textContent='Copy Link';copyButton.onclick=()=>copy(url,input);buttons.append(copyButton);
     const disable=document.createElement('button');disable.type='button';disable.className='secondary';disable.textContent='Disable Link';
     disable.onclick=async()=>{disable.disabled=true;try{const {data,error}=await client.rpc('revoke_newsletter_web_view',{p_id:record.id});if(error||data!==true)throw error||new Error('Could not confirm this link was disabled.');if(record.id===requestId){createdUrl='';dialog.querySelector('[data-web-result]').hidden=true;create.textContent='Link Disabled';}say('Web link disabled.');await loadRecent();}catch(error){say(error.message||'The link could not be disabled.',true);disable.disabled=false;}};
     buttons.append(disable);row.append(buttons);
    }
    container.append(row);
   }
   if(!data?.length)container.textContent='No web links created yet.';
  }catch{container.textContent='Recent links could not load. Please try again later.';}
 }
 create.onclick=async()=>{
  if(!client)return say('Sign in as a director to create a web link.',true);
  create.disabled=true;say('Creating your web link…');
  try{
   const {data,error}=await client.rpc('publish_newsletter_web_view',{p_id:requestId,p_title:title,p_html:html});
   if(error)throw error;
   const record=data?.[0];if(record?.id!==requestId)throw new Error('The web link was not confirmed. Please retry.');
   createdUrl=newsletterWebUrl(record.token);
   const result=dialog.querySelector('[data-web-result]');result.hidden=false;result.querySelector('input').value=createdUrl;result.querySelector('a').href=createdUrl;
   create.textContent='Web Link Created ✓';say('Web link ready. Copy it into Brightwheel.');await loadRecent();
  }catch(error){say(error.message||'The link could not be created. Your draft is unchanged; please retry.',true);create.disabled=false;}
 };
 await loadRecent();
}
