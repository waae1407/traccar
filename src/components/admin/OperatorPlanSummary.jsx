import React from "react";
import { OPERATIONAL_MODES } from "@/lib/operatorRecommendation";

const fmtMode = (mode) => mode ? (OPERATIONAL_MODES[mode]?.label || mode.replace(/_/g, " ")) : "—";
const fmtPct = (value) => `${Math.round(Number(value || 0) * 100)}%`;
const yesNo = (value) => value ? "Enabled" : "Off";

export default function OperatorPlanSummary({ plan, dealerMembership }) {
  if (!plan && !dealerMembership) {
    return (
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-xs text-white/40">
        No operator plan configuration yet.
      </div>
    );
  }

  const items = [
    ["Recommended Mode", fmtMode(plan?.recommended_mode)],
    ["Selected Mode", fmtMode(plan?.selected_mode)],
    ["Active Mode", fmtMode(plan?.active_mode)],
    ["Status", plan?.status || "—"],
    ["Monthly Fee", `$${Number(plan?.monthly_subscription_amount || 0).toFixed(2)}`],
    ["Marketplace Fee", fmtPct(plan?.marketplace_fee_rate)],
    ["Dealer Network", dealerMembership?.membership_status || plan?.dealer_network_membership_status || "—"],
    ["Contactless", yesNo(plan?.contactless_enabled)],
    ["Custom Domain", yesNo(plan?.custom_domain_enabled)],
    ["Last Updated", plan?.last_updated_at ? new Date(plan.last_updated_at).toLocaleDateString() : "—"],
  ];

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
      <p className="text-sm font-bold text-white mb-3">Operator Plan Configuration</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {items.map(([label, value]) => (
          <div key={label}>
            <p className="text-[10px] uppercase tracking-wider text-white/30">{label}</p>
            <p className="text-xs text-white/80 mt-1 capitalize">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}