import React from "react";

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function ExposureReportingPanel({ exposure = {}, escalations = [] }) {
  const cards = Object.entries(exposure).map(([key, value]) => [key.replace(/([A-Z])/g, " $1"), money(value)]);
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Final Financial Exposure and Escalation</p>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-7 gap-3">
        {cards.map(([label, value]) => <div key={label} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="text-lg font-black text-white mt-1">{value}</p></div>)}
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {escalations.map((item) => <span key={item.level} className="rounded-full bg-white/[0.06] border border-white/[0.08] px-3 py-1 text-xs text-white/70 capitalize">{item.level}: {item.count}</span>)}
      </div>
    </div>
  );
}