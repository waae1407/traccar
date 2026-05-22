import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldAlert } from "lucide-react";
import { loadPaymentReconciliationData } from "@/lib/operational/sharedPaymentReconciliationEngine";
import PaymentReconciliationKpis from "@/components/admin/payment-reconciliation/PaymentReconciliationKpis";
import PaymentReconciliationFilters from "@/components/admin/payment-reconciliation/PaymentReconciliationFilters";
import PaymentIssueTable from "@/components/admin/payment-reconciliation/PaymentIssueTable";
import ReconciliationTotals from "@/components/admin/payment-reconciliation/ReconciliationTotals";
import AdminReviewQueue from "@/components/admin/payment-reconciliation/AdminReviewQueue";
import HistoricalPayoutBackfillPreview from "@/components/admin/payment-reconciliation/HistoricalPayoutBackfillPreview";
import BookingStateReviewPanel from "@/components/admin/payment-reconciliation/BookingStateReviewPanel";
import FinancialIntegrityDashboard from "@/components/admin/payment-reconciliation/FinancialIntegrityDashboard";
import FinancialExceptionRegistry from "@/components/admin/payment-reconciliation/FinancialExceptionRegistry";
import FinancialAuditTimeline from "@/components/admin/payment-reconciliation/FinancialAuditTimeline";
import GlobalGovernanceBanner from "@/components/admin/governance/GlobalGovernanceBanner";
import ProductionActivationStatus from "@/components/admin/stabilization/ProductionActivationStatus";
import { PRODUCTION_ACTIVATION_FLAGS } from "@/lib/operational/productionActivationFlags";
import OperationalReviewerActions from "@/components/admin/stabilization/OperationalReviewerActions";

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(rows) {
  const headers = [
    "severity", "confidence", "confidence_score", "review_state", "authoritative_flag", "issue_type", "payout_candidate_status", "recommended_remediation",
    "payment_log_id", "booking_request_id", "host_id", "vehicle_id", "customer_id", "customer_email",
    "amount", "expected_amount", "amount_delta", "paid_date", "week_number",
    "billing_period_start", "billing_period_end", "payment_method", "source_type", "source_confidence",
    "legacy_flag", "external_reconcilable", "external_reference", "stripe_payment_intent_id", "stripe_charge_id",
    "source_label", "synthesized_flag", "rollback_classification", "blocker_status", "reconciliation_state", "governance_recommendation"
  ];
  const csvRows = rows.flatMap((row) => {
    const issues = row.issueTypes?.length ? row.issueTypes : [""];
    return issues.map((issueType) => [
      row.severity,
      row.confidence,
      row.confidenceScore || "",
      row.reviewState || "pending_review",
      row.authoritative ? "true" : "false",
      issueType,
      row.payoutCandidateStatus || "",
      row.recommendedAction || "",
      row.payment?.id || "",
      row.payment?.booking_request_id || row.booking?.id || row.payout?.booking_request_id || "",
      row.payment?.host_id || row.booking?.host_id || row.payout?.host_id || "",
      row.payment?.vehicle_id || row.booking?.vehicle_id || "",
      row.payment?.customer_id || row.booking?.user_id || "",
      row.payment?.customer_email || row.booking?.user_email || "",
      row.collectedAmount,
      row.expectedAmount,
      row.amountDelta,
      row.paidDate ? String(row.paidDate).slice(0, 10) : "",
      row.payment?.week_number || "",
      row.payment?.billing_period_start || row.payout?.period_start || "",
      row.payment?.billing_period_end || row.payout?.period_end || "",
      row.payment?.payment_method || "",
      row.payment?.source_type || "",
      row.payment?.source_confidence || "",
      row.payment?.legacy_flag ?? "",
      row.payment?.external_reconcilable ?? "",
      row.payment?.external_reference || "",
      row.payment?.stripe_payment_intent_id || "",
      row.payment?.stripe_charge_id || "",
      row.payment?.source_type || row.payment?.payment_method || "unknown",
      row.payout?._synthesized ? "true" : "false",
      row.confidence === "trusted" ? "rollback_safe" : "review_required",
      row.blockers?.length ? "blocked" : (row.issueTypes?.length ? "open" : "clear"),
      row.reviewState || "pending_review",
      row.authoritative ? "export_ready" : "governance_review_required",
    ]);
  });
  const csv = [headers.join(","), ...csvRows.map((values) => values.map(csvEscape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `payment-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminPaymentReconciliationPreview() {
  const [filters, setFilters] = useState({});
  const { data, isLoading } = useQuery({ queryKey: ["payment-reconciliation-preview"], queryFn: loadPaymentReconciliationData });

  const issueTypes = useMemo(() => Object.keys(data?.issueCategories || {}).sort(), [data]);
  const hosts = useMemo(() => {
    const map = new Map();
    (data?.paymentRows || []).forEach((row) => { if (row.host?.id) map.set(row.host.id, row.host); });
    return Array.from(map.values());
  }, [data]);

  const filteredRows = useMemo(() => {
    const rows = data?.issueRows || [];
    return rows.filter((row) => {
      const q = String(filters.search || "").toLowerCase();
      if (q) {
        const haystack = `${row.payment?.customer_name || ""} ${row.payment?.customer_email || ""} ${row.payment?.booking_request_id || ""} ${row.booking?.id || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.hostId && row.payment?.host_id !== filters.hostId && row.booking?.host_id !== filters.hostId) return false;
      if (filters.confidence && row.confidence !== filters.confidence) return false;
      if (filters.issueType && !row.issueTypes.includes(filters.issueType)) return false;
      if (filters.status && row.payment?.status !== filters.status) return false;
      const rowDate = row.paidDate ? String(row.paidDate).slice(0, 10) : "";
      if (filters.dateFrom && rowDate && rowDate < filters.dateFrom) return false;
      if (filters.dateTo && rowDate && rowDate > filters.dateTo) return false;
      return true;
    });
  }, [data, filters]);

  if (isLoading) return <div className="p-6 text-white/60">Loading payment reconciliation…</div>;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <GlobalGovernanceBanner />
      <ProductionActivationStatus flag={PRODUCTION_ACTIVATION_FLAGS.PaymentReconciliationPreview} title="Payment Reconciliation full operational activation" />
      <ProductionActivationStatus flag={PRODUCTION_ACTIVATION_FLAGS.ReconciliationExports} title="Certified reconciliation exports activation" />
      <OperationalReviewerActions systemArea="payment_reconciliation" />

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold">Read-only preview</p>
          <h1 className="text-3xl font-bold text-white mt-1">Payment Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-3xl">Classifies PaymentLog integrity, booking/payment mismatches, payout gaps, Stripe ID gaps, manual entries, backfills, and dispute-linked payments without writing data.</p>
        </div>
        <button onClick={() => downloadCsv(filteredRows)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white/70 hover:bg-white/10">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <FinancialIntegrityDashboard summary={data?.summary} />
      <PaymentReconciliationKpis summary={data?.summary} />
      <ReconciliationTotals summary={data?.summary} />
      <AdminReviewQueue rows={data?.issueRows || []} />
      <BookingStateReviewPanel rows={data?.issueRows || []} />
      <HistoricalPayoutBackfillPreview rows={data?.historicalPayoutBackfillPreviewRows || []} />
      <FinancialExceptionRegistry exceptions={data?.exceptionRegistry || []} />
      <FinancialAuditTimeline events={data?.auditTimeline || []} />

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3 text-white font-semibold"><ShieldAlert className="h-4 w-4 text-primary" /> Recommended cleanup actions</div>
        <ul className="space-y-2 text-sm text-white/60 list-disc pl-5">
          {(data?.recommendedCleanupActions || []).map((action) => <li key={action}>{action}</li>)}
          {(data?.recommendedCleanupActions || []).length === 0 && <li>No cleanup actions detected by current rules.</li>}
        </ul>
      </div>

      <PaymentReconciliationFilters filters={filters} onChange={setFilters} hosts={hosts} issueTypes={issueTypes} />
      <PaymentIssueTable rows={filteredRows} />
    </div>
  );
}