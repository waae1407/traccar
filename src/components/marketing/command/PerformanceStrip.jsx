import React from "react";

const FIELDS = [
  { key: "reach", label: "Reach" },
  { key: "impressions", label: "Impressions" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "saves", label: "Saves" },
];

export default function PerformanceStrip({ metrics }) {
  const totals = FIELDS.reduce((acc, field) => {
    acc[field.key] = metrics.reduce((sum, item) => sum + (item[field.key] || 0), 0);
    return acc;
  }, {});

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-syne text-lg font-bold">Recent performance</h2>
        <span className="text-[11px] text-muted-foreground">{metrics.length} captured snapshots</span>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {FIELDS.map((field) => (
          <div key={field.key} className="rounded-xl border border-border/60 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{field.label}</p>
            <p className="text-lg font-bold mt-1">{totals[field.key] || "—"}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Only metrics the platforms actually return are counted. Blank fields mean the platform did not provide that number.
      </p>
    </div>
  );
}