import React from "react";

const LAUNCH_SUMMARY_BULLETS = [
  "Live immediately",
  "Customers can find you now",
  "Add vehicles anytime",
  "Connect Stripe & GPS later",
];

export default function SelectedSetupSummaryCard({ className = "mt-6 rounded-2xl bg-white/10 border border-white/10 p-4 space-y-3" }) {
  return (
    <div className={className}>
      <div>
        <p className="text-[11px] text-white/40 uppercase font-black tracking-wider">🚀 YOUR BUSINESS IS OPEN</p>
      </div>
      <div className="space-y-2 text-sm">
        {LAUNCH_SUMMARY_BULLETS.map((bullet) => (
          <p key={bullet} className="text-white/70 flex items-center gap-2"><span>✓</span> {bullet}</p>
        ))}
      </div>
      <p className="text-xs text-white/40 border-t border-white/10 pt-3">Start simple. Grow at your own pace.</p>
    </div>
  );
}