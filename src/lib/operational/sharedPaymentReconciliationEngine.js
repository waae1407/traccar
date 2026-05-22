import { base44 } from "@/api/base44Client";
import { scorePaymentConfidence, getRecommendedPaymentAction } from "@/lib/operational/paymentConfidenceRules";
import { buildPayoutBackfillCandidates } from "@/lib/operational/payoutBackfillCandidateEngine";
import { buildFinancialExceptionRegistry } from "@/lib/operational/financialExceptionRegistry";
import { buildFinancialAuditTimeline } from "@/lib/operational/financialAuditTimeline";

const MONEY_TOLERANCE = 0.05;
const SUCCESS_STATUSES = new Set(["paid"]);
const PROBLEM_BOOKING_STATUSES = new Set(["suspended", "cancelled", "rejected"]);
const PROBLEM_PAYMENT_STATUSES = new Set(["failed", "refunded"]);

const toNumber = (value) => Number(value || 0);
const norm = (value) => String(value || "").toLowerCase();
const dateOnly = (value) => value ? String(value).slice(0, 10) : "";

function makeMap(records = []) {
  return new Map(records.map((record) => [record.id, record]));
}

function expectedAmountForPayment(payment, booking) {
  if (!booking) return 0;
  if (toNumber(payment.week_number) > 1 && booking.weekly_rate) return toNumber(booking.weekly_rate);
  return toNumber(booking.total_due_now || booking.first_payment_amount || booking.weekly_rate || 0);
}

function addIssue(issues, type, severity, message) {
  issues.push({ type, severity, message });
}

export async function loadPaymentReconciliationData() {
  const [payments, bookings, payouts, disputes, vehicles, hosts, activityEvents] = await Promise.all([
    base44.entities.PaymentLog.list("-created_date", 1000),
    base44.entities.BookingRequest.list("-updated_date", 1000),
    base44.entities.HostPayout.list("-created_date", 1000),
    base44.entities.Dispute.list("-created_date", 1000),
    base44.entities.Vehicle.list("-updated_date", 1000),
    base44.entities.Host.list("-updated_date", 1000),
    base44.entities.ActivityEvent.list("-created_date", 1000),
  ]);

  return reconcilePayments({ payments, bookings, payouts, disputes, vehicles, hosts, activityEvents });
}

export function reconcilePayments({ payments = [], bookings = [], payouts = [], disputes = [], vehicles = [], hosts = [], activityEvents = [] }) {
  const bookingMap = makeMap(bookings);
  const vehicleMap = makeMap(vehicles);
  const hostMap = makeMap(hosts);
  const payoutsByBooking = new Map();
  const disputesByBooking = new Map();
  const paymentKeys = new Map();

  payouts.forEach((payout) => {
    if (!payout.booking_request_id) return;
    const list = payoutsByBooking.get(payout.booking_request_id) || [];
    list.push(payout);
    payoutsByBooking.set(payout.booking_request_id, list);
  });

  disputes.forEach((dispute) => {
    if (!dispute.booking_request_id) return;
    const list = disputesByBooking.get(dispute.booking_request_id) || [];
    list.push(dispute);
    disputesByBooking.set(dispute.booking_request_id, list);
  });

  payments.forEach((payment) => {
    const key = `${payment.booking_request_id || "missing"}|${payment.week_number || "missing"}|${payment.status || "missing"}`;
    const list = paymentKeys.get(key) || [];
    list.push(payment.id);
    paymentKeys.set(key, list);
  });

  const paymentRows = payments.map((payment) => {
    const booking = bookingMap.get(payment.booking_request_id);
    const vehicle = vehicleMap.get(payment.vehicle_id || booking?.vehicle_id);
    const host = hostMap.get(payment.host_id || booking?.host_id || vehicle?.host_id);
    const relatedPayouts = payoutsByBooking.get(payment.booking_request_id) || [];
    const relatedDisputes = disputesByBooking.get(payment.booking_request_id) || [];
    const issues = [];
    const issueTypes = [];
    const paymentStatus = norm(payment.status);
    const isSuccessful = SUCCESS_STATUSES.has(paymentStatus);
    const key = `${payment.booking_request_id || "missing"}|${payment.week_number || "missing"}|${payment.status || "missing"}`;

    if (payment.payment_method === "stripe" && !payment.stripe_payment_intent_id) addIssue(issues, "missing_stripe_id", "critical", "Stripe payment is missing payment_intent_id.");
    if (!payment.customer_id) addIssue(issues, "missing_customer_id", "warning", "PaymentLog does not store a customer_id/user_id.");
    if (PROBLEM_PAYMENT_STATUSES.has(paymentStatus)) addIssue(issues, "failed_or_refunded", "warning", "Payment row is failed or refunded and must be excluded from collected cash.");
    if ((payment.source_type === "backfill" || payment.legacy_flag || payment.recorded_by === "backfill")) addIssue(issues, "backfill", "warning", "Backfilled payment requires confidence labeling.");
    if (["zelle", "cash", "cashapp", "venmo", "check", "other"].includes(payment.payment_method) && !payment.stripe_payment_intent_id) addIssue(issues, "manual_payment", "warning", "Manual/non-Stripe payment requires external reference review.");
    if ((paymentKeys.get(key) || []).length > 1 && isSuccessful) addIssue(issues, "duplicate_risk", "critical", "Multiple successful PaymentLogs share booking/week/status.");
    if (booking && isSuccessful && (PROBLEM_BOOKING_STATUSES.has(norm(booking.booking_status)) || PROBLEM_PAYMENT_STATUSES.has(norm(booking.payment_status)))) addIssue(issues, "booking_state_mismatch", "critical", "Successful payment is linked to a failed/suspended/cancelled booking state.");
    if (booking && isSuccessful && norm(booking.payment_status) !== "paid") addIssue(issues, "successful_payment_booking_not_paid", "warning", "PaymentLog is paid but BookingRequest payment_status is not paid.");

    const expectedAmount = expectedAmountForPayment(payment, booking);
    const amountDelta = toNumber(payment.amount) - expectedAmount;
    if (booking && isSuccessful && expectedAmount > 0 && Math.abs(amountDelta) > MONEY_TOLERANCE) addIssue(issues, "amount_mismatch", "warning", "Payment amount differs from expected booking amount.");

    if (isSuccessful && relatedPayouts.length === 0) addIssue(issues, "missing_host_payout", "warning", "Successful payment has no HostPayout for the booking.");
    if (isSuccessful && relatedDisputes.length > 0) addIssue(issues, "dispute_linked_paid_payment", "critical", "Paid payment is linked to one or more disputes.");

    issues.forEach((issue) => issueTypes.push(issue.type));
    const confidenceResult = scorePaymentConfidence(payment, issueTypes, {
      hasBooking: Boolean(booking),
      amountMatches: !booking || expectedAmount === 0 || Math.abs(amountDelta) <= MONEY_TOLERANCE,
    });
    const confidence = confidenceResult.label;

    const row = {
      id: payment.id,
      payment,
      booking,
      host,
      vehicle,
      confidence,
      confidenceScore: confidenceResult.score,
      confidenceFactors: confidenceResult.factors,
      reviewState: "pending_review",
      authoritative: confidence === "trusted",
      issueTypes,
      issues,
      severity: issues.some((i) => i.severity === "critical") ? "critical" : issues.length ? "warning" : "safe",
      expectedAmount,
      collectedAmount: toNumber(payment.amount),
      amountDelta,
      relatedPayoutCount: relatedPayouts.length,
      relatedDisputeCount: relatedDisputes.length,
      paidDate: payment.paid_at || payment.created_date,
      recommendedAction: "",
    };

    row.recommendedAction = getRecommendedPaymentAction(row);
    return row;
  });

  const paidPaymentBookingIds = new Set(payments.filter((payment) => norm(payment.status) === "paid").map((payment) => payment.booking_request_id).filter(Boolean));
  const bookingIssues = bookings.flatMap((booking) => {
    const rows = [];
    if (norm(booking.payment_status) === "paid" && !paidPaymentBookingIds.has(booking.id)) {
      rows.push({
        id: `booking-paid-no-log-${booking.id}`,
        booking,
        confidence: "unresolved",
        severity: "critical",
        issueTypes: ["booking_paid_no_successful_paymentlog"],
        issues: [{ type: "booking_paid_no_successful_paymentlog", severity: "critical", message: "Booking is marked paid with no successful PaymentLog." }],
        recommendedAction: "Review booking payment state; do not treat as paid until a source payment is confirmed.",
        expectedAmount: toNumber(booking.total_due_now || booking.weekly_rate || 0),
        collectedAmount: 0,
        amountDelta: -toNumber(booking.total_due_now || booking.weekly_rate || 0),
        paidDate: booking.updated_date,
      });
    }
    return rows;
  });

  const payoutIssues = payouts.flatMap((payout) => {
    const hasPayment = payments.some((payment) => payment.booking_request_id === payout.booking_request_id && norm(payment.status) === "paid");
    if (hasPayment) return [];
    return [{
      id: `payout-no-payment-${payout.id}`,
      payout,
      confidence: "unresolved",
      severity: "critical",
      issueTypes: ["host_payout_without_source_paymentlog"],
      issues: [{ type: "host_payout_without_source_paymentlog", severity: "critical", message: "HostPayout has no successful source PaymentLog for its booking." }],
      recommendedAction: "Review payout source; link to payment evidence before authoritative payout reporting.",
      expectedAmount: toNumber(payout.gross_booking_amount || payout.gross_collected || 0),
      collectedAmount: 0,
      amountDelta: 0,
      paidDate: payout.payout_date || payout.created_date,
    }];
  });

  const issueRows = [...paymentRows.filter((row) => row.issues.length > 0), ...bookingIssues, ...payoutIssues];
  const countRows = (predicate) => paymentRows.filter(predicate).length;
  const successfulPaymentRows = paymentRows.filter((row) => row.payment?.status === "paid");
  const authoritativeRows = successfulPaymentRows.filter((row) => row.confidence === "trusted");
  const nonAuthoritativeRows = successfulPaymentRows.filter((row) => row.confidence !== "trusted");
  const stripeRows = successfulPaymentRows.filter((row) => row.payment?.stripe_payment_intent_id || row.payment?.stripe_charge_id);
  const manualBackfillRows = successfulPaymentRows.filter((row) => row.issueTypes.includes("manual_payment") || row.issueTypes.includes("backfill"));
  const unresolvedRows = successfulPaymentRows.filter((row) => row.confidence === "unresolved");
  const coveredPayoutRows = successfulPaymentRows.filter((row) => row.relatedPayoutCount > 0);

  const sumRows = (rows) => rows.reduce((total, row) => total + toNumber(row.collectedAmount), 0);

  const historicalPayoutBackfillPreviewRows = buildPayoutBackfillCandidates(successfulPaymentRows);
  const exceptionRegistry = buildFinancialExceptionRegistry(issueRows);
  const auditTimeline = buildFinancialAuditTimeline({ paymentRows, payoutCandidates: historicalPayoutBackfillPreviewRows, disputes, activityEvents });

  const issueCategories = issueRows.reduce((acc, row) => {
    row.issueTypes.forEach((type) => {
      acc[type] = (acc[type] || 0) + 1;
    });
    return acc;
  }, {});

  const recommendedCleanupActions = [
    issueCategories.missing_stripe_id ? "Recover Stripe identifiers for Stripe-sourced PaymentLog rows or mark them non-reconcilable." : null,
    issueCategories.missing_customer_id ? "Add future customer_id/user_id linkage to PaymentLog creation once customer identity mapping is finalized." : null,
    issueCategories.duplicate_risk ? "Review duplicate booking/week payment groups before payout or P&L promotion." : null,
    issueCategories.booking_state_mismatch ? "Resolve paid PaymentLogs attached to failed/suspended bookings before authoritative reporting." : null,
    issueCategories.missing_host_payout ? "Reconcile successful payments without HostPayout records before payout reporting promotion." : null,
    issueCategories.host_payout_without_source_paymentlog ? "Link HostPayout rows to source PaymentLog records or classify as legacy/synthesized." : null,
    issueCategories.dispute_linked_paid_payment ? "Route disputed paid payments through the future adjustment/recovery ledger." : null,
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    entitiesRead: {
      PaymentLog: payments.length,
      BookingRequest: bookings.length,
      HostPayout: payouts.length,
      Dispute: disputes.length,
      Vehicle: vehicles.length,
      Host: hosts.length,
      ActivityEvent: activityEvents.length,
    },
    summary: {
      totalPaymentRows: payments.length,
      trustedRows: countRows((row) => row.confidence === "trusted"),
      partiallyTrustedRows: countRows((row) => row.confidence === "partially_trusted" || row.confidence === "manual_payment" || row.confidence === "backfill"),
      unresolvedRows: countRows((row) => row.confidence === "unresolved"),
      duplicateRiskRows: countRows((row) => row.issueTypes.includes("duplicate_risk")),
      missingStripeIdRows: countRows((row) => row.issueTypes.includes("missing_stripe_id")),
      bookingMismatchRows: countRows((row) => row.issueTypes.includes("booking_state_mismatch") || row.issueTypes.includes("successful_payment_booking_not_paid")),
      payoutMissingRows: countRows((row) => row.issueTypes.includes("missing_host_payout")),
      issueRows: issueRows.length,
      authoritativeCollectedTotal: sumRows(authoritativeRows),
      nonAuthoritativeCollectedTotal: sumRows(nonAuthoritativeRows),
      stripeReconciledTotal: sumRows(stripeRows),
      manualBackfillTotal: sumRows(manualBackfillRows),
      unresolvedTotal: sumRows(unresolvedRows),
      payoutCoveragePercent: successfulPaymentRows.length ? (coveredPayoutRows.length / successfulPaymentRows.length) * 100 : 0,
      reconciliationConfidencePercent: paymentRows.length ? paymentRows.reduce((total, row) => total + (row.confidenceScore || 0), 0) / paymentRows.length : 0,
      unresolvedPayoutLiabilities: historicalPayoutBackfillPreviewRows.reduce((total, row) => total + toNumber(row.estimatedHostPayout), 0),
      bookingMismatchCount: issueRows.filter((row) => row.issueTypes?.some((type) => ["booking_state_mismatch", "successful_payment_booking_not_paid", "booking_paid_no_successful_paymentlog", "amount_mismatch"].includes(type))).length,
      duplicateRiskCount: issueRows.filter((row) => row.issueTypes?.includes("duplicate_risk")).length,
      unresolvedHostAttributionCount: paymentRows.filter((row) => !(row.payment?.host_id || row.booking?.host_id || row.host?.id)).length,
      unresolvedCustomerAttributionCount: paymentRows.filter((row) => !row.payment?.customer_id && !row.booking?.user_id).length,
      trustedRows: countRows((row) => row.confidence === "trusted"),
      partiallyTrustedRows: countRows((row) => row.confidence === "partially_trusted"),
      excludedRows: countRows((row) => row.confidence === "excluded"),
    },
    historicalPayoutBackfillPreviewRows,
    payoutBackfillCandidates: historicalPayoutBackfillPreviewRows,
    exceptionRegistry,
    auditTimeline,
    issueCategories,
    paymentRows,
    issueRows,
    recommendedCleanupActions,
  };
}