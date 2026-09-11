/* Frozen payroll statements. No roster lookups occur when viewing an issued statement. */
(function (root) {
  'use strict';
  const cents = value => Math.round(Number(value || 0) * 100);
  const dollars = value => value ? '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
  const countLabel = n => n ? String(n) : '-';
  const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const sum = rows => rows.reduce((n, row) => n + cents(row.held ? 0 : row.amount), 0) / 100;
  const group = (rows, key) => rows.reduce((result, row) => { (result[key(row)] ||= []).push(row); return result; }, {});
  function snapshot({ teacher, month, payDate, sequence, lines, payment, firstPayment, advanceCredit = 0, paidToDate, ownStudents }) {
    if (!teacher.id || !teacher.name || !/^\d{4}-\d{2}$/.test(month)) throw new Error('Payroll statement is missing its teacher or period.');
    if (lines.some(row => !Number.isFinite(Number(row.amount)))) throw new Error('Payroll has an invalid amount.');
    const earnings = sum(lines);
    if (payment < 0 || !Number.isFinite(payment)) throw new Error('Payroll payment must be zero or positive.');
    // Commission names are aggregated by teacher; only this teacher's own student names are retained.
    const commissionGroups = group(lines.filter(row => row.type === 'Commission'), row => `${row.sourceTeacherName}::${row.sourceTier}::${row.category === 'none' ? 'Regular' : 'Staff/Sibling'}`);
    const commissions = Object.entries(commissionGroups).map(([key, rs]) => {
      const [teacherName, tier, category] = key.split('::');
      const rates = [...new Set(rs.filter(r => !r.held).map(r => Number(r.rate || r.amount)))];
      return { teacherName, tier, category, included: rs.filter(r => !r.held && r.amount > 0).length, amount: sum(rs), rate: rates.length === 1 ? rates[0] : null };
    });
    const safeLines = lines.filter(row => row.type !== 'Commission').map(row => {
      const { studentId, ...safe } = row; return safe;
    });
    return JSON.parse(JSON.stringify({ version: 1, teacher, month, payDate, sequence: Number(sequence), earnings,
      payment, firstPayment: Number(firstPayment || 0), advanceCredit, paidToDate, commissions, lines: safeLines, ownStudents }));
  }
  async function pdf(s, logoBytes) {
    const { PDFDocument, StandardFonts, rgb } = root.PDFLib;
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const logo = logoBytes ? await doc.embedPng(logoBytes) : null;
    let page, y;
    const clean = text => String(text ?? '').replace(/[\u2010-\u2015]/g, '-').replace(/[^\x20-\x7e\xa0-\xff]/g, '');
    const wrap = (text, width, size = 9, font = regular) => {
      const words = clean(text).split(/\s+/), result = []; let line = '';
      for (const word of words) {
        if (font.widthOfTextAtSize((line ? line + ' ' : '') + word, size) > width && line) { result.push(line); line = word; }
        else line += (line ? ' ' : '') + word;
      }
      result.push(line); return result;
    };
    const text = (value, x, yy, size = 9, strong = false, color = rgb(0,0,0)) => page.drawText(clean(value), { x, y: yy, size, font: strong ? bold : regular, color });
    function newPage() {
      page = doc.addPage([612,792]); y = 685;
      if (logo) page.drawImage(logo,{ x:38,y:723,width:48,height:48 });
      text('DANCE TECHNIQUES',96,752,12,true);text('PAY STATEMENT',96,737,8);
      text(s.teacher.name,330,754,16,true);text(`Pay period: ${new Date(s.month+'-01T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'})}`,330,737,9);text(`Pay date: ${dateLabel(s.payDate)}`,330,723,9);
      page.drawLine({ start:{x:38,y:710},end:{x:574,y:710},thickness:.5,color:rgb(.75,.75,.75) });
      text(`Page ${doc.getPageCount()}`,535,26,8);text('Dance Techniques - Private pay statement',38,26,8);
    }
    function ensure(height) { if (y - height < 48) newPage(); }
    function heading(label) { ensure(40); text(label,38,y,13,true);y-=24; }
    function table(headers, rows, widths) {
      function row(cells, header) {
        const strong = header || cells.some(cell => /total|paid to date|estimated.*payment/i.test(String(cell)));
        const wrapped = cells.map((cell,i) => wrap(cell,widths[i]-12,9,strong?bold:regular));
        const h = Math.max(...wrapped.map(x=>x.length))*12+9;
        if (y-h<48) { newPage(); if (!header) row(headers,true); }
        page.drawRectangle({x:38,y:y-h,width:536,height:h,color:header?rgb(.85,.85,.85):rgb(.965,.965,.965)});
        let x=38;wrapped.forEach((lines,i)=>{lines.forEach((line,j)=>text(line,x+6,y-14-j*12,9,strong));x+=widths[i];});y-=h;
      }
      row(headers,true);rows.forEach(r=>row(r,false));y-=16;
    }
    newPage();
    const monthName=new Date(`${s.month}-01T12:00:00`).toLocaleDateString('en-US',{month:'long'});
    table(['Payment Summary','Amount'],[
      [`TOTAL ${monthName.toUpperCase()} EARNINGS`,dollars(s.earnings)],
      [`${monthName} 1 Payment`,dollars((s.sequence===1?s.payment:s.firstPayment)-(s.advanceCredit||0))],
      ...(s.advanceCredit ? [['Advance Applied', dollars(s.advanceCredit)]] : []),
      [s.sequence===1?`ESTIMATED ${monthName.toUpperCase()} 15 PAYMENT`:`${monthName} 15 Payment`,dollars(s.sequence===1?Math.max(0,s.earnings-s.payment):s.payment)]
    ],[400,136]);
    heading('Earnings Breakdown');
    const lineGroups=group(s.lines,row=>row.type);
    table(['Earnings','Amount'],[...Object.entries(lineGroups).map(([type,rs])=>[({'Own Student Pay':'Own Student Earnings','Student Pay':'Student Earnings'}[type]||type),dollars(sum(rs))]),
      ...['tier_a_founding_teacher','tier_b_teacher'].map(tier=>[tier==='tier_a_founding_teacher'?'Founding Teacher Commission':'Teacher Commission',dollars(s.commissions.filter(c=>c.tier===tier).reduce((n,c)=>n+c.amount,0))]).filter(r=>r[1]!=='-'),['TOTAL',dollars(s.earnings)]],[400,136]);
    const own=s.ownStudents || [];
    const founding=s.teacher.tier==='tier_a_founding_teacher';
    const schoolRows=()=>Object.entries(group(own,r=>r.school)).sort(([a],[b])=>a.localeCompare(b)).map(([school,rs])=>[school,...['none','staff','sibling','director'].map(c=>countLabel(rs.filter(r=>r.category===c&&(c==='director'||!r.held)).length)),dollars(sum(rs))]);
    if(founding){heading('School Earnings Breakdown');table(['School','Regular','Staff','Sibling','Director','Earnings'],schoolRows().concat([['TOTAL','','','','',dollars(sum(own))]]),[216,55,55,55,55,100]);}
    if (own.length && !founding) {
      heading('Own Student Earnings Breakdown');
      const category = r => r.fraction < 1 ? `Prorated - ${r.fraction*100}%` : r.category==='none' ? `Regular${r.vendor?' - Vendor Fee School':''}` : ({staff:'Staff',sibling:'Sibling',director:'Director'}[r.category] || r.category);
      const grouped=group(own,category);
      const categories=['Regular','Regular - Vendor Fee School','Sibling','Staff','Director','Prorated - 25%','Prorated - 50%','Prorated - 75%'];
      for(const label of categories)grouped[label] ||= [];
      const sorted=Object.entries(grouped).sort(([a],[b])=>(categories.indexOf(a)<0?99:categories.indexOf(a))-(categories.indexOf(b)<0?99:categories.indexOf(b)));
      table(['Tuition Type','Enrolled','Included','Rate','Earnings'],sorted.map(([label,rs])=>[label,countLabel(rs.length),countLabel(rs.filter(r=>!r.held&&r.amount>0).length),[...new Set(rs.map(r=>dollars(r.rate)))].join(' / ')||'-',dollars(sum(rs))]).concat([['TOTAL',String(own.length),String(own.filter(r=>!r.held&&r.amount>0).length),'',dollars(sum(own))]]),[216,60,60,90,110]);
    }
    if(founding){heading('Prorated Tuition');table(['Tuition Type','Included','Earnings'],[.25,.5,.75].map(f=>{const rs=own.filter(r=>r.fraction===f);return [`Prorated - ${f*100}%`,countLabel(rs.filter(r=>!r.held).length),dollars(sum(rs))]}),[366,70,100]);}
    table(['PAID TO DATE - RECORDED PAYMENTS','Amount'],[[`September 1, ${Number(s.month.slice(0,4))-(Number(s.month.slice(5))<9?1:0)} - ${dateLabel(s.payDate)}`,dollars(s.paidToDate)]],[400,136]);
    if ((!founding && own.length) || s.commissions.length) {
      newPage();
      if (own.length) {
        heading('Own Student Earnings');
        table(['School','Regular','Staff','Sibling','Director','Earnings'],schoolRows(),[216,55,55,55,55,100]);
      }
      for (const tier of ['tier_a_founding_teacher','tier_b_teacher']) {
        const cs=s.commissions.filter(c=>c.tier===tier);if(!cs.length)continue;
        heading(tier==='tier_a_founding_teacher'?'Founding Teacher Commission':'Teacher Commission');
        const rows=[];for(const [name,rs] of Object.entries(group(cs,c=>c.teacherName)).sort(([a],[b])=>a.localeCompare(b))) {
          for(const label of ['Regular','Staff/Sibling']) {const r=rs.find(c=>c.category===label);rows.push([label==='Regular'?name:'',label,r?countLabel(r.included):'-',r?dollars(r.rate):'-',r?dollars(r.amount):'-']);}
          rows.push(['','Teacher total','','',dollars(rs.reduce((n,c)=>n+c.amount,0))]);
        }
        rows.push(['SECTION TOTAL','','','',dollars(cs.reduce((n,c)=>n+c.amount,0))]);
        table(['Teacher','Tuition Type','Included','Rate','Earnings'],rows,[166,110,70,80,110]);
      }
    }
    const classes=s.lines.filter(r=>['Class Pay','Makeup Class'].includes(r.type));
    if(classes.length){newPage();heading('Dance Classes');table(['Date / Dance Class','Enrolled','Base','Commission','Earnings'],classes.map(r=>[`${r.date} / ${r.school} / ${r.className}`,String(r.enrolledCount),dollars(r.base),dollars(r.commission),dollars(r.amount)]),[276,60,65,65,70]);}
    const hours=s.lines.filter(r=>['Working Hours','Scheduled Event'].includes(r.type));
    if(hours.length){heading('Working Hours - Registrations, Demos, etc.');table(['Description','Hours','Earnings'],hours.map(r=>[r.description,String(r.hours||''),dollars(r.amount)]),[366,70,100]);}
    // Keep each own school together. Large rosters use three columns without shrinking other pages.
    for(const [school,rs] of Object.entries(group(own,r=>r.school))) {
      const regularRows=rs.filter(r=>r.category==='none'),other=rs.filter(r=>r.category!=='none');
      const columns=rs.length>30? [regularRows.slice(0,Math.ceil(regularRows.length/2)),regularRows.slice(Math.ceil(regularRows.length/2)),other]:[regularRows,other];
      const width=536/columns.length;const size=Math.max(7,Math.min(9,510/(Math.max(...columns.map(c=>c.length))*2.4)));
      const height=50+Math.max(...columns.map(c=>c.reduce((n,r)=>n+(wrap(r.name,width-14,size).length+(r.held||r.fraction<1?1:0))* (size+4)+5,0)));
      if(height>637)throw new Error(`The ${school} student list is too large for one page. Please review its layout.`);
      newPage();heading(school);
      columns.forEach((rs,i)=>{let yy=y;let last='';const x=38+i*width;
        for(const r of rs){const label=r.category==='none'?'Regular Tuition':`${r.category[0].toUpperCase()+r.category.slice(1)} Tuition`;if(label!==last){text(label,x,yy,9,true);yy-=20;last=label;}
          const color=r.held?rgb(.7,.1,.15):r.fraction<1?rgb(.68,.47,0):rgb(0,0,0);
          for(const line of wrap(r.name,width-14,size)){text(line,x,yy,size,false,color);yy-=size+4;}
          if(r.held||r.fraction<1){text(r.held?'Tuition Unpaid':`Prorated - ${r.fraction*100}%`,x,yy,size,false,color);yy-=size+4;}yy-=5;
        }
      });
    }
    return doc.save();
  }
  root.DTPayrollStatements = { snapshot, pdf, sum };
  if(typeof module!=='undefined')module.exports=root.DTPayrollStatements;
})(typeof globalThis !== 'undefined' ? globalThis : window);
