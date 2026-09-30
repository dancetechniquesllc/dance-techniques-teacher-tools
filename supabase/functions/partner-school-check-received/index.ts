import { createClient } from "npm:@supabase/supabase-js@2";

const envKey = (modernName: string, legacyName: string) => {
  const value = Deno.env.get(modernName);
  if (value) {
    try { return JSON.parse(value).default as string; } catch { return value; }
  }
  return Deno.env.get(legacyName) || "";
};
const tokenHash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const appUrl = "https://app.dancetechniques.info/check-received/";
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://app.dancetechniques.info",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store"
};
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const secretKey = Deno.env.get("DT_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !secretKey) return json({ valid: false }, 503);

  const requestUrl = new URL(request.url);
  let token = requestUrl.searchParams.get("token") || "";
  if (request.method === "POST") token = String((await request.formData()).get("token") || "");
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return json({ valid: false }, 404);

  // Supabase's gateway serves function-generated HTML as plain text. Keep this
  // endpoint JSON-only and send browser visits to the branded app page instead.
  if (request.method === "GET" && requestUrl.searchParams.get("format") !== "json") {
    return Response.redirect(`${appUrl}?token=${encodeURIComponent(token)}`, 302);
  }

  const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const hash = await tokenHash(token);
  const { data: payment } = await admin.from("school_partnership_payments")
    .select("id,partner_school_id,status,paid_amount,expected_amount,payment_method,confirmation_reference,check_received_at")
    .eq("check_confirmation_token_hash", hash).maybeSingle();
  if (!payment || payment.payment_method !== "check") return json({ valid: false }, 404);

  const { data: school } = await admin.from("partner_schools").select("name").eq("id", payment.partner_school_id).maybeSingle();
  const schoolName = school?.name || "Dance Techniques Partner";
  if (payment.check_received_at) return json({ valid: true, school: schoolName, confirmed: true });
  if (request.method !== "POST") return json({ valid: true, school: schoolName, confirmed: false });

  const now = new Date().toISOString();
  const ip = (request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || "").split(",")[0].trim();
  const ipHash = ip ? await tokenHash(ip) : null;
  const { data: updated, error } = await admin.from("school_partnership_payments")
    .update({ status: "verified", verified_at: now, paid_date: now.slice(0, 10), check_received_at: now, check_received_ip_hash: ipHash })
    .eq("id", payment.id).is("check_received_at", null).select("id").maybeSingle();
  if (error) return json({ valid: false }, 500);
  if (updated?.id) {
    await admin.from("school_partnership_payment_events").insert({
      payment_id: payment.id,
      event_type: "check_received",
      amount: Number(payment.paid_amount || payment.expected_amount || 0),
      payment_method: payment.payment_method,
      confirmation_reference: payment.confirmation_reference,
      details: { schoolName, confirmedAt: now }
    });
  }
  return json({ valid: true, school: schoolName, confirmed: true });
});
