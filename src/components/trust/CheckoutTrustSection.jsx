import React from "react";
import { ShieldCheck } from "lucide-react";
import PublicTrustBadges from "./PublicTrustBadges";

export default function CheckoutTrustSection({ labels = [] }) {
  if (!labels.length) return null;

  return (
    <div className="w-full rounded-2xl border border-emerald-100 bg-emerald-50 p-4 mb-4 text-left">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <p className="font-bold text-emerald-900 text-sm">Why this booking is trusted</p>
      </div>
      <PublicTrustBadges labels={labels} />
      <p className="text-xs text-emerald-700 mt-2">Shown only when verified operational evidence meets uRide thresholds.</p>
    </div>
  );
}