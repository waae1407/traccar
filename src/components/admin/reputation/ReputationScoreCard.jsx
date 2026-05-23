import React from "react";

function getTone(score = 0) {
  if (score >= 80) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (score >= 60) return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
  return "text-red-400 bg-red-500/10 border-red-500/20";
}

export default function ReputationScoreCard({ title, score, subtitle }) {
  return (
    <div className={`rounded-xl border p-3 ${getTone(score)}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{title}</p>
      <p className="text-2xl font-black mt-1" style={{ fontFamily: "var(--font-syne)" }}>{Math.round(score || 0)}</p>
      {subtitle && <p className="text-[10px] opacity-70 mt-0.5">{subtitle}</p>}
    </div>
  );
}