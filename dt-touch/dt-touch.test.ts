import { assert, assertEquals } from "jsr:@std/assert@1";
import "./dt-touch.js";

const DT = (globalThis as typeof globalThis & { DTTouch: any }).DTTouch;

Deno.test("preserves personalization tokens", () => {
  const source = "Hi [Parent First Name], {{dancer_name}} dances on [Dance Day].";
  const analysis = DT.analyze(source);
  assertEquals(analysis.tokens, ["[Parent First Name]", "[Dance Day]", "{{dancer_name}}"]);
  assert(DT.validateRewrite(analysis, source).valid);
  assert(!DT.validateRewrite(analysis, "Hi Jordan").valid);
});

Deno.test("preserves links, money, dates, and times", () => {
  const source = "Pay $35.00 by September 1 at 5:00 PM: https://example.com/pay";
  const analysis = DT.analyze(source);
  assert(DT.validateRewrite(analysis, `A friendly reminder: ${source}`).valid);
  assert(!DT.validateRewrite(analysis, "Pay $30.00 by September 2 at 6:00 PM.").valid);
});

Deno.test("detects phone and email changes", () => {
  const source = "Email dance@example.com or call 214-555-0100.";
  const validation = DT.validateRewrite(DT.analyze(source), "Please contact us.");
  assert(!validation.valid);
  assertEquals(validation.warnings.length, 2);
});

Deno.test("Light Touch stays unchanged in local preview", () => {
  const source = "Class is Friday at 4:00 PM.";
  assertEquals(DT.createLocalPreview({ originalText: source, rewriteStrength: "light_touch" }), source);
});

Deno.test("serious payment content is detected for Extra Sparkle restriction", () => {
  assert(DT.analyze("Your tuition balance is due Friday.").serious);
  assert(!DT.analyze("Happy birthday, [Dancer Preferred Name]!").serious);
});

Deno.test("Extra Sparkle is rejected for payment messages", async () => {
  const response = await new DT.RewriteService().rewrite({ originalText: "Tuition is due Friday.", rewriteStrength: "extra_sparkle", lengthMode: "keep_same_length" });
  assertEquals(response.status, "needs_review");
  assertEquals(response.warnings[0].type, "strength_restricted");
});

Deno.test("flags conflicting full date and weekday", () => {
  const warnings = DT.detectConflicts("Class is Monday, September 1, 2026 at 4:00 PM.");
  assertEquals(warnings[0].type, "conflicting_fact");
});

Deno.test("buildPrompt returns structured needs_review on conflict", () => {
  const result = DT.buildPrompt({ originalText: "Class is Monday, September 1, 2026.", audienceMode: "parents_guardians", rewriteStrength: "light_touch", lengthMode: "keep_same_length", config: {} });
  assertEquals(result.status, "needs_review");
});

Deno.test("provider abstraction returns valid response shape when disconnected", async () => {
  const response = await new DT.RewriteService().rewrite({ originalText: "Welcome to dance.", audienceMode: "parents_guardians", rewriteStrength: "signature_dt", lengthMode: "keep_same_length" });
  assertEquals(response.status, "provider_unavailable");
  assert(Array.isArray(response.warnings));
  assert(Array.isArray(response.preserved_tokens));
  assert(Array.isArray(response.detected_links));
  assert(DT.validateResponseShape(response));
});

Deno.test("rejects an invalid response schema", () => {
  assert(!DT.validateResponseShape({ status: "success", rewritten_text: "Missing arrays" }));
});

Deno.test("failed post-rewrite validation becomes needs_review", async () => {
  const provider = { rewrite: async () => ({ status: "success", rewritten_text: "Pay $20.00 tomorrow.", warnings: [] }) };
  const response = await new DT.RewriteService(provider).rewrite({ originalText: "Pay $35.00 by September 1.", audienceMode: "policy_payment_deadline", rewriteStrength: "light_touch", lengthMode: "keep_same_length" });
  assertEquals(response.status, "needs_review");
});

Deno.test("shorter mode removes optional trailing sentences", () => {
  const preview = DT.createLocalPreview({ originalText: "First sentence. Second sentence. Third sentence.", rewriteStrength: "signature_dt", lengthMode: "make_shorter" });
  assertEquals(preview, "First sentence. Second sentence.");
});
