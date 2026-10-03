import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord=Record<string,unknown>;
const responseHeaders={"content-type":"application/json"};
const clean=(value:unknown)=>String(value??"").trim();
const answer=(value:unknown):string=>{
  if(Array.isArray(value)) return value.map(answer).filter(Boolean).join(", ");
  if(value&&typeof value==="object"){
    const item=value as JsonRecord;
    if("answer" in item) return answer(item.answer);
    return [item.first,item.middle,item.last].map(clean).filter(Boolean).join(" ")||clean(JSON.stringify(item));
  }
  return clean(value);
};
const normalized=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"");
const flatten=(raw:JsonRecord)=>{
  const values=new Map<string,string>();
  Object.entries(raw).forEach(([key,value])=>{
    const item=value&&typeof value==="object"&&!Array.isArray(value)?value as JsonRecord:null;
    const found=answer(item&&"answer" in item?item.answer:value);
    [key,item?.qid,item?.name,item?.text,item?.label,item?.question].filter(Boolean).forEach(label=>values.set(normalized(clean(label)),found));
  });
  return values;
};
const parseDate=(value:string)=>{
  if(!value) return null;
  try { const item=JSON.parse(value); if(item.month&&item.day&&item.year) return `${item.year}-${String(item.month).padStart(2,"0")}-${String(item.day).padStart(2,"0")}`; } catch {}
  const date=new Date(value); return Number.isNaN(date.valueOf())?null:date.toISOString().slice(0,10);
};

Deno.serve(async request=>{
  if(request.method!=="POST") return new Response(JSON.stringify({ok:false}),{status:405,headers:responseHeaders});
  const url=new URL(request.url);
  const expectedSecret=Deno.env.get("JOTFORM_WEBHOOK_SECRET")||"";
  const supplied=request.headers.get("x-jotform-webhook-secret")||url.searchParams.get("secret")||"";
  if(!expectedSecret||supplied!==expectedSecret) return new Response(JSON.stringify({ok:false}),{status:401,headers:responseHeaders});
  try{
    const contentType=request.headers.get("content-type")||"";
    const envelope:JsonRecord=contentType.includes("application/json")?await request.json():Object.fromEntries((await request.formData()).entries());
    const rawValue=envelope.rawRequest;
    const raw:JsonRecord=typeof rawValue==="string"?JSON.parse(rawValue||"{}"):rawValue&&typeof rawValue==="object"?rawValue as JsonRecord:envelope;
    const submissionId=clean(envelope.submissionID||envelope.submissionId||raw.submission_id||raw.submissionID);
    const formId=clean(envelope.formID||envelope.formId||raw.form_id||raw.formID);
    const expectedFormId=Deno.env.get("JOTFORM_ENROLLMENT_CHANGE_FORM_ID")||"253005393017146";
    if(!submissionId) throw new Error("Missing Jotform submission ID");
    if(formId!==expectedFormId) return new Response(JSON.stringify({ok:false}),{status:403,headers:responseHeaders});
    const values=flatten(raw);
    const get=(...keys:string[])=>{for(const key of keys){const value=values.get(normalized(key));if(value)return value;}return "";};
    const nameField=raw.q3&&typeof raw.q3==="object"?raw.q3 as JsonRecord:null;
    const nameValue=nameField?.answer&&typeof nameField.answer==="object"?nameField.answer as JsonRecord:null;
    const fullName=get("3","q3","dancer");
    const nameParts=fullName.split(/\s+/).filter(Boolean);
    const row={
      jotform_submission_id:submissionId,jotform_form_id:formId,
      dancer_first_name:clean(nameValue?.first)||nameParts[0]||null,
      dancer_last_name:clean(nameValue?.last)||nameParts.slice(1).join(" ")||null,
      current_school:get("4","q4","current school")||null,
      last_day:parseDate(get("13","q13","last day")),
      request_type:get("5","q5","we are")||null,
      notes:get("15","q15","any misc information message to your teacher etc")||null,
      policy_acknowledged:Boolean(get("16","q16","i understand that after february 1st no refunds will be issued for costume or recital fees")),
      raw_submission:{envelope,rawRequest:raw},submitted_at:clean(envelope.created_at||raw.created_at)||null
    };
    const supabaseUrl=Deno.env.get("SUPABASE_URL");
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!supabaseUrl||!serviceKey) throw new Error("Supabase function environment is incomplete");
    const supabase=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
    const {error}=await supabase.from("enrollment_change_requests").upsert(row,{onConflict:"jotform_submission_id"});
    if(error) throw error;
    return new Response(JSON.stringify({ok:true,submissionId}),{status:200,headers:responseHeaders});
  }catch(error){
    console.error(error);
    return new Response(JSON.stringify({ok:false,error:error instanceof Error?error.message:"Unknown error"}),{status:500,headers:responseHeaders});
  }
});
