export const FINANCIAL_EXCEPTION_CATEGORIES = [
  "booking_payment_mismatch",
  "missing_payout_linkage",
  "unresolved_manual_payment",
  "missing_stripe_identifiers",
  "duplicate_risk",
  "orphan_payout",
  "unresolved_host_attribution",
  "unresolved_customer_attribution",
  "unresolved_dispute_linkage",
];

const CATEGORY_MAP = {
  booking_state_mismatch: "booking_payment_mismatch",
  successful_payment_booking_not_paid: "booking_payment_mismatch",
  booking_paid_no_successful_paymentlog: "booking_payment_mismatch",
  amount_mismatch: "booking_payment_mismatch",
  missing_host_payout: "missing_payout_linkage",
  host_payout_without_source_paymentlog: "orphan_payout",
  manual_payment: "unresolved_manual_payment",
  backfill: "unresolved_manual_payment",
  missing_stripe_id: "missing_stripe_identifiers",
  duplicate_risk: "duplicate_risk",
  missing_customer_id: "unresolved_customer_attribution",
  dispute_linked_paid_payment: "unresolved_dispute_linkage",
};

export function buildFinancialExceptionRegistry(issueRows = []) {
  return issueRows.flatMap((row) => {
    const issueTypes = row.issueTypes?.length ? row.issueTypes : ["unresolved_manual_payment"];
    return issueTypes.map((issueType) => ({
      id: `${row.id}-${issueType}`,
      category: CATEGORY_MAP[issueType] || "unresolved_manual_payment",
      issueType,
      severity: row.severity || "warning",
      confidence: row.confidence || "unresolved",
      confidenceScore: row.confidenceScore || 0,
      reviewState: row.reviewState || "pending_review",
      recommendedAction: row.recommendedAction || "Admin review required before financial promotion.",
      linkedEntities: {
        paymentLogId: row.payment?.id || "",
        bookingRequestId: row.payment?.booking_request_id || row.booking?.id || row.payout?.booking_request_id || "",
        hostId: row.payment?.host_id || row.booking?.host_id || row.payout?.host_id || "",
        vehicleId: row.payment?.vehicle_id || row.booking?.vehicle_id || "",
        payoutId: row.payout?.id || "",
        disputeIds: row.relatedDisputeIds || [],
      },
      createdAt: row.paidDate || row.payment?.created_date || row.booking?.updated_date || row.payout?.created_date || null,
      reviewedAt: null,
    }));
  });
}