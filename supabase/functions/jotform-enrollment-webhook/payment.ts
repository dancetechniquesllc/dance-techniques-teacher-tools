type JsonRecord = Record<string, unknown>;

const clean = (value: unknown) => String(value ?? "").trim();

const paymentEntries = (value: unknown, path = "", entries: string[] = []): string[] => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => paymentEntries(item, `${path}[${index}]`, entries));
    return entries;
  }
  if (value && typeof value === "object") {
    Object.entries(value as JsonRecord).forEach(([key, child]) => paymentEntries(child, path ? `${path}.${key}` : key, entries));
    return entries;
  }
  const normalizedPath = path.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (/(payment|transaction|amount|total|status|product)/.test(normalizedPath)) {
    const text = clean(value);
    if (text) entries.push(`${path}: ${text}`);
  }
  return entries;
};

export const parsePaymentDetails = (paymentSummary: string, ...sources: unknown[]) => {
  const paymentText = [paymentSummary, ...sources.flatMap((source) => paymentEntries(source))].filter(Boolean).join(" | ");
  const transactionId = paymentText.match(/(?:transaction(?:\s|[_.-])*id|transactionid|payment(?:\s|[_.-])*id)\s*["']?\s*[:=]\s*["']?([^\s,"'|}]+)/i)?.[1] || "";
  const amountMatch = paymentText.match(/(?:grand\s*total|total|amount)\s*["']?\s*[:=]\s*["']?\s*(?:USD\s*)?\$?\s*(\d+(?:\.\d{1,2})?)/i);
  const amount = amountMatch?.[1] || "";
  const explicitlyUnpaid = /\b(?:not\s+paid|unpaid|pending|incomplete|cancelled|canceled)\b/i.test(paymentText);
  const status = !explicitlyUnpaid
    && !/\b(?:refund(?:ed)?|failed|declined|denied|error)\b/i.test(paymentText)
    && (Boolean(transactionId) || /\b(?:paid|completed|successful|success|approved|captured)\b/i.test(paymentText))
    ? "paid"
    : "unpaid";

  return { status, amount, transactionId };
};

export const shouldReplacePaymentStatus = (existing: string, incoming: string) => {
  if (incoming === existing) return false;
  if (existing === "paid" && incoming === "unpaid") return false;
  return incoming === "paid";
};
