import React from "react";

function avg(items, field) {
  const values = items.map((i) => Number(i[field] || 0)).filter((v) => Number.isFinite(v));
  if (!values.length) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export default function AdoptionMonitoringPanel({ signalSnapshots = [] }) {
  const latestByEntity = Object.values(signalSnapshots.reduce((acc, s) => {
    const key = `${s.entity_type}:${s.entity_id}`;
    if (!acc[key] || new Date(s.created_date) > new Date(acc[key].created_date)) acc[key] = s;
    return acc;
  }, {}));

  const metrics = [
    { label: "Evidence coverage", value: `${avg(latestByEntity, "evidence_coverage_pct")}%` },
    { label: "Review participation", value: `${avg(latestByEntity, "verified_review_count")}` },
    { label: "Inspection completion", value: `${avg(latestByEntity, "inspection_completeness_pct")}%` },
    { label: "Maintenance evidence", value: `${avg(latestByEntity, "verified_maintenance_count")}` },
    { label: "Communication coverage", value: `${avg(latestByEntity, "communication_threads_count")}` },
    { label: "Low/insufficient", value: latestByEntity.filter((s) => ["low", "insufficient_evidence"].includes(s.confidence_level)).length },
  ];

  return (
    <div className="glass rounded-2xl p-4 border border-white/[0.08]">
      <h3 className="text-sm font-bold text-white mb-3">Operational adoption monitoring</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <p className="text-xl font-black text-white font-syne">{metric.value}</p>
            <p className="text-[10px] text-white/40 mt-1">{metric.label}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-white/35 mt-3">Internal only — these adoption metrics do not affect marketplace ranking, public labels, suppression, bookings, payments, payouts, or Stripe.</p>
    </div>
  );
}