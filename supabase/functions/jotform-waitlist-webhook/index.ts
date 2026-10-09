import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const responseHeaders = { "content-type": "application/json" };
const clean = (value: unknown) => String(value ?? "").trim();
const normalizedKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const normalizedSchool = (value: string) => normalizedKey(value)
  .replace(/^the/, "")
  .replace(/schoolof/g, "")
  .replace(/school/g, "");

const valueOf = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(valueOf).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    if ("answer" in record) return valueOf(record.answer);
    return Object.values(record).map(valueOf).filter(Boolean).join(" ");
  }
  return clean(value);
};

const flattenAnswers = (rawRequest: JsonRecord) => {
  const answers = new Map<string, string>();
  const visit = (key: string, value: unknown) => {
    const answer = valueOf(value);
    if (answer) answers.set(normalizedKey(key), answer);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as JsonRecord;
      const questionId = clean(record.qid) || clean(key).match(/^q?(\d+)/i)?.[1] || "";
      const questionName = clean(record.name);
      const aliases = [
        questionName,
        questionId && questionName ? `q${questionId}_${questionName}` : "",
        questionId ? `q${questionId}` : ""
      ].filter(Boolean);
      aliases.forEach((alias) => {
        if (answer) answers.set(normalizedKey(alias), answer);
      });
      if ("answer" in record) {
        visit(key, record.answer);
        aliases.forEach((alias) => visit(alias, record.answer));
      }
      Object.entries(record)
        .filter(([childKey]) => !["name", "text", "label", "question", "qid", "answer"].includes(childKey))
        .forEach(([childKey, childValue]) => visit(`${key}${childKey}`, childValue));
    }
  };
  Object.entries(rawRequest).forEach(([key, value]) => visit(key, value));
  return answers;
};

const answerFor = (answers: Map<string, string>, ...aliases: string[]) => {
  for (const alias of aliases) {
    const answer = answers.get(normalizedKey(alias));
    if (answer) return answer;
  }
  return "";
};

const waitlistBirthDate = (answers: Map<string, string>) => {
  const month = answerFor(answers, "q6_dancersBirthday_month", "q6dancersBirthdaymonth", "dancersBirthdaymonth");
  const day = answerFor(answers, "q6_dancersBirthday_day", "q6dancersBirthdayday", "dancersBirthdayday");
  const year = answerFor(answers, "q6_dancersBirthday_year", "q6dancersBirthdayyear", "dancersBirthdayyear");
  if (!month || !day || !year) return null;
  const value = `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? null : value;
};

const classroomClassHint = (classroom: string) => {
  const normalized = normalizedKey(classroom);
  if (normalized.includes("toddler")) return "under3";
  if (normalized.includes("preschool") || normalized.includes("prek") || normalized.includes("kindergarten")) return "3andover";
  return "";
};

const classHintScore = (danceClass: JsonRecord, hint: string) => {
  const text = normalizedKey(`${clean(danceClass.name)} ${clean(danceClass.age_group)}`);
  if (hint === "under3" && (text.includes("under3") || text.includes("toddler") || text.includes("2s"))) return 20;
  if (hint === "3andover" && (text.includes("3andover") || text.includes("ages35") || text.includes("preschool") || text.includes("prek") || text.includes("beginner"))) return 20;
  return 0;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false }), { status: 405, headers: responseHeaders });

  const url = new URL(request.url);
  const expectedSecret = Deno.env.get("JOTFORM_WAITLIST_WEBHOOK_SECRET") || "";
  const suppliedSecret = request.headers.get("x-jotform-webhook-secret") || url.searchParams.get("secret") || "";
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: responseHeaders });
  }

  let submissionId = "";
  let supabase: ReturnType<typeof createClient> | null = null;
  try {
    const contentType = request.headers.get("content-type") || "";
    let envelope: JsonRecord = {};
    if (contentType.includes("application/json")) envelope = await request.json();
    else envelope = Object.fromEntries((await request.formData()).entries());

    const rawValue = envelope.rawRequest;
    const rawRequest: JsonRecord = typeof rawValue === "string"
      ? JSON.parse(rawValue || "{}")
      : (rawValue && typeof rawValue === "object" ? rawValue as JsonRecord : envelope);
    submissionId = clean(envelope.submissionID || envelope.submissionId || rawRequest.submission_id || rawRequest.submissionID);
    const formId = clean(envelope.formID || envelope.formId || rawRequest.form_id || rawRequest.formID);
    const expectedFormId = Deno.env.get("JOTFORM_WAITLIST_FORM_ID") || "262808772109059";
    if (!submissionId) throw new Error("Missing Jotform submission ID");
    if (formId !== expectedFormId) return new Response(JSON.stringify({ ok: false }), { status: 403, headers: responseHeaders });

    const answers = flattenAnswers(rawRequest);
    const firstName = answerFor(answers, "q3_dancer_first", "q3dancerfirst", "dancerfirst");
    const lastName = answerFor(answers, "q3_dancer_last", "q3dancerlast", "dancerlast");
    const schoolName = answerFor(answers, "q4_school", "q4school", "school");
    const classroom = answerFor(answers, "q5_classroom", "q5classroom", "classroom");
    const parentFirstName = answerFor(answers, "q8_parentguardian_first", "q8parentguardianfirst", "parentguardianfirst");
    const parentLastName = answerFor(answers, "q8_parentguardian_last", "q8parentguardianlast", "parentguardianlast");
    const parentEmail = answerFor(answers, "q9_email", "q9email", "email").toLowerCase();
    const parentPhone = answerFor(answers, "q10_phoneNumber_full", "q10phonenumberfull", "phonenumberfull");
    const birthDate = waitlistBirthDate(answers);
    if (!firstName || !lastName || !schoolName || !classroom) throw new Error("Required waitlist fields are missing");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase function environment is incomplete");
    supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: existing, error: existingError } = await supabase.from("waitlist_submissions")
      .select("id,status,student_id,class_enrollment_id").eq("jotform_submission_id", submissionId).maybeSingle();
    if (existingError) throw new Error(`Waitlist duplicate check failed: ${existingError.code}`);
    if (existing?.status === "placed") {
      return new Response(JSON.stringify({ ok: true, duplicate: true, submissionId }), { status: 200, headers: responseHeaders });
    }

    const { data: schools, error: schoolError } = await supabase.from("partner_schools").select("id,name").eq("active", true);
    if (schoolError) throw new Error(`Partner schools could not be read: ${schoolError.code}`);
    const requestedSchoolKey = normalizedSchool(schoolName);
    const school = (schools || []).find((item) => normalizedSchool(item.name) === requestedSchoolKey)
      || (schools || []).find((item) => normalizedSchool(item.name).includes(requestedSchoolKey) || requestedSchoolKey.includes(normalizedSchool(item.name)));
    if (!school) throw new Error(`Waitlist school could not be matched: ${schoolName}`);

    const { data: assignments, error: assignmentError } = await supabase.from("teacher_school_assignments")
      .select("id").eq("partner_school_id", school.id).eq("active", true);
    if (assignmentError) throw new Error(`School assignment could not be read: ${assignmentError.code}`);
    const assignmentIds = (assignments || []).map((item) => item.id);
    if (!assignmentIds.length) throw new Error(`No active teacher assignment exists for ${school.name}`);

    const { data: danceClasses, error: classesError } = await supabase.from("dance_classes")
      .select("id,name,age_group,classroom").in("teacher_school_assignment_id", assignmentIds).eq("status", "active");
    if (classesError) throw new Error(`Dance classes could not be read: ${classesError.code}`);
    if (!danceClasses?.length) throw new Error(`No active dance class exists for ${school.name}`);

    const classIds = danceClasses.map((item) => item.id);
    const { data: rosterRecords, error: rosterError } = await supabase.from("class_enrollments")
      .select("dance_class_id,students(classroom,official_classroom)").in("dance_class_id", classIds).in("status", ["trial", "enrolled", "waitlisted"]);
    if (rosterError) throw new Error(`Classroom matches could not be read: ${rosterError.code}`);
    const classroomKey = normalizedKey(classroom);
    const hint = classroomClassHint(classroom);
    const scoredClasses = danceClasses.map((danceClass) => {
      const exactRosterMatches = (rosterRecords || []).filter((record) => {
        if (record.dance_class_id !== danceClass.id) return false;
        const student = Array.isArray(record.students) ? record.students[0] : record.students;
        return [student?.official_classroom, student?.classroom].some((value) => normalizedKey(clean(value)) === classroomKey);
      }).length;
      return { ...danceClass, score: exactRosterMatches * 100 + classHintScore(danceClass, hint) };
    }).sort((left, right) => right.score - left.score);
    const selectedClass = scoredClasses.length === 1 || scoredClasses[0].score > scoredClasses[1].score ? scoredClasses[0] : null;
    if (!selectedClass) throw new Error(`Classroom ${classroom} could not be matched to one dance class at ${school.name}`);

    const submittedAt = clean(envelope.created_at || rawRequest.created_at) || null;
    const rawSubmission = { envelope, rawRequest };
    const reservation = {
      jotform_submission_id: submissionId,
      jotform_form_id: formId,
      partner_school_id: school.id,
      dance_class_id: selectedClass.id,
      status: "received",
      error_message: null,
      raw_submission: rawSubmission,
      submitted_at: submittedAt
    };
    const { data: intake, error: reserveError } = existing
      ? await supabase.from("waitlist_submissions").update(reservation).eq("id", existing.id).select("id").single()
      : await supabase.from("waitlist_submissions").insert(reservation).select("id").single();
    if (reserveError) {
      if (reserveError.code === "23505") return new Response(JSON.stringify({ ok: true, duplicate: true, submissionId }), { status: 200, headers: responseHeaders });
      throw new Error(`Waitlist submission could not be reserved: ${reserveError.code}`);
    }

    const parentName = [parentFirstName, parentLastName].filter(Boolean).join(" ");
    const { data: student, error: studentError } = await supabase.from("students").insert({
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate,
      gender: "not_specified",
      classroom,
      official_classroom: classroom,
      parent_name: parentName || null,
      parent_first_name: parentFirstName || null,
      parent_last_name: parentLastName || null,
      parent_email: parentEmail || null,
      parent_phone: parentPhone || null,
      registration_notes: `Waitlist request for ${school.name}.`,
      additional_information: {
        waitlist: true,
        waitlist_submission_id: submissionId,
        waitlist_submitted_at: submittedAt,
        requested_school: schoolName,
        requested_classroom: classroom
      }
    }).select("id").single();
    if (studentError) throw new Error(`Future Dancer could not be created: ${studentError.code}`);

    const { data: enrollment, error: enrollmentError } = await supabase.from("class_enrollments").insert({
      dance_class_id: selectedClass.id,
      student_id: student.id,
      status: "waitlisted"
    }).select("id").single();
    if (enrollmentError) {
      await supabase.from("students").delete().eq("id", student.id);
      throw new Error(`Waitlist class link could not be created: ${enrollmentError.code}`);
    }

    const { error: completeError } = await supabase.from("waitlist_submissions").update({
      student_id: student.id,
      class_enrollment_id: enrollment.id,
      status: "placed",
      error_message: null
    }).eq("id", intake.id);
    if (completeError) throw new Error(`Waitlist audit record could not be completed: ${completeError.code}`);

    return new Response(JSON.stringify({ ok: true, duplicate: false, submissionId }), { status: 200, headers: responseHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown waitlist error";
    console.error("Jotform waitlist webhook failed", { submissionId, message });
    if (supabase && submissionId) {
      await supabase.from("waitlist_submissions").update({ status: "error", error_message: message }).eq("jotform_submission_id", submissionId);
    }
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: responseHeaders });
  }
});
