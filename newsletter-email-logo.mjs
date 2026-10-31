// Flatten browser-only masks into a PNG before the existing secure image upload.
export async function renderNewsletterEmailLogo(spec) {
  const width = Math.max(60, Math.min(360, Number(spec.width) || 150));
  const badged = ['circle-outline','solid-circle','solid-heart'].includes(spec.shape);
  const height = badged || spec.male ? width : width / 2.15;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * 3); canvas.height = Math.ceil(height * 3);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The newsletter logo could not be prepared. Nothing was sent.');
  ctx.scale(3,3);
  if (badged) {
    ctx.save(); ctx.beginPath();
    if (spec.shape === 'solid-heart') {
      const heart = new Path2D('M32 56C27 50 3 37 3 19 3 8 11 2 20 2c6 0 10 3 12 8 2-5 6-8 12-8 9 0 17 6 17 17 0 18-24 31-29 37Z');
      ctx.save(); ctx.scale(width/64,width/64); ctx.translate(0,3); ctx.fillStyle=spec.badgeColor; ctx.fill(heart); ctx.restore();
    } else {
      ctx.arc(width/2,height/2,width/2-2,0,Math.PI*2);
      if (spec.shape === 'circle-outline') {ctx.strokeStyle=spec.badgeColor;ctx.lineWidth=4;ctx.stroke();}
      else {ctx.fillStyle=spec.badgeColor;ctx.fill();}
    }
    ctx.restore();
  }
  const image = new Image(); image.crossOrigin='anonymous';
  await new Promise((resolve,reject) => {const timer=setTimeout(()=>reject(new Error('The newsletter logo could not be loaded. Nothing was sent.')),15000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error('The newsletter logo could not be loaded. Nothing was sent.'));};image.src=new URL(spec.male?'./assets/boy-d-logo.png':'./assets/dance-techniques-logo-only.png',import.meta.url).href;});
  const logo = document.createElement('canvas'); logo.width=canvas.width;logo.height=canvas.height;
  const ink=logo.getContext('2d');
  const boxWidth=badged ? width*(spec.male ? .419 : .88) : width;
  const boxHeight=badged ? width*(spec.male ? .419 : .65) : height;
  const scale=Math.min(boxWidth/image.naturalWidth,boxHeight/image.naturalHeight);
  const logoWidth=image.naturalWidth*scale, logoHeight=image.naturalHeight*scale;
  ink.drawImage(image,(width-logoWidth)/2*3,(height-logoHeight)/2*3,logoWidth*3,logoHeight*3);
  ink.globalCompositeOperation='source-in';ink.fillStyle=spec.color;ink.fillRect(0,0,logo.width,logo.height);
  ctx.save();
  if (badged && spec.shape !== 'solid-heart') {ctx.beginPath();ctx.arc(width/2,height/2,width/2-4,0,Math.PI*2);ctx.clip();}
  ctx.drawImage(logo,0,0,width,height);ctx.restore();
  return {src:canvas.toDataURL('image/png'),width,height};
}
export async function prepareNewsletterEmailLogos(messages, render=renderNewsletterEmailLogo) {
  if (!messages.some(message=>String(message.html||'').includes('data-newsletter-email-logo='))) return messages;
  const cache=new Map();
  return Promise.all(messages.map(async message=>{
    if (!String(message.html||'').includes('data-newsletter-email-logo=')) return message;
    const doc=new DOMParser().parseFromString(message.html,'text/html');
    for (const element of doc.querySelectorAll('[data-newsletter-email-logo]')) {
      const raw=element.getAttribute('data-newsletter-email-logo');
      if(!cache.has(raw)) cache.set(raw,render(JSON.parse(raw)));
      const logo=await cache.get(raw), img=doc.createElement('img');
      img.src=logo.src;img.alt='Dance Techniques';img.width=logo.width;img.height=Math.round(logo.height);
      img.style.cssText=`display:block;width:${logo.width}px;max-width:80%;height:auto;margin:0 auto;`;
      element.replaceWith(img);
    }
    return {...message,html:'<!DOCTYPE html>'+doc.documentElement.outerHTML};
  }));
}
