import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "content-type": "application/json"
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!supabaseUrl || !serviceRoleKey || !token) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: userResult, error: userError } = await admin.auth.getUser(token);
  const user = userResult.user;
  if (userError || !user) return json({ error: "Your secure session has expired." }, 401);

  const { data: account } = await admin
    .from("guardian_user_accounts")
    .select("guardian_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const requestedAt = new Date().toISOString();
  const { error: requestError } = await admin.from("parent_account_deletion_requests").insert({
    user_id: user.id,
    guardian_id: account?.guardian_id || null,
    status: "processing",
    requested_at: requestedAt,
    retention_note: "Access and authentication removed immediately. Financial and enrollment records are retained only when required for business, tax, dispute, or legal obligations."
  });
  if (requestError) return json({ error: "The deletion request could not be recorded." }, 500);

  await Promise.allSettled([
    admin.from("guardian_user_accounts").update({ revoked_at: requestedAt }).eq("user_id", user.id),
    admin.from("parent_push_subscriptions").update({ active: false, updated_at: requestedAt }).eq("user_id", user.id),
    admin.from("parent_native_push_tokens").update({ active: false, updated_at: requestedAt }).eq("user_id", user.id)
  ]);

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return json({ error: "Your access was revoked, but final account removal needs administrator review." }, 500);

  return json({ ok: true, requestedAt });
});
