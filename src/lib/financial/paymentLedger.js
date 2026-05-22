export function normalizePaymentMethod(method = "other") {
  const value = String(method || "other").toLowerCase().replace(/\s+/g, "_");
  const aliases = { card: "stripe", cash_app: "cashapp" };
  const normalized = aliases[value] || value;
  return ["stripe", "zelle", "cash", "cashapp", "venmo", "check", "other"].includes(normalized) ? normalized : "other";
}

export function generatePaymentDedupeKey({ sourceType = "unknown", bookingId = "", weekNumber = "", amount = "", paidAt = "", paymentIntentId = "", externalReference = "", paymentMethod = "" }) {
  if (paymentIntentId) return `payment:stripe:${paymentIntentId}`;
  const paidDate = paidAt ? String(paidAt).slice(0, 10) : "no-date";
  return `payment:${sourceType}:${bookingId}:week:${weekNumber}:amount:${amount}:date:${paidDate}:method:${normalizePaymentMethod(paymentMethod)}:ref:${externalReference || "none"}`;
}

export function classifyPaymentSource({ sourceType, paymentMethod, paymentIntentId, recordedBy } = {}) {
  if (sourceType) return sourceType;
  if (paymentIntentId) return recordedBy === "stripe_webhook" ? "stripe_webhook" : "scheduled_billing";
  if (recordedBy === "backfill") return "backfill";
  if (["zelle", "cash", "cashapp", "venmo", "check"].includes(normalizePaymentMethod(paymentMethod))) return "admin_manual";
  return "unknown";
}

export function classifyPaymentConfidence({ sourceType, paymentIntentId, externalReference, paymentMethod } = {}) {
  const source = classifyPaymentSource({ sourceType, paymentIntentId, paymentMethod });
  if (paymentIntentId) return "trusted";
  if (["admin_manual", "manual_import"].includes(source) && externalReference) return "trusted";
  if (["admin_manual", "backfill"].includes(source)) return "partially_trusted";
  return "unresolved";
}