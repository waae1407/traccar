import React from "react";
import ReputationScoreCard from "./ReputationScoreCard";

export default function AdminHostReputationPanel({ summary }) {
  if (!summary) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
        <p className="text-xs font-bold text-white/60 uppercase tracking-wider">Internal Reputation</p>
        <p className="text-xs text-white/35 mt-1">No reputation summary calculated yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-white/60 uppercase tracking-wider">Internal Reputation</p>
          <p className="text-[10px] text-white/35 mt-0.5">Admin-only trust foundation, not customer-facing.</p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full bg-white/[0.06] text-white/45 border border-white/[0.08] capitalize">
          {summary.admin_risk_level || "low"} risk
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <ReputationScoreCard title="Host Trust" score={summary.host_trust_score} />
        <ReputationScoreCard title="Fleet" score={summary.fleet_reliability_score} />
        <ReputationScoreCard title="Compliance" score={summary.compliance_consistency_score} />
        <ReputationScoreCard title="Dispute Risk" score={summary.dispute_adjusted_risk_score} />
      </div>
      {summary.coaching_signals?.length > 0 && (
        <div className="space-y-1">
          {summary.coaching_signals.slice(0, 3).map((signal, index) => (
            <p key={index} className="text-[10px] text-white/45">• {signal}</p>
          ))}
        </div>
      )}
    </div>
  );
}