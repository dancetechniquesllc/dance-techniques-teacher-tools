export const generalNewsletterContext = () => ({
 '[Parent First Name]':'Dance Family','[Dancer Name]':'your dancer','[Dancer First Name]':'your dancer','[Dancer Preferred Name]':'your dancer',
 '[School Nickname]':'your school','[Teacher Name]':'your Dance Techniques teacher','[Dance Day]':'dance day','[Dance Time]':'class time','[AM or PM]':'mornings or afternoons','[Director First Name]':'School Director','[School Specific Phrase]':'',__teacherId:'',__schoolConditionKeys:[]
});
export const newsletterWebUrl = token => {
 if (!/^[a-f0-9]{64}$/.test(token || '')) throw new Error('The web link could not be verified.');
 return `https://app.dancetechniques.info/newsletter.html#${token}`;
};
export function cleanNewsletterWebHtml(html, {videoUrl} = {}) {
 const doc=new DOMParser().parseFromString(String(html),'text/html');
 if(videoUrl){
  try{const url=new URL(videoUrl);if(['https:','http:'].includes(url.protocol)){const section=doc.createElement('p');section.style.cssText='text-align:center;margin:24px 0';const link=doc.createElement('a');link.href=url.href;link.textContent='▶ Watch Video';link.style.cssText='display:inline-block;padding:12px 20px;background:#8A4E54;color:white;border-radius:24px;text-decoration:none';section.append(link);(doc.querySelector('main')||doc.body).append(section);}}catch{}
 }
 doc.querySelectorAll('script,iframe,object,embed,form,input,textarea,select,button,base,meta[http-equiv],link[rel="preload"]').forEach(node=>node.remove());
 for(const node of doc.querySelectorAll('*')) for(const attr of [...node.attributes]) {
  if(/^on/i.test(attr.name)||attr.name==='srcdoc')node.removeAttribute(attr.name);
  if(['srcset','formaction','ping','background','xlink:href'].includes(attr.name.toLowerCase()))node.removeAttribute(attr.name);
  if(['href','src'].includes(attr.name.toLowerCase())) {
   const raw=attr.value.trim();
   if(attr.name==='src'&&/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/]+=*$/i.test(raw))continue;
   try {
    const url=new URL(raw,'https://app.dancetechniques.info/');
    const allowed=attr.name==='href'?['https:','http:','mailto:','tel:']:['https:','http:'];
    if(!allowed.includes(url.protocol))node.removeAttribute(attr.name);
    else if(!raw.startsWith('#'))node.setAttribute(attr.name,url.href);
   }catch{node.removeAttribute(attr.name);}
  }
 }
 for(const anchor of doc.querySelectorAll('a[href]')){anchor.target=anchor.getAttribute('href').startsWith('#')?'_self':'_blank';anchor.rel='noopener noreferrer';}
 const referrer=doc.createElement('meta');referrer.name='referrer';referrer.content='no-referrer';doc.head.append(referrer);
 const viewport=doc.createElement('meta');viewport.name='viewport';viewport.content='width=device-width, initial-scale=1';doc.head.append(viewport);
 return '<!doctype html>'+doc.documentElement.outerHTML;
}
