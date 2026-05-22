import React from "react";
import { Lock } from "lucide-react";

export default function RemediationSafetyBanner({ banners = [] }) {
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
      <div className="flex items-start gap-3">
        <Lock className="h-5 w-5 text-primary mt-0.5" />
        <div>
          <p className="font-bold text-white">Controlled manual remediation workspace locked</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {banners.map((banner) => <span key={banner} className="rounded-full bg-white/[0.06] border border-white/[0.08] px-3 py-1 text-xs text-white/70">{banner}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}