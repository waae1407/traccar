export function buildFinancialAuditTimeline({ paymentRows = [], payoutCandidates = [], disputes = [], activityEvents = [] }) {
  const paymentEvents = paymentRows.map((row) => ({
    id: `payment-${row.payment?.id}`,
    type: "payment_log_event",
    label: `PaymentLog ${row.payment?.status || "unknown"}`,
    timestamp: row.payment?.paid_at || row.payment?.created_date || row.paidDate,
    entityType: "PaymentLog",
    entityId: row.payment?.id,
    confidence: row.confidence,
    details: row.recommendedAction,
  }));

  const payoutPreviewEvents = payoutCandidates.map((candidate) => ({
    id: `payout-preview-${candidate.sourcePaymentId}`,
    type: "payout_preview_event",
    label: `Payout candidate: ${candidate.candidateStatus}`,
    timestamp: new Date().toISOString(),
    entityType: "PaymentLog",
    entityId: candidate.sourcePaymentId,
    confidence: candidate.confidence,
    details: candidate.safetyReason,
  }));

  const disputeEvents = disputes.map((dispute) => ({
    id: `dispute-${dispute.id}`,
    type: "dispute_linkage",
    label: `Dispute ${dispute.status || "open"}`,
    timestamp: dispute.created_date || dispute.updated_date,
    entityType: "Dispute",
    entityId: dispute.id,
    confidence: "unresolved",
    details: dispute.description || dispute.dispute_type || "Dispute linked to financial review.",
  }));

  const activityTimeline = activityEvents
    .filter((event) => String(event.event_type || "").includes("payment") || String(event.event_type || "").includes("payout") || String(event.event_type || "").includes("booking"))
    .slice(0, 100)
    .map((event) => ({
      id: `activity-${event.id}`,
      type: "activity_event_history",
      label: event.event_title || event.summary || event.event_type,
      timestamp: event.created_date,
      entityType: event.target_entity || "ActivityEvent",
      entityId: event.target_id || event.id,
      confidence: "context",
      details: event.event_description || event.summary || "ActivityEvent history.",
    }));

  return [...paymentEvents, ...payoutPreviewEvents, ...disputeEvents, ...activityTimeline]
    .filter((event) => event.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}