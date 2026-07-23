(function (root) {
  "use strict";

  const tokenPatterns = [
    /\[[^\]\n]+\]/g,
    /\{\{[^}\n]+\}\}/g,
    /%[A-Z0-9_]+%/g,
    /\{(?!\{)[A-Za-z][^}\n]*\}(?!\})/g
  ];
  const patterns = {
    links: /https?:\/\/[^\s<>()]+/gi,
    emails: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    phones: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g,
    money: /\$\s?\d+(?:,\d{3})*(?:\.\d{2})?/g,
    dates: /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi,
    times: /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)\b/gi,
    weekdays: /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi
  };

  const uniqueMatches = (text, pattern) => [...new Set(String(text || "").match(pattern) || [])];
  const extractTokens = (text) => [...new Set(tokenPatterns.flatMap((pattern) => uniqueMatches(text, pattern)))];
  const analyze = (text, explicitNames = []) => ({
    originalText: String(text || ""),
    tokens: extractTokens(text),
    links: uniqueMatches(text, patterns.links),
    emails: uniqueMatches(text, patterns.emails),
    phones: uniqueMatches(text, patterns.phones),
    money: uniqueMatches(text, patterns.money),
    dates: uniqueMatches(text, patterns.dates),
    times: uniqueMatches(text, patterns.times),
    weekdays: uniqueMatches(text, patterns.weekdays),
    names: [...new Set((explicitNames || []).filter(Boolean))],
    likelyDeadline: /\b(?:due|deadline|by|no later than|drafts? on)\b/i.test(text),
    serious: /\b(?:tuition|payment|balance|past due|policy|cancel|closed|weather|safety|deadline|urgent)\b/i.test(text)
  });

  const missingFrom = (required, rewritten) => required.filter((value) => !String(rewritten).includes(value));
  const validateRewrite = (analysis, rewritten) => {
    const warnings = [];
    const checks = [
      ["token_changed", "personalization token", analysis.tokens],
      ["link_changed", "link", analysis.links],
      ["email_changed", "email address", analysis.emails],
      ["phone_changed", "phone number", analysis.phones],
      ["money_changed", "money amount", analysis.money],
      ["date_changed", "date", analysis.dates],
      ["time_changed", "time", analysis.times],
      ["name_changed", "required name", analysis.names]
    ];
    checks.forEach(([type, label, values]) => missingFrom(values, rewritten).forEach((value) => warnings.push({ type, message: `Protected ${label} was changed or removed: ${value}` })));
    const originalLinks = analysis.links.slice().sort().join("|");
    const newLinks = uniqueMatches(rewritten, patterns.links).slice().sort().join("|");
    if (originalLinks !== newLinks && !warnings.some((item) => item.type === "link_changed")) warnings.push({ type: "link_added", message: "The rewrite added or changed a link." });
    return { valid: warnings.length === 0, warnings };
  };

  const detectConflicts = (text) => {
    const warnings = [];
    const dateDay = String(text).match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*,?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*(\d{4}))?/i);
    if (dateDay && dateDay[4]) {
      const candidate = new Date(`${dateDay[2]} ${dateDay[3]}, ${dateDay[4]} 12:00:00`);
      if (!Number.isNaN(candidate.getTime()) && candidate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase() !== dateDay[1].toLowerCase()) warnings.push({ type: "conflicting_fact", message: `${dateDay[1]} does not match ${dateDay[2]} ${dateDay[3]}, ${dateDay[4]}. Please review before rewriting.` });
    }
    return warnings;
  };

  const buildPrompt = ({ config, originalText, audienceMode = "parents_guardians", rewriteStrength = "signature_dt", lengthMode = "keep_same_length", optionalContext = "" }) => {
    const analysis = analyze(originalText);
    const conflicts = detectConflicts(originalText);
    return {
      status: conflicts.length ? "needs_review" : "ready",
      warnings: conflicts,
      analysis,
      system: `You are the Dance Techniques writing assistant. Follow this voice configuration exactly. Return JSON only.\n${JSON.stringify(config || {})}`,
      user: JSON.stringify({ original_text: originalText, audience_mode: audienceMode, rewrite_strength: rewriteStrength, length_mode: lengthMode, optional_context: optionalContext, protected_facts: analysis, response_shape: { status: "success | needs_review", rewritten_text: "", warnings: [], preserved_tokens: [], detected_links: [], detected_protected_facts: [] } })
    };
  };

  const validateResponseShape = (response) => Boolean(response && ["success", "needs_review", "provider_unavailable"].includes(response.status) && typeof response.rewritten_text === "string" && Array.isArray(response.warnings) && Array.isArray(response.preserved_tokens) && Array.isArray(response.detected_links) && response.detected_protected_facts && typeof response.detected_protected_facts === "object");

  const createLocalPreview = ({ originalText, rewriteStrength = "signature_dt", lengthMode = "keep_same_length" }) => {
    const original = String(originalText || "").trim();
    if (!original) return "Add your message first, then the DT Touch will help it sound warm, joyful, and unmistakably Dance Techniques.";
    if (rewriteStrength === "light_touch") return original;
    if (analyze(original).serious) return original;
    if (lengthMode === "make_shorter") return original.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    const ending = rewriteStrength === "extra_sparkle" ? " We can’t wait for more twirls, smiles, and joyful memories together! ✨💕" : " Thank you for being part of the Dance Techniques family. 💕";
    return `${original}${ending}`;
  };

  class RewriteService {
    constructor(provider = null) { this.provider = provider; }
    async rewrite(request) {
      const analysis = analyze(request.originalText, request.explicitNames);
      const conflicts = detectConflicts(request.originalText);
      if (conflicts.length) return { status: "needs_review", rewritten_text: "", warnings: conflicts, preserved_tokens: analysis.tokens, detected_links: analysis.links, detected_protected_facts: analysis };
      if (analysis.serious && request.rewriteStrength === "extra_sparkle") return { status: "needs_review", rewritten_text: "", warnings: [{ type: "strength_restricted", message: "Extra Sparkle is unavailable for payment, policy, safety, cancellation, or urgent deadline communication." }], preserved_tokens: analysis.tokens, detected_links: analysis.links, detected_protected_facts: analysis };
      if (!this.provider) return { status: "provider_unavailable", rewritten_text: createLocalPreview(request), warnings: [{ type: "provider_unavailable", message: "The secure AI rewrite provider is not connected yet. This is a local workflow preview." }], preserved_tokens: analysis.tokens, detected_links: analysis.links, detected_protected_facts: analysis };
      const response = await this.provider.rewrite(request);
      if (!validateResponseShape(response)) return { status: "needs_review", rewritten_text: "", warnings: [{ type: "invalid_response", message: "The rewrite provider returned an invalid response shape." }], preserved_tokens: analysis.tokens, detected_links: analysis.links, detected_protected_facts: analysis };
      const validation = validateRewrite(analysis, response.rewritten_text || "");
      return validation.valid ? response : { ...response, status: "needs_review", warnings: [...(response.warnings || []), ...validation.warnings] };
    }
  }

  root.DTTouch = { analyze, extractTokens, validateRewrite, detectConflicts, buildPrompt, validateResponseShape, createLocalPreview, RewriteService };
})(typeof window !== "undefined" ? window : globalThis);
