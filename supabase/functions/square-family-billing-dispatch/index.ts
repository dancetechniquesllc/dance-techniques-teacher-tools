import { createClient } from "npm:@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;
const json = (body: JsonRecord, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const envKey = (modern: string, legacy: string) => {
  const value = Deno.env.get(modern); if (value) { try { return JSON.parse(value).default as string; } catch { return value; } }
  return Deno.env.get(legacy) || "";
};
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
const formattedDancerNames = (lines: { students?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] }[]) => {
  const names = lines.map((line) => Array.isArray(line.students) ? line.students[0] : line.students).filter(Boolean)
    .map((student) => ({ first: String(student?.first_name || "").trim(), last: String(student?.last_name || "").trim() }))
    .filter((student, index, all) => student.first && all.findIndex((item) => item.first === student.first && item.last === student.last) === index);
  const lastNames = new Set(names.map((name) => name.last.toLowerCase()).filter(Boolean));
  if (names.length > 1 && lastNames.size === 1) {
    const firstNames = names.map((name) => name.first);
    const joined = firstNames.length === 2 ? firstNames.join(" & ") : `${firstNames.slice(0, -1).join(", ")} & ${firstNames.at(-1)}`;
    return `${escapeHtml(joined)} ${escapeHtml(names[0].last)}`;
  }
  return names.map((name) => escapeHtml(`${name.first} ${name.last}`.trim())).join("<br>");
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, message: "Method not allowed." }, 405);
  try {
    const sandbox = (Deno.env.get("SQUARE_ENVIRONMENT") || "").toLowerCase() === "sandbox";
    const enabled = (Deno.env.get("SQUARE_SANDBOX_AUTOPAY_ENABLED") || "").toLowerCase() === "true";
    const dispatchSecret = Deno.env.get("SQUARE_BILLING_DISPATCH_SECRET") || "";
    if (!sandbox || !enabled || !dispatchSecret || request.headers.get("x-dispatch-secret") !== dispatchSecret) {
      return json({ ok: false, code: "sandbox_autopay_disabled", message: "Sandbox automatic billing is disabled. No payments were attempted." }, 503);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const secretKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const accessToken = Deno.env.get("SQUARE_ACCESS_TOKEN") || "";
    const locationId = Deno.env.get("SQUARE_LOCATION_ID") || "";
    const brevoApiKey = Deno.env.get("BREVO_API_KEY") || "";
    if (!supabaseUrl || !secretKey || !accessToken || !locationId) return json({ ok: false, message: "Sandbox billing is not configured." }, 503);
    const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    await admin.rpc("issue_upcoming_monthly_family_invoices", { processing_date: today });
    const { data: pendingInvoices } = await admin.from("family_billing_cycles")
      .select("id,cycle_month,due_on,total_cents,family_billing_cycle_lines(description,amount_cents,standard_amount_cents,discount_label,students(first_name,last_name)),family_billing_accounts!inner(guardians!inner(full_name,email))")
      .eq("invoice_email_status", "pending").limit(50);
    for (const invoice of pendingInvoices || []) {
      const account = invoice.family_billing_accounts as unknown as { guardians?: { full_name?: string; email?: string } | { full_name?: string; email?: string }[] };
      const guardian = Array.isArray(account?.guardians) ? account.guardians[0] : account?.guardians;
      const email = String(guardian?.email || "").trim();
      if (!brevoApiKey || !email) { await admin.from("family_billing_cycles").update({ invoice_email_status: "failed" }).eq("id", invoice.id); continue; }
      const invoiceLines = (invoice.family_billing_cycle_lines || []) as { description?: string; amount_cents?: number; standard_amount_cents?: number; discount_label?: string; students?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] }[];
      const lines = invoiceLines.map(line => { const cents = Number(line.amount_cents || 0); const amount = cents === 0 && line.discount_label === "Director Discount" ? "FREE" : `$${(cents / 100).toFixed(2)}`; const standard = Number(line.standard_amount_cents || 0); return `<li>${escapeHtml(line.description || "Tuition")} — ${standard > cents ? `<s>$${(standard / 100).toFixed(2)}</s> <strong>${amount}</strong>` : amount}</li>`; }).join("");
      const dancerNames = formattedDancerNames(invoiceLines);
      const monthLabel = new Date(`${invoice.cycle_month}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const dueLabel = new Date(`${invoice.due_on}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const invoiceSendId = `invoice-${invoice.id}`;
      const sent = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": brevoApiKey, "Content-Type": "application/json" }, body: JSON.stringify({ sender: { name: "Dance Techniques", email: "dancetechniquesllc@gmail.com" }, to: [{ email, name: guardian?.full_name || "Dance Techniques Family" }], headers: { "Idempotency-Key": invoiceSendId, "X-Mailin-custom": `send-id:${invoiceSendId}` }, subject: `${monthLabel} Dance Techniques tuition invoice`, htmlContent: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><img src="https://app.dancetechniques.info/assets/invoices/dance-techniques-logo-only.png" alt="Dance Techniques" style="display:block;width:150px;max-height:90px;object-fit:contain;margin:0 auto 18px"><h2>${monthLabel} Tuition</h2><p>Hi ${escapeHtml(guardian?.full_name || "Dance Techniques Family")},</p><p><strong>Dancer${invoiceLines.length === 1 ? "" : "s"}:</strong> ${dancerNames}</p><p>Your tuition invoice is now available in Parent Portal and is due ${dueLabel}.</p><ul>${lines}</ul><p><strong>Total due: $${(Number(invoice.total_cents || 0) / 100).toFixed(2)}</strong></p><p>Your approved automatic payment remains scheduled for the due date.</p></div>` }) });
      const sentBody = sent.ok ? await sent.json().catch(() => ({})) as { messageId?: string } : {};
      await admin.from("family_billing_cycles").update({ invoice_email_status: sent.ok ? "sent" : "failed", invoice_emailed_at: sent.ok ? new Date().toISOString() : null, invoice_send_id: invoiceSendId, invoice_provider_message_id: sentBody.messageId || null }).eq("id", invoice.id);
    }
    await admin.rpc("prepare_monthly_family_billing_cycles", { processing_date: today });
    await admin.rpc("queue_family_billing_retries", { processing_date: today });
    const { data: attempts, error } = await admin.from("family_billing_attempts")
      .select("id, cycle_id, attempt_stage, amount_cents, idempotency_key, family_billing_cycles!inner(id, status, billing_account_id, family_billing_accounts!inner(id, square_environment, square_customer_id, square_card_id, card_consent_at, automatic_billing_enabled))")
      .eq("status", "queued").lte("scheduled_for", today).limit(50);
    if (error) throw error;
    let submitted = 0; let skipped = 0; let failed = 0;
    for (const attempt of attempts || []) {
      const cycle = attempt.family_billing_cycles as unknown as JsonRecord;
      const account = cycle?.family_billing_accounts as JsonRecord | undefined;
      if (cycle?.status !== "approved" || account?.square_environment !== "sandbox" || account?.automatic_billing_enabled !== true || !account?.square_card_id || !account?.card_consent_at) { skipped++; continue; }
      await admin.from("family_billing_attempts").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", attempt.id).eq("status", "queued");
      const squareResponse = await fetch("https://connect.squareupsandbox.com/v2/payments", {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "Square-Version": "2026-07-15" },
        body: JSON.stringify({ source_id: account.square_card_id, customer_id: account.square_customer_id, idempotency_key: attempt.idempotency_key,
          amount_money: { amount: attempt.amount_cents, currency: "USD" }, location_id: locationId, reference_id: attempt.cycle_id,
          note: "Dance Techniques family tuition", autocomplete: true })
      });
      const result = await squareResponse.json().catch(() => ({} as JsonRecord));
      const payment = result.payment as JsonRecord | undefined;
      if (!squareResponse.ok || !payment?.id) {
        const errors = result.errors as JsonRecord[] | undefined;
        await admin.from("family_billing_attempts").update({ status: "declined", failure_code: String(errors?.[0]?.code || "square_declined"), failure_message: "Square Sandbox declined or rejected this attempt." }).eq("id", attempt.id);
        if ((attempt as JsonRecord).attempt_stage === "tenth") await admin.from("family_billing_cycles").update({ status: "failed_follow_up" }).eq("id", attempt.cycle_id);
        failed++; continue;
      }
      await admin.from("family_billing_attempts").update({ square_payment_id: String(payment.id), status: String(payment.status || "PENDING").toLowerCase() === "completed" ? "completed" : "pending", completed_at: String(payment.status || "").toUpperCase() === "COMPLETED" ? new Date().toISOString() : null }).eq("id", attempt.id);
      if (String(payment.status || "").toUpperCase() === "COMPLETED") await admin.from("family_billing_cycles").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", attempt.cycle_id);
      submitted++;
    }
    let dailySummary = "not_needed";
    if (brevoApiKey) {
      const since = new Date(Date.now() - (36 * 60 * 60 * 1000)).toISOString();
      const centralDate = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
      const { data: recentCompleted } = await admin.from("family_billing_attempts")
        .select("id,cycle_id,attempt_stage,amount_cents,completed_at,square_payment_id")
        .eq("status", "completed").gte("completed_at", since).order("completed_at", { ascending: true });
      const completedToday = (recentCompleted || []).filter((payment) => payment.completed_at && centralDate(payment.completed_at) === today);
      if (completedToday.length) {
        const totalCents = completedToday.reduce((sum, payment) => sum + Number(payment.amount_cents || 0), 0);
        const { data: existingSummary } = await admin.from("daily_payment_summary_deliveries").select("status").eq("summary_date", today).maybeSingle();
        if (existingSummary?.status !== "sent") {
          await admin.from("daily_payment_summary_deliveries").upsert({ summary_date: today, payment_count: completedToday.length, total_cents: totalCents, recipient_email: "dancetechniquesllc@gmail.com", status: "pending", safe_error: null }, { onConflict: "summary_date" });
          const rows: string[] = [];
          for (const payment of completedToday) {
            const { data: cycle } = await admin.from("family_billing_cycles")
              .select("cycle_month,family_billing_accounts!inner(guardians!inner(full_name)),family_billing_cycle_lines(description,students(first_name,last_name))")
              .eq("id", payment.cycle_id).maybeSingle();
            const account = cycle?.family_billing_accounts as unknown as { guardians?: { full_name?: string } | { full_name?: string }[] } | undefined;
            const guardian = Array.isArray(account?.guardians) ? account?.guardians[0] : account?.guardians;
            const cycleLines = (cycle?.family_billing_cycle_lines || []) as { description?: string; students?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] }[];
            const dancerNames = formattedDancerNames(cycleLines) || "Family account";
            const paidAt = new Date(payment.completed_at as string).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
            rows.push(`<tr><td style="padding:10px;border-bottom:1px solid #ead4cf">${escapeHtml(guardian?.full_name || "Family")}</td><td style="padding:10px;border-bottom:1px solid #ead4cf">${dancerNames}</td><td style="padding:10px;border-bottom:1px solid #ead4cf">${escapeHtml(String(payment.attempt_stage || "payment"))}</td><td style="padding:10px;border-bottom:1px solid #ead4cf;text-align:right">$${(Number(payment.amount_cents || 0) / 100).toFixed(2)}</td><td style="padding:10px;border-bottom:1px solid #ead4cf">${escapeHtml(paidAt)}</td></tr>`);
          }
          const summaryDateLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
          const summaryResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: { name: "Dance Techniques Billing", email: "dancetechniquesllc@gmail.com" },
              to: [{ email: "dancetechniquesllc@gmail.com", name: "Dance Techniques" }],
              headers: { "Idempotency-Key": `daily-payment-summary-${today}` },
              subject: `${summaryDateLabel} successful payments — $${(totalCents / 100).toFixed(2)}`,
              htmlContent: `<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto"><h2>Successful Payments · ${escapeHtml(summaryDateLabel)}</h2><p>${completedToday.length} successful payment${completedToday.length === 1 ? "" : "s"} totaling <strong>$${(totalCents / 100).toFixed(2)}</strong>.</p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="padding:10px;text-align:left">Payer</th><th style="padding:10px;text-align:left">Dancer</th><th style="padding:10px;text-align:left">Attempt</th><th style="padding:10px;text-align:right">Amount</th><th style="padding:10px;text-align:left">Time</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`
            })
          });
          const summaryBody = await summaryResponse.json().catch(() => ({})) as { messageId?: string; message?: string };
          await admin.from("daily_payment_summary_deliveries").update(summaryResponse.ok ? { status: "sent", provider_message_id: summaryBody.messageId || null, sent_at: new Date().toISOString(), safe_error: null } : { status: "failed", safe_error: "Brevo could not send the daily payment summary." }).eq("summary_date", today);
          dailySummary = summaryResponse.ok ? "sent" : "failed";
        } else dailySummary = "already_sent";
      }
    }
    return json({ ok: true, environment: "sandbox", considered: attempts?.length || 0, submitted, skipped, failed, dailySummary });
  } catch (error) {
    console.error("square-family-billing-dispatch", error instanceof Error ? error.message : "unknown");
    return json({ ok: false, message: "Sandbox billing dispatch failed safely." }, 500);
  }
});
