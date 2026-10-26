(function(root){
  const cents=n=>Math.round(Number(n)*100);
  function needsConfirmation(tuition){return Number.isFinite(tuition.monthlyTuition)&&tuition.monthlyTuition>0&&cents(tuition.amount)!==cents(tuition.monthlyTuition);}
  function percentage(full,recorded){if(!Number.isFinite(full)||full<=0||!Number.isFinite(recorded)||recorded<0||recorded>full)throw Error('Enter tuition between $0 and the full monthly amount.');return recorded/full*100;}
  function ask({name,month,full,suggested}){
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');
      dialog.className='dt-tuition-confirmation';
      dialog.setAttribute('aria-label','Confirm Tuition Charged');
      dialog.innerHTML=`<style>
.dt-tuition-confirmation{box-sizing:border-box;width:min(92vw,460px);max-height:90vh;max-height:90svh;overflow:auto;margin:auto;padding:24px;border:1px solid #dfb9b3;border-radius:22px;background:#fffaf7;color:#241c1c;font:inherit;font-size:16px;box-shadow:0 20px 65px #3a20242e}
.dt-tuition-confirmation::backdrop{background:#30232666}
.dt-tuition-confirmation form{display:grid;gap:18px;margin:0;min-width:0}
.dt-tuition-confirmation h2{margin:0;font:inherit;font-size:23px;line-height:1.2;font-weight:800;color:#713044;letter-spacing:-.4px}
.dt-tuition-confirmation .tuition-student{display:grid;gap:7px}
.dt-tuition-confirmation [data-name]{font-size:18px;line-height:1.3;font-weight:800;overflow-wrap:anywhere}
.dt-tuition-confirmation .tuition-month-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px;color:#746866}
.dt-tuition-confirmation [data-month-label]{font-weight:750;color:#4f4140}
.dt-tuition-confirmation [data-edit-month]{margin-left:auto;padding:3px 0;border:0;background:none;color:#8A4E54;font:inherit;font-size:12px;font-weight:750;text-decoration:underline;cursor:pointer}
.dt-tuition-confirmation .tuition-month-editor{display:grid;gap:6px;font-size:13px;font-weight:750}
.dt-tuition-confirmation .tuition-month-editor[hidden]{display:none}
.dt-tuition-confirmation input[name="month"]{box-sizing:border-box;min-width:0;width:100%;padding:10px 12px;border:1px solid #dfb9b3;border-radius:12px;background:#fffdfb;color:#241c1c;font:inherit}
.dt-tuition-confirmation .tuition-summary{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0;padding:14px;border:1px solid #ecd9d2;border-radius:14px;background:#f7ebe6}
.dt-tuition-confirmation .tuition-summary div{display:grid;gap:4px;min-width:0}.dt-tuition-confirmation dt{font-size:12px;color:#746866}.dt-tuition-confirmation dd{margin:0;font-size:19px;line-height:1.2;font-weight:800}.dt-tuition-confirmation .tuition-expected dd{color:#8A4E54}
.dt-tuition-confirmation .tuition-question{display:grid;gap:9px;font-size:12px;line-height:1.4;font-weight:750}
.dt-tuition-confirmation .tuition-amount{display:flex;align-items:center;gap:6px;border:1px solid #d7aaa3;border-radius:13px;background:#fffdfb;padding:0 14px;font-size:23px;color:#8A4E54}
.dt-tuition-confirmation input[name="amount"]{box-sizing:border-box;min-width:0;width:100%;min-height:53px;border:0;padding:9px 0;background:transparent;color:#241c1c;font:inherit;font-size:23px;font-weight:800;appearance:textfield;-moz-appearance:textfield;box-shadow:none}
.dt-tuition-confirmation input[name="amount"]::-webkit-inner-spin-button,.dt-tuition-confirmation input[name="amount"]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.dt-tuition-confirmation input[name="amount"]:focus{outline:none}.dt-tuition-confirmation .tuition-amount:focus-within{outline:2px solid #8A4E54;outline-offset:2px}
.dt-tuition-confirmation .tuition-charge-row{margin-top:9px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:end}.dt-tuition-confirmation .tuition-class-count{display:grid;gap:9px;font-size:12px;font-weight:750}.dt-tuition-confirmation select[name="classes"]{box-sizing:border-box;width:100%;min-width:0;min-height:55px;padding:9px 7px;border:1px solid #d7aaa3;border-radius:13px;background:#fffdfb;color:#241c1c;font:inherit;font-size:12px}.dt-tuition-confirmation .tuition-helper{margin:0;font-size:12px;line-height:1.5;font-weight:500;color:#746866}
.dt-tuition-confirmation [data-percentage]{margin:0;font-size:13px;font-weight:750;color:#746866}
.dt-tuition-confirmation [data-error]{margin:0;font-size:13px;color:#a51d28}.dt-tuition-confirmation [data-error]:empty{display:none}
.dt-tuition-confirmation .tuition-actions{display:flex;gap:10px}.dt-tuition-confirmation .tuition-actions button{min-height:46px;border:1px solid #d7aaa3;border-radius:13px;padding:10px 15px;font:inherit;font-size:14px;font-weight:800;cursor:pointer}
.dt-tuition-confirmation [data-cancel]{flex:1;background:#fffdfb;color:#8A4E54}.dt-tuition-confirmation .tuition-actions [type="submit"]{flex:2;background:#8A4E54;border-color:#8A4E54;color:white;box-shadow:0 4px 12px #8a4e5422}
.dt-tuition-confirmation button:focus-visible{outline:2px solid #8A4E54;outline-offset:3px}
@media(max-width:480px){.dt-tuition-confirmation{padding:20px 17px}.dt-tuition-confirmation h2{font-size:21px}.dt-tuition-confirmation form{gap:16px}}
</style><form><h2>Confirm Tuition Charged</h2><div class="tuition-student"><strong data-name></strong><div class="tuition-month-row"><span>Billing Month:</span><time data-month-label></time><button type="button" data-edit-month aria-expanded="false">Edit month</button></div><label class="tuition-month-editor" hidden>Billing month<input name="month" type="month" required></label></div><dl class="tuition-summary" data-amounts><div><dt>Standard Tuition</dt><dd data-full></dd></div><div class="tuition-expected"><dt>Expected Tuition</dt><dd data-suggested></dd></div></dl><div><label class="tuition-question" for="tuition-charged-amount">How much did you charge in Brightwheel?</label><div class="tuition-charge-row"><span class="tuition-amount"><span aria-hidden="true">$</span><input id="tuition-charged-amount" name="amount" type="number" inputmode="decimal" min="0" step="0.01" required aria-describedby="tuition-expected-help"></span><span class="tuition-class-count"><select name="classes" aria-label="Classes charged"><option value="" disabled>Custom amount</option><option value="25">1 Class (25%)</option><option value="50">2 Classes (50%)</option><option value="75">3 Classes (75%)</option><option value="100">Full Month (100%)</option></select></span></div><p class="tuition-helper" id="tuition-expected-help">We’ve filled in the expected amount. Only change it if you charged something different.</p></div><p data-percentage aria-live="polite"></p><p data-error role="alert"></p><div class="tuition-actions"><button type="button" data-cancel>Cancel</button><button type="submit" autofocus>Confirm Tuition ✓</button></div></form>`;
      const form=dialog.querySelector('form'),amount=form.elements.amount;dialog.querySelector('[data-name]').textContent=name;
      const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
      dialog.querySelector('[data-full]').textContent=usd.format(Number(full));
      dialog.querySelector('[data-suggested]').textContent=usd.format(Number(suggested));
      form.elements.month.value=month;amount.value=Number(suggested).toFixed(2);amount.max=full;
      const monthEditor=dialog.querySelector('.tuition-month-editor'),editMonth=dialog.querySelector('[data-edit-month]');
      const displayMonth=()=>{
        const value=form.elements.month.value,match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
        dialog.querySelector('[data-month-label]').textContent=match?new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(Number(match[1]),Number(match[2])-1,1))):'Choose month';
        dialog.querySelector('[data-month-label]').dateTime=value;
      };
      editMonth.onclick=()=>{monthEditor.hidden=!monthEditor.hidden;editMonth.setAttribute('aria-expanded',String(!monthEditor.hidden));if(!monthEditor.hidden)form.elements.month.focus();};
      form.elements.month.oninput=displayMonth;displayMonth();
      if(!form.elements.month.value){monthEditor.hidden=false;editMonth.setAttribute('aria-expanded','true');}
      const update=()=>{try{dialog.querySelector('[data-percentage]').textContent=`Teacher Payroll: ${Number(percentage(full,Number(amount.value)).toFixed(4))}%`;}catch{dialog.querySelector('[data-percentage]').textContent='';}};const classes=form.elements.classes;
      const syncClasses=()=>{classes.value=[25,50,75,100].find(p=>cents(Number(full)*p/100)===cents(Number(amount.value)))?.toString()||'';};
      amount.oninput=()=>{syncClasses();update();};
      classes.onchange=()=>{if(![25,50,75,100].includes(Number(classes.value)))return;amount.value=(Math.round(Number(full)*Number(classes.value))/100).toFixed(2);update();};
      syncClasses();update();
      let result=null;form.onsubmit=e=>{e.preventDefault();try{if(!form.reportValidity())return;const recorded=Number(amount.value);percentage(full,recorded);result={month:form.elements.month.value,full,recorded,suggested};dialog.close();}catch(error){dialog.querySelector('[data-error]').textContent=error.message;}};
      dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true});document.body.append(dialog);dialog.showModal();
    });
  }
  root.DTEnrollmentTuition={needsConfirmation,percentage,ask};if(typeof module!=='undefined')module.exports=root.DTEnrollmentTuition;
})(globalThis);
