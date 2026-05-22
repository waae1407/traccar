import React from "react";

const LABELS = {
  payout_gap: "Payout gaps",
  booking_mismatch: "Booking mismatches",
  duplicate_risk: "Duplicate risks",
  unresolved_payment: "Unresolved payments",
  unresolved_host_attribution: "Unresolved host attribution",
  unresolved_customer_attribution: "Unresolved customer attribution",
  stripe_reconciliation_failure: "Stripe reconciliation failures",
  legacy_backfill_payment_row: "Legacy/backfill payment rows",
};

export default function RemediationCaseWorkspace({ cases = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Remediation Case Workspace</p>
      <div className="space-y-3">
        {Object.entries(LABELS).map(([type, label]) => {
          const rows = cases.filter((item) => item.caseType === type);
          return (
            <div key={type} className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="bg-white/[0.03] px-3 py-2 flex justify-between text-xs uppercase tracking-wider text-white/45"><span>{label}</span><span>{rows.length}</span></div>
              {rows.slice(0, 6).map((item) => (
                <div key={item.id} className="border-t border-white/[0.05] p-3">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-white">{item.recommendedAction}</p>
                      <p className="text-xs text-white/45 mt-1">Severity: {item.severity} · Confidence: {item.confidence} ({Math.round(item.confidenceScore || 0)}) · Exposure: ${Number(item.estimatedExposure || 0).toLocaleString()}</p>
                      <p className="text-xs text-white/35 mt-1">Status: {item.approvalStatus} · Reviewer: {item.reviewer} · Approver: {item.approver}</p>
                    </div>
                    <div className="text-xs text-right text-primary font-bold">Draft only</div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mt-3 text-xs">
                    {Object.entries(item.stagedActions?.[0]?.financialDeltaLock || {}).map(([key, value]) => <div key={key} className="rounded-lg bg-white/[0.04] p-2"><p className="text-white/35">{key.replaceAll("projected", "").replaceAll("Delta", " delta")}</p><p className="text-white/70">{value}</p></div>)}
                  </div>
                  {item.blockers?.length > 0 && <p className="text-xs text-red-300 mt-2">Locked: {item.blockers.slice(0, 4).join("; ")}</p>}
                  <p className="text-xs text-white/35 mt-2">Audit: {item.auditTimeline.map((event) => event.event).join(" → ")}</p>
                </div>
              ))}
              {rows.length === 0 && <div className="px-3 py-6 text-center text-white/35 text-sm">No draft cases staged.</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}