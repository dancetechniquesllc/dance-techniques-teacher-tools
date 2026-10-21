import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parsePaymentDetails, shouldReplacePaymentStatus } from "./payment.ts";

type JsonRecord = Record<string, unknown>;

const corsHeaders = { "content-type": "application/json" };
const clean = (value: unknown) => String(value ?? "").trim();
const valueOf = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(valueOf).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    if ("answer" in record) return valueOf(record.answer);
    return [record.first, record.middle, record.last].map(clean).filter(Boolean).join(" ") || clean(JSON.stringify(record));
  }
  return clean(value);
};

const normalizedKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const defaultAliases: Record<string, string[]> = {
  student_first_name: ["studentfirstname", "dancerfirstname", "childfirstname", "firstname"],
  student_last_name: ["studentlastname", "dancerlastname", "childlastname", "lastname"],
  student_preferred_name: ["preferredname", "studentpreferredname", "nickname"],
  student_birth_date: ["studentbirthdate", "dancerbirthdate", "childbirthdate", "dateofbirth", "birthdate"],
  student_gender: ["studentgender", "dancergender", "childgender", "gender"],
  student_classroom: ["classroom", "schoolclassroom", "studentsclassroom"],
  tshirt_size: ["tshirtsize", "shirtsize", "dancertshirtsize", "dancersshirtsize"],
  enrollment_history: ["enrollmenthistory", "weare"],
  related_dancer_first_name: ["relateddancerfirstname", "siblingfirstname"],
  related_dancer_last_name: ["relateddancerlastname", "siblinglastname"],
  parent_first_name: ["parentfirstname", "guardianfirstname"],
  parent_last_name: ["parentlastname", "guardianlastname"],
  parent_name: ["parentname", "guardianname", "parentguardianname"],
  parent_relationship: ["relationship", "relationshiptostudent", "guardianrelationship"],
  parent_email: ["parentemail", "guardianemail", "email"],
  parent_phone: ["parentphone", "guardianphone", "phonenumber", "phone"],
  requested_school_name: ["requestedschool", "partnerschool", "school", "preschool"],
  requested_class_name: ["requestedclass", "classname", "danceclass", "class"],
  requested_dance_style: ["dancestyle", "classstyle", "genre"],
  requested_day: ["requestedday", "classday", "day"],
  requested_time: ["requestedtime", "classtime", "time"],
  discount_code: ["discountcode", "promocode", "couponcode"],
  discount_details: ["discount", "discountdetails", "siblingdiscount"],
  medical_notes: ["medicalnotes", "medicalinformation", "allergies", "specialneeds"],
  consent_brightwheel: ["brightwheelconsent", "downloadingthebrightwheelapp"],
  consent_parent_agreement: ["parentagreementconsent", "iagreetotheabovetermsoftheparentagreement"],
  payment_summary: ["paymentsummary", "enrollmentfee", "myproducts"],
  registration_notes: ["registrationnotes", "notes", "additionalinformation", "comments"]
};

const configuredAliases = (): Record<string, string[]> => {
  const raw = Deno.env.get("JOTFORM_FIELD_MAP");
  if (!raw) throw new Error("JOTFORM_FIELD_MAP is required");
  try {
    const parsed = JSON.parse(raw) as Record<string, string | string[]>;
    return Object.fromEntries(Object.entries(defaultAliases).map(([field]) => [
      field,
      Array.isArray(parsed[field]) ? parsed[field] : parsed[field] ? [parsed[field]] : []
    ]));
  } catch {
    throw new Error("JOTFORM_FIELD_MAP is not valid JSON");
  }
};

const flattenAnswers = (rawRequest: JsonRecord) => {
  const flattened = new Map<string, string>();
  const visit = (key: string, value: unknown) => {
    const answer = valueOf(value);
    if (answer) flattened.set(normalizedKey(key), answer);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as JsonRecord;
      ["name", "text", "label", "question", "qid"].forEach((labelKey) => {
        if (record[labelKey]) flattened.set(normalizedKey(clean(record[labelKey])), answer);
      });
      Object.entries(record)
        .filter(([childKey]) => !["name", "text", "label", "question", "qid", "answer"].includes(childKey))
        .forEach(([childKey, childValue]) => visit(`${key}${childKey}`, childValue));
    }
  };
  Object.entries(rawRequest).forEach(([key, value]) => visit(key, value));
  return flattened;
};

const questionId = (value: unknown) => clean(value).match(/(?:^|[^a-z])q(?:uestion)?[_-]?(\d+)/i)?.[1]
  || clean(value).match(/^\d+$/)?.[0]
  || "";

const extractAdditionalInformation = (rawRequest: JsonRecord, aliases: Record<string, string[]>) => {
  const mappedKeys = new Set(Object.values(aliases).flat().map((alias) => normalizedKey(alias)).filter(Boolean));
  const mappedQuestionIds = new Set(Object.values(aliases).flat().map(questionId).filter(Boolean));
  const ignoredKeys = new Set([
    "submissionid", "submission_id", "formid", "form_id", "createdat", "created_at",
    "updatedat", "updated_at", "ip", "status", "eventid", "event_id"
  ].map(normalizedKey));
  const additional: Record<string, string> = {};

  Object.entries(rawRequest).forEach(([key, value]) => {
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
    const answerSource = record && "answer" in record ? record.answer : value;
    const answer = valueOf(answerSource);
    if (!answer) return;
    const label = clean(record?.text || record?.label || record?.question || record?.name || key)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const normalizedEntryKey = normalizedKey(key);
    const normalizedLabel = normalizedKey(label);
    const qid = questionId(record?.qid || key);
    if (!label || label.length > 180 || ignoredKeys.has(normalizedEntryKey)) return;
    if (mappedKeys.has(normalizedEntryKey) || mappedKeys.has(normalizedLabel)) return;
    if (qid && mappedQuestionIds.has(qid)) return;
    additional[label] = answer;
  });

  return additional;
};

const parseDate = (value: string) => {
  if (!value) return null;
  try {
    const parts = JSON.parse(value) as JsonRecord;
    const month = clean(parts.month);
    const day = clean(parts.day);
    const year = clean(parts.year);
    if (month && day && year) {
      const composed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00Z`);
      return Number.isNaN(composed.valueOf()) ? null : composed.toISOString().slice(0, 10);
    }
  } catch {
    // Simple date values continue through the normal parser below.
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
};

const parseTimestamp = (value: unknown) => {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
};

const tuitionDiscountFromJotform = (details: string) => {
  const normalized = details.toLowerCase();
  if (normalized.includes("additional dancer") || normalized.includes("sibling")) return "sibling";
  if (normalized.includes("employee at my dancer") || normalized.includes("daycare employee") || normalized.includes("staff")) return "staff";
  return "none";
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false }), { status: 405, headers: corsHeaders });

  const expectedSecret = Deno.env.get("JOTFORM_WEBHOOK_SECRET") || "";
  const url = new URL(request.url);
  const suppliedSecret = request.headers.get("x-jotform-webhook-secret") || url.searchParams.get("secret") || "";
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: corsHeaders });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let envelope: JsonRecord = {};
    if (contentType.includes("application/json")) {
      envelope = await request.json();
    } else {
      const form = await request.formData();
      envelope = Object.fromEntries(form.entries());
    }

    const rawValue = envelope.rawRequest;
    const rawRequest: JsonRecord = typeof rawValue === "string"
      ? JSON.parse(rawValue || "{}")
      : (rawValue && typeof rawValue === "object" ? rawValue as JsonRecord : envelope);
    const submissionId = clean(envelope.submissionID || envelope.submissionId || rawRequest.submission_id || rawRequest.submissionID);
    if (!submissionId) throw new Error("Missing Jotform submission ID");
    const formId = clean(envelope.formID || envelope.formId || rawRequest.form_id || rawRequest.formID);
    const expectedFormId = clean(Deno.env.get("JOTFORM_FORM_ID"));
    if (!expectedFormId) throw new Error("JOTFORM_FORM_ID is required");
    if (formId !== expectedFormId) return new Response(JSON.stringify({ ok: false }), { status: 403, headers: corsHeaders });

    const answers = flattenAnswers(rawRequest);
    const aliases = configuredAliases();
    const additionalInformation = extractAdditionalInformation(rawRequest, aliases);
    const mapped = (field: string) => {
      for (const alias of aliases[field] || []) {
        const answer = answers.get(normalizedKey(alias));
        if (answer) return answer;
      }
      return "";
    };
    const parentName = mapped("parent_name") || [mapped("parent_first_name"), mapped("parent_last_name")].filter(Boolean).join(" ");
    const discountDetails = mapped("discount_details");
    const paymentSummary = mapped("payment_summary");
    const payment = parsePaymentDetails(paymentSummary, rawRequest, envelope);

    const row = {
      source: "jotform",
      source_record_id: submissionId,
      jotform_form_id: formId,
      jotform_submission_id: submissionId,
      status: url.searchParams.get("stage") === "1" ? "archived" : "new",
      raw_submission: { envelope, rawRequest },
      additional_information: additionalInformation,
      submitted_at: parseTimestamp(envelope.created_at || rawRequest.created_at),
      student_first_name: mapped("student_first_name") || null,
      student_last_name: mapped("student_last_name") || null,
      student_preferred_name: mapped("student_preferred_name") || null,
      student_birth_date: parseDate(mapped("student_birth_date")),
      student_gender: mapped("student_gender") || null,
      student_classroom: mapped("student_classroom") || null,
      tshirt_size: mapped("tshirt_size") || null,
      enrollment_history: mapped("enrollment_history") || null,
      related_dancer_name: [mapped("related_dancer_first_name"), mapped("related_dancer_last_name")].filter(Boolean).join(" ") || null,
      parent_first_name: mapped("parent_first_name") || null,
      parent_last_name: mapped("parent_last_name") || null,
      parent_name: parentName || null,
      parent_relationship: mapped("parent_relationship") || null,
      parent_email: mapped("parent_email").toLowerCase() || null,
      parent_phone: mapped("parent_phone") || null,
      requested_school_name: mapped("requested_school_name") || null,
      requested_class_name: mapped("requested_class_name") || null,
      requested_dance_style: mapped("requested_dance_style") || null,
      requested_day: mapped("requested_day") || null,
      requested_time: mapped("requested_time") || null,
      discount_code: mapped("discount_code") || null,
      discount_details: discountDetails || null,
      tuition_discount: tuitionDiscountFromJotform(discountDetails),
      medical_notes: mapped("medical_notes") || null,
      consent_responses: {
        brightwheel_app: mapped("consent_brightwheel") || null,
        parent_agreement: mapped("consent_parent_agreement") ? "signed" : null
      },
      payment_status: payment.status,
      payment_transaction_id: payment.transactionId || null,
      registration_notes: mapped("registration_notes") || null
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase function environment is incomplete");
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: existing, error: existingError } = await supabase.from("enrollments")
      .select("*").eq("jotform_submission_id", submissionId).maybeSingle();
    if (existingError) throw new Error(`Enrollment intake duplicate check failed: ${existingError.code}`);
    if (existing) {
      const replaceStatus = shouldReplacePaymentStatus(existing.payment_status, payment.status);
      const { status: _incomingStage, ...incomingRefresh } = row;
      const jotformRefresh = Object.fromEntries(Object.entries(incomingRefresh).filter(([key, value]) => {
        if (key === "additional_information" || key === "tuition_discount") return false;
        return value !== null && value !== "";
      }));
      jotformRefresh.additional_information = {
        ...(existing.additional_information && typeof existing.additional_information === "object" ? existing.additional_information : {}),
        ...additionalInformation
      };
      jotformRefresh.tuition_discount = tuitionDiscountFromJotform(discountDetails) === "none"
        ? (existing.tuition_discount || "none")
        : tuitionDiscountFromJotform(discountDetails);
      const protectedPlacedRefresh = {
        source: row.source,
        source_record_id: row.source_record_id,
        jotform_form_id: row.jotform_form_id,
        jotform_submission_id: row.jotform_submission_id,
        raw_submission: row.raw_submission,
        submitted_at: row.submitted_at
      };
      const duplicateUpdate = {
        ...(existing.status === "placed" ? protectedPlacedRefresh : jotformRefresh),
        payment_status: replaceStatus ? payment.status : existing.payment_status,
        payment_transaction_id: payment.transactionId || existing.payment_transaction_id
      };
      const { error: updateError } = await supabase.from("enrollments").update(duplicateUpdate).eq("id", existing.id);
      if (updateError) throw new Error(`Enrollment intake refresh failed: ${updateError.code}`);
      return new Response(JSON.stringify({ ok: true, submissionId, duplicate: true, refreshed: true, paymentUpdated: replaceStatus || Boolean(payment.transactionId) }), { status: 200, headers: corsHeaders });
    }
    const { error } = await supabase.from("enrollments").insert(row);
    if (error?.code === "23505") {
      return new Response(JSON.stringify({ ok: true, submissionId, duplicate: true }), { status: 200, headers: corsHeaders });
    }
    if (error) throw new Error(`Enrollment intake insert failed: ${error.code}`);

    return new Response(JSON.stringify({ ok: true, submissionId, duplicate: false }), { status: 200, headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Jotform enrollment webhook failed", { message });
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceRoleKey) {
        const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
        const { data: leaders } = await supabase.from("profiles").select("id").eq("active", true).in("role", ["admin", "director"]);
        if (leaders?.length) await supabase.from("teacher_notifications").insert(leaders.map((leader) => ({
          teacher_id: leader.id,
          title: "Enrollment intake needs attention",
          message: "A Jotform submission could not be added to New Enrollments. Open the webhook logs for details.",
          notification_type: "jotform_intake_failed",
          priority: "urgent",
          action_url: "/?open=enrollments",
          metadata: { error_code: message.split(":")[0] },
          push_requested_at: new Date().toISOString()
        })));
      }
    } catch (notificationError) {
      console.error("Enrollment failure notification could not be queued", { message: notificationError instanceof Error ? notificationError.message : "Unknown error" });
    }
    return new Response(JSON.stringify({ ok: false, ...(new URL(request.url).searchParams.get("stage") === "1" ? { stageError: message } : {}) }), { status: 500, headers: corsHeaders });
  }
});
