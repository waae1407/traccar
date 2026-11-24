import React from "react";
import { ChevronRight } from "lucide-react";
import { headlineText } from "@/lib/marketing/marketingAngles";

const STATUS = {
  proposed: { label: "Proposed", className: "border-blue-500/30 bg-blue-500/15 text-blue-300" },
  approved: { label: "Approved", className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" },
  rejected: { label: "Rejected", className: "border-red-500/30 bg-red-500/15 text-red-300" },
};

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function CampaignCard({ campaign, onOpen }) {
  const status = STATUS[campaign.status] || STATUS.proposed;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
    >
      <div className="w-[74px] shrink-0">
        <p className="text-[11px] font-bold text-foreground">{formatDate(campaign.campaign_date)}</p>
        <p className="text-[10px] text-muted-foreground">Day {campaign.day_index}</p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[11px] font-bold uppercase tracking-wide text-primary">
            {campaign.feature_label}
          </span>
          <span className="hidden truncate text-[10px] text-muted-foreground sm:inline">
            {campaign.angle_label}
          </span>
        </div>
        <p className="truncate text-xs text-foreground/85">{headlineText(campaign.headline)}</p>
      </div>

      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${status.className}`}>
        {status.label}
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
    </button>
  );
}