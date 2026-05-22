import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldAlert } from "lucide-react";
import { loadPaymentReconciliationData } from "@/lib/operational/sharedPaymentReconciliationEngine";
import PaymentReconciliationKpis from "@/components/admin/payment-reconciliation/PaymentReconciliationKpis";
import PaymentReconciliationFilters from "@/components/admin/payment-reconciliation/PaymentReconciliationFilters";
import PaymentIssueTable from "@/components/admin/payment-reconciliation/PaymentIssueTable";

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(rows) {
  const headers = ["severity", "confidence", "issue_types", "booking_request_id", "payment_log_id", "customer_email", "expected_amount", "collected_amount", "paid_date"];
  const csv = [headers.join(","), ...rows.map((row) => [
    row.severity,
    row.confidence,
    row.issueTypes.join("|"),
    row.payment?.booking_request_id || row.booking?.id || row.payout?.booking_request_id || "",
    row.payment?.id || "",
    row.payment?.customer_email || row.booking?.user_email || "",
    row.expectedAmount,
    row.collectedAmount,
    row.paidDate ? String(row.paidDate).slice(0, 10) : "",
  ].map(csvEscape).join(","))].join("\n");
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

      <PaymentReconciliationKpis summary={data?.summary} />

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