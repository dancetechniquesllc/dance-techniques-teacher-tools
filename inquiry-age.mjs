// Calendar age, using the business timezone rather than a UTC date shift.
export function inquiryAge(birthday,now=new Date()){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday||'');if(!m)return '';
 const [y,mo,d]=m.slice(1).map(Number),date=new Date(Date.UTC(y,mo-1,d));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)return '';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(now).map(p=>[p.type,p.value]));
 let months=(Number(parts.year)-y)*12+Number(parts.month)-mo-(Number(parts.day)<d?1:0);if(months<0)return '';
 const years=Math.floor(months/12);months%=12;
 return years+' '+(years===1?'year':'years')+', '+months+' '+(months===1?'month':'months');
}
