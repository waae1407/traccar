import React from "react";
import { ShieldCheck } from "lucide-react";
import { PUBLIC_TRUST_LABELS } from "@/lib/reputation/publicTrust";

export default function PublicTrustBadges({ labels = [], compact = false }) {
  if (!labels.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.slice(0, compact ? 2 : 6).map((label) => (
        <span key={label} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
          <ShieldCheck className="h-3 w-3" />
          {PUBLIC_TRUST_LABELS[label] || label.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}