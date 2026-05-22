import React from "react";

const colorMap = {
  trusted: "bg-green-500/15 border-green-500/30 text-green-200",
  partially_trusted: "bg-yellow-500/15 border-yellow-500/30 text-yellow-100",
  unresolved: "bg-orange-500/15 border-orange-500/30 text-orange-100",
  blocked: "bg-red-500/15 border-red-500/30 text-red-100",
};

export default function ProductionReadinessHeatmap({ heatmap = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Operational Readiness</p>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {heatmap.map((item) => (
          <div key={item.area} className={`rounded-xl border p-3 ${colorMap[item.status] || colorMap.unresolved}`}>
            <p className="font-bold">{item.area}</p>
            <p className="text-sm mt-1 capitalize">{String(item.status).replaceAll("_", " ")}</p>
            <p className="text-xs opacity-70 mt-2">{item.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}