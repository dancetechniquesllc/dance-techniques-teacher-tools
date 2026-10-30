import {cleanNewsletterWebHtml} from './newsletter-web-shared.mjs';
const status=document.getElementById('status'),frame=document.getElementById('newsletter');
// Brightwheel may reuse the same browser tab for a different newsletter.
window.addEventListener('hashchange',()=>location.reload());
try{
 const token=location.hash.slice(1);
 if(!/^[a-f0-9]{64}$/.test(token))throw new Error('This newsletter link is unavailable. Please ask Dance Techniques for the current link.');
 const response=await fetch('https://pgagpvfiplizahsnmvxf.supabase.co/rest/v1/rpc/read_newsletter_web_view',{method:'POST',credentials:'omit',headers:{apikey:'sb_publishable_ZypHy48w_5CFqkjpuRYCbA_802_MDed','Content-Type':'application/json'},body:JSON.stringify({p_token:token}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('The newsletter could not open. Please try again shortly.');
 const rows=await response.json(),record=rows?.[0];
 if(!record?.html)throw new Error('This newsletter link is unavailable. Please ask Dance Techniques for the current link.');
 document.title=`${record.title} · Dance Techniques`;document.getElementById('title').textContent=record.title;
 frame.title=record.title;frame.srcdoc=cleanNewsletterWebHtml(record.html);frame.hidden=false;status.hidden=true;
}catch(error){status.textContent=error.message||'The newsletter could not open. Please try again.';}
