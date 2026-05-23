import React from "react";
import ReputationScoreCard from "./ReputationScoreCard";

export default function AdminVehicleReputationPanel({ summaries = [] }) {
  if (!summaries.length) {
    return (
      <div className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <p className="text-sm font-bold text-white/70">Internal Vehicle Quality</p>
        <p className="text-xs text-white/35 mt-1">No vehicle reputation summaries calculated yet.</p>
      </div>
    );
  }

  const avg = (key) => Math.round(summaries.reduce((sum, item) => sum + (item[key] || 0), 0) / summaries.length);

  return (
    <div className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-white/70">Internal Vehicle Quality</p>
        <p className="text-xs text-white/35 mt-1">Admin-only foundation; not used for public ranking yet.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <ReputationScoreCard title="Quality" score={avg("vehicle_quality_score")} />
        <ReputationScoreCard title="Maintenance" score={avg("maintenance_confidence_score")} />
        <ReputationScoreCard title="Cleanliness" score={avg("cleanliness_score")} />
        <ReputationScoreCard title="Compliance" score={avg("compliance_consistency_score")} />
        <ReputationScoreCard title="Dispute Risk" score={avg("dispute_adjusted_risk_score")} />
      </div>
    </div>
  );
}