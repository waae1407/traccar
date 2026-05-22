import React from "react";
import { ShieldAlert } from "lucide-react";

export default function GlobalGovernanceBanner() {
  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4 flex items-start gap-3">
      <ShieldAlert className="h-5 w-5 text-primary mt-0.5" />
      <div>
        <p className="font-bold text-white">Governance / Simulation Only — No Financial Actions Executed</p>
        <p className="text-sm text-white/55">No payouts, Stripe transfers, booking/payment mutations, dispute resolutions, or remediation bundles execute from this workspace.</p>
      </div>
    </div>
  );
}