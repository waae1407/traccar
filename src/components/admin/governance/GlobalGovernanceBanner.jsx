import React from "react";
import { ShieldAlert } from "lucide-react";

export default function GlobalGovernanceBanner() {
  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4 flex items-start gap-3">
      <ShieldAlert className="h-5 w-5 text-primary mt-0.5" />
      <div>
        <p className="font-bold text-white">LIVE GOVERNED STABILIZATION MODE — NO FINANCIAL EXECUTION</p>
        <p className="text-sm text-white/55">Reviewer operations, blocker cleanup, trusted data certification, export verification, and rollback validation are active; payouts, Stripe transfers, automatic corrections, and remediation execution remain locked.</p>
      </div>
    </div>
  );
}