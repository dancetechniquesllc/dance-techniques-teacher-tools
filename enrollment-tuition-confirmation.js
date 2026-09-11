(function(root){
  const cents=n=>Math.round(Number(n)*100);
  function needsConfirmation(tuition){return Number.isFinite(tuition.monthlyTuition)&&tuition.monthlyTuition>0&&cents(tuition.amount)!==cents(tuition.monthlyTuition);}
  function percentage(full,recorded){if(!Number.isFinite(full)||full<=0||!Number.isFinite(recorded)||recorded<0||recorded>full)throw Error('Enter tuition between $0 and the full monthly amount.');return recorded/full*100;}
  function ask({name,month,full,suggested}){
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.style.cssText='width:min(92vw,480px);border:1px solid #d9aca6;border-radius:20px;padding:24px;color:#241c1c;background:#fffaf7';
      dialog.innerHTML='<form><h2>Confirm recorded tuition</h2><p data-name></p><p data-amounts></p><p>Is the suggested amount what you recorded for this student? Confirm it, or enter the actual tuition below.</p><label style="display:grid;gap:6px;margin:12px 0">Billing month<input name="month" type="month" required></label><label style="display:grid;gap:6px;margin:12px 0">Tuition actually recorded ($)<input name="amount" type="number" min="0" step="0.01" required></label><p data-percentage aria-live="polite"></p><p data-error role="alert" style="color:#a51d28"></p><div style="display:flex;gap:12px"><button type="button" data-cancel>Cancel</button><button type="submit">Confirm Tuition</button></div></form>';
      const form=dialog.querySelector('form'),amount=form.elements.amount;dialog.querySelector('[data-name]').textContent=name;
      dialog.querySelector('[data-amounts]').textContent=`Suggested tuition: $${Number(suggested).toFixed(2)} · Full tuition: $${Number(full).toFixed(2)}`;
      form.elements.month.value=month;amount.value=Number(suggested).toFixed(2);amount.max=full;
      const update=()=>{try{dialog.querySelector('[data-percentage]').textContent=`Payroll tuition percentage: ${Number(percentage(full,Number(amount.value)).toFixed(4))}%`;}catch{dialog.querySelector('[data-percentage]').textContent='';}};amount.oninput=update;update();
      let result=null;form.onsubmit=e=>{e.preventDefault();try{if(!form.reportValidity())return;const recorded=Number(amount.value);percentage(full,recorded);result={month:form.elements.month.value,full,recorded,suggested};dialog.close();}catch(error){dialog.querySelector('[data-error]').textContent=error.message;}};
      dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true});document.body.append(dialog);dialog.showModal();
    });
  }
  root.DTEnrollmentTuition={needsConfirmation,percentage,ask};if(typeof module!=='undefined')module.exports=root.DTEnrollmentTuition;
})(globalThis);
