import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = { "content-type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });
const env = (name: string) => Deno.env.get(name) || "";

const inQuietHours = (preferences: Record<string, unknown>, now = new Date()) => {
  if (!preferences?.quiet_hours_enabled) return false;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: String(preferences.timezone || "America/Chicago"), hour: "2-digit", minute: "2-digit", hour12: false });
  const [hour, minute] = formatter.format(now).split(":").map(Number);
  const current = hour * 60 + minute;
  const [startHour, startMinute] = String(preferences.quiet_hours_start || "20:00").slice(0, 5).split(":").map(Number);
  const [endHour, endMinute] = String(preferences.quiet_hours_end || "07:00").slice(0, 5).split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return start <= end ? current >= start && current < end : current >= start || current < end;
};

const categoryEnabled = (type: string, preferences: Record<string, unknown>) => {
  if (type === "studio_announcement") return true;
  if (["direct_message"].includes(type)) return preferences.messages_push !== false;
  if (["same_day_enrollment", "provisional_acknowledged", "new_enrollment", "enrollment_digest"].includes(type)) return preferences.roster_updates_push !== false;
  if (["schedule_change_request", "schedule_change_decision", "school_closure"].includes(type)) return preferences.schedule_changes_push !== false;
  if (["curriculum_published", "music_published"].includes(type)) return preferences.curriculum_music_push !== false;
  return true;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const expected = env("PUSH_DISPATCH_SECRET");
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || new URL(request.url).searchParams.get("secret") || "";
  if (!expected || provided !== expected) return json({ error: "Unauthorized" }, 401);

  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return json({ error: "Push keys are not configured" }, 503);
  webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:admin@dancetechniques.info", publicKey, privateKey);

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: notifications, error } = await supabase.from("teacher_notifications").select("*")
    .not("push_requested_at", "is", null).is("push_sent_at", null).is("dismissed_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at").limit(100);
  if (error) { console.error("Push queue lookup failed", { code: error.code, message: error.message }); return json({ error: "Queue unavailable", code: error.code }, 500); }

  let delivered = 0;
  let deferred = 0;
  for (const notification of notifications || []) {
    const [{ data: preferences }, { data: subscriptions }] = await Promise.all([
      supabase.from("notification_preferences").select("*").eq("user_id", notification.teacher_id).maybeSingle(),
      supabase.from("push_subscriptions").select("*").eq("user_id", notification.teacher_id).eq("active", true)
    ]);
    const prefs = preferences || {};
    if (!categoryEnabled(notification.notification_type, prefs)) {
      await supabase.from("teacher_notifications").update({ push_sent_at: new Date().toISOString(), metadata: { ...notification.metadata, push_skipped: "preference" } }).eq("id", notification.id);
      continue;
    }
    const urgentBypass = notification.priority === "urgent" && prefs.urgent_bypass_quiet_hours !== false;
    if (inQuietHours(prefs) && !urgentBypass) { deferred += 1; continue; }

    const payload = JSON.stringify({ title: notification.title, body: notification.message, url: notification.action_url || "/?open=notifications", notificationId: notification.id, tag: notification.notification_type, urgent: notification.priority === "urgent" });
    for (const subscription of subscriptions || []) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload);
        delivered += 1;
      } catch (pushError) {
        const statusCode = Number((pushError as { statusCode?: number }).statusCode || 0);
        if (statusCode === 404 || statusCode === 410) await supabase.from("push_subscriptions").update({ active: false }).eq("id", subscription.id);
        else console.error("Push delivery failed", { notificationId: notification.id, statusCode });
      }
    }
    await supabase.from("teacher_notifications").update({ push_sent_at: new Date().toISOString() }).eq("id", notification.id);
  }

  return json({ ok: true, queued: notifications?.length || 0, delivered, deferred });
});
