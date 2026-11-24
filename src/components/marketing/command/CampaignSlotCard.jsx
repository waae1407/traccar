import React from "react";
import { base44 } from "@/api/base44Client";
import Flyer from "@/components/marketing/flyer/Flyer";
import { campaignToPreset } from "@/lib/marketing/marketingEngine";
import { Badge } from "@/components/ui/badge";
import PrepareAssetsButton from "./PrepareAssetsButton";

const QUALITY_STYLE = {
  quality_check_failed: "bg-red-500/15 text-red-400 border-red-500/30",
  awaiting_approval: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  published: "bg-green-500/15 text-green-400 border-green-500/30",
};

export default function CampaignSlotCard({ title, campaign, subtitle, onChanged }) {
  if (!campaign) {
    return (
      <div className="glass rounded-2xl p-5">
        <h2 className="font-syne text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-2">Nothing generated for this slot yet.</p>
        <button
          type="button"
          className="text-xs text-primary mt-3 underline"
          onClick={() => base44.functions.invoke("marketingGenerateCampaign", { force: true }).then(onChanged)}
        >
          Generate now
        </button>
      </div>
    );
  }

  const report = campaign.quality_report || {};
  const preset = campaignToPreset(campaign);

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-syne text-lg font-bold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle || campaign.campaign_date}</p>
        </div>
        <Badge variant="outline" className={`text-[10px] ${QUALITY_STYLE[campaign.publish_status] || "border-border text-muted-foreground"}`}>
          {String(campaign.publish_status || "draft").replace(/_/g, " ")}
        </Badge>
      </div>

      <div className="flex gap-4">
        <div className="w-28 shrink-0 rounded-lg overflow-hidden">
          <Flyer preset={preset} />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-primary">{campaign.feature_label}</p>
          <p className="text-sm font-semibold mt-1">{String(campaign.headline).replace(/\n/g, " ")}</p>
          <p className="text-xs text-muted-foreground mt-1">{campaign.angle_label}</p>
          <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{campaign.description}</p>
          {(report.critical || []).length > 0 && (
            <p className="text-[11px] text-red-400 mt-2">Blocked: {report.critical.join("; ")}</p>
          )}
          {(report.warnings || []).length > 0 && (
            <p className="text-[11px] text-yellow-400 mt-2">Note: {report.warnings.join("; ")}</p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <PrepareAssetsButton campaign={campaign} onDone={onChanged} />
      </div>
    </div>
  );
}