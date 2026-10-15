import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;
const headers = { "content-type": "application/json" };
const clean = (value: unknown) => String(value ?? "").trim();
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const normalizedSchool = (value: string) => normalized(value).replace(/^the/, "").replace(/schoolof/g, "").replace(/school/g, "");

const answer = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(answer).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const item = value as JsonRecord;
    if ("answer" in item) return answer(item.answer);
    return [item.first, item.middle, item.last].map(clean).filter(Boolean).join(" ")
      || Object.values(item).map(answer).filter(Boolean).join(" ");
  }
  return clean(value);
};

const flatten = (raw: JsonRecord) => {
  const values = new Map<string, string>();
  const visit = (key: string, value: unknown) => {
    const item = value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
    const found = answer(item && "answer" in item ? item.answer : value);
    [key, item?.qid, item?.name, item?.text, item?.label, item?.question].filter(Boolean)
      .forEach((label) => { if (found) values.set(normalized(clean(label)), found); });
    if (item) Object.entries(item).filter(([child]) => !["qid", "name", "text", "label", "question"].includes(child))
      .forEach(([child, childValue]) => visit(`${key}${child}`, childValue));
  };
  Object.entries(raw).forEach(([key, value]) => visit(key, value));
  return values;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false }), { status: 405, headers });
  const url = new URL(request.url);
  const expectedSecret = Deno.env.get("JOTFORM_RECITAL_CONFLICT_WEBHOOK_SECRET") || "";
  const suppliedSecret = request.headers.get("x-jotform-webhook-secret") || url.searchParams.get("secret") || "";
  if (!expectedSecret || suppliedSecret !== expectedSecret) return new Response(JSON.stringify({ ok: false }), { status: 401, headers });

  let submissionId = "";
  let supabase: ReturnType<typeof createClient> | null = null;
  try {
    const contentType = request.headers.get("content-type") || "";
    const envelope: JsonRecord = contentType.includes("application/json") ? await request.json() : Object.fromEntries((await request.formData()).entries());
    const rawValue = envelope.rawRequest;
    const raw: JsonRecord = typeof rawValue === "string" ? JSON.parse(rawValue || "{}") : rawValue && typeof rawValue === "object" ? rawValue as JsonRecord : envelope;
    submissionId = clean(envelope.submissionID || envelope.submissionId || raw.submission_id || raw.submissionID);
    const formId = clean(envelope.formID || envelope.formId || raw.form_id || raw.formID);
    const expectedFormId = Deno.env.get("JOTFORM_RECITAL_CONFLICT_FORM_ID") || "262864434875066";
    if (!submissionId) throw new Error("Missing Jotform submission ID");
    if (formId !== expectedFormId) return new Response(JSON.stringify({ ok: false }), { status: 403, headers });

    const values = flatten(raw);
    const get = (...keys: string[]) => { for (const key of keys) { const value = values.get(normalized(key)); if (value) return value; } return ""; };
    const nameField = raw.q7 && typeof raw.q7 === "object" ? raw.q7 as JsonRecord : null;
    const nameAnswer = nameField?.answer && typeof nameField.answer === "object" ? nameField.answer as JsonRecord : null;
    const fullName = get("7", "q7", "dancer");
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = clean(nameAnswer?.first) || nameParts[0] || "";
    const lastName = clean(nameAnswer?.last) || nameParts.slice(1).join(" ");
    const schoolName = get("8", "q8", "school");
    const parentEmail = get("9", "q9", "email").toLowerCase();
    const conflictType = get("2", "q2", "which best describes your dancers recital conflict");
    const policyAnswer = get("5", "q5", "i understand that dance techniques will make every reasonable effort");
    const timingDetails = get("3", "q3", "please tell us about your timing conflict");
    const teacherNote = get("10", "q10", "note to your teacher");
    const conflictNote = [["Timing conflict", timingDetails], ["Note to teacher", teacherNote]].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join("\n");
    const availableBefore = get("11", "q11", "available before", "recital available before");
    const availableAfter = get("12", "q12", "available after", "recital available after");
    if (!firstName || !lastName || !schoolName || !conflictType) throw new Error("Required recital conflict fields are missing");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase function environment is incomplete");
    supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: schools, error: schoolError } = await supabase.from("partner_schools").select("id,name,nickname").eq("active", true);
    if (schoolError) throw schoolError;
    const schoolKey = normalizedSchool(schoolName);
    const school = (schools || []).find((item) => [item.name, item.nickname].some((name) => normalizedSchool(clean(name)) === schoolKey))
      || (schools || []).find((item) => [item.name, item.nickname].some((name) => normalizedSchool(clean(name)).includes(schoolKey) || schoolKey.includes(normalizedSchool(clean(name)))));

    let matchedStudent: JsonRecord | null = null;
    let matchError = school ? "" : `School could not be matched: ${schoolName}`;
    if (school) {
      const { data: assignments, error: assignmentError } = await supabase.from("teacher_school_assignments").select("id").eq("partner_school_id", school.id).eq("active", true);
      if (assignmentError) throw assignmentError;
      const assignmentIds = (assignments || []).map((item) => item.id);
      const { data: classes, error: classError } = assignmentIds.length ? await supabase.from("dance_classes").select("id").in("teacher_school_assignment_id", assignmentIds).eq("status", "active") : { data: [], error: null };
      if (classError) throw classError;
      const classIds = (classes || []).map((item) => item.id);
      const { data: links, error: linkError } = classIds.length ? await supabase.from("class_enrollments").select("student_id").in("dance_class_id", classIds).in("status", ["enrolled", "trial", "waitlisted"]) : { data: [], error: null };
      if (linkError) throw linkError;
      const studentIds = [...new Set((links || []).map((item) => item.student_id).filter(Boolean))];
      const { data: students, error: studentError } = studentIds.length ? await supabase.from("students").select("id,first_name,last_name,parent_email,additional_information").in("id", studentIds) : { data: [], error: null };
      if (studentError) throw studentError;
      let candidates = (students || []).filter((student) => normalized(clean(student.first_name)) === normalized(firstName) && normalized(clean(student.last_name)) === normalized(lastName));
      if (candidates.length > 1 && parentEmail) candidates = candidates.filter((student) => clean(student.parent_email).toLowerCase() === parentEmail);
      if (candidates.length === 1) matchedStudent = candidates[0] as JsonRecord;
      else matchError = candidates.length ? "More than one dancer matched; parent email did not resolve the match." : "No active dancer matched the submitted name and school.";
    }

    const submittedAt = clean(envelope.created_at || raw.created_at) || null;
    const auditRow = {
      jotform_submission_id: submissionId, jotform_form_id: formId, student_id: matchedStudent?.id || null, partner_school_id: school?.id || null,
      dancer_first_name: firstName, dancer_last_name: lastName, parent_email: parentEmail || null, school_name: schoolName,
      conflict_type: conflictType, conflict_note: conflictNote || null, available_before: availableBefore || null, available_after: availableAfter || null,
      policy_acknowledged: Boolean(policyAnswer), status: matchedStudent ? "matched" : "unmatched", error_message: matchError || null,
      raw_submission: { envelope, rawRequest: raw }, submitted_at: submittedAt
    };
    const { error: auditError } = await supabase.from("recital_conflict_submissions").upsert(auditRow, { onConflict: "jotform_submission_id" });
    if (auditError) throw auditError;

    if (matchedStudent) {
      const response = conflictType.toLowerCase();
      const noRecital = /will not|won't|cannot attend|not be able|choosing not|not participate|opt(?:ed)? out/.test(response);
      const prior = matchedStudent.additional_information && typeof matchedStudent.additional_information === "object" ? matchedStudent.additional_information as JsonRecord : {};
      const additionalInformation: JsonRecord = { ...prior,
        recital_conflict_type: conflictType, recital_conflict_note: conflictNote, recital_available_before: availableBefore,
        recital_available_after: availableAfter, recital_conflict_submission_id: submissionId, recital_conflict_submitted_at: submittedAt,
        recital_conflict_source: "jotform_recital_conflict"
      };
      if (noRecital) {
        additionalInformation.no_recital = true;
        additionalInformation.no_recital_note = conflictNote || conflictType;
        additionalInformation.no_recital_source = "recital_conflict_form";
      } else if (additionalInformation.no_recital_source === "recital_conflict_form") {
        additionalInformation.no_recital = false;
        additionalInformation.no_recital_note = "";
      }
      const { error: updateError } = await supabase.from("students").update({ additional_information: additionalInformation }).eq("id", matchedStudent.id);
      if (updateError) throw updateError;
    }

    return new Response(JSON.stringify({ ok: true, submissionId, matched: Boolean(matchedStudent) }), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : error && typeof error === "object" ? JSON.stringify(error) : "Unknown recital conflict webhook error";
    console.error("Jotform recital conflict webhook failed", { submissionId, message });
    if (supabase && submissionId) await supabase.from("recital_conflict_submissions").update({ status: "error", error_message: message }).eq("jotform_submission_id", submissionId);
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers });
  }
});
