import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function DiscoveryReviewPanel({ features, onChanged }) {
  const [busy, setBusy] = useState("");

  if (!features?.length) return null;

  const review = async (feature, decision) => {
    setBusy(feature.id);
    try {
      await base44.functions.invoke("marketingControl", {
        action: "review_feature",
        feature_id: feature.id,
        decision,
      });
      await onChanged?.();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="font-syne text-lg font-bold mb-1">Feature discoveries</h2>
      <p className="text-[11px] text-muted-foreground mb-3">
        Found in live telemetry and not yet verified. Nothing here can be marketed until you verify it against what the app
        actually does.
      </p>
      <div className="space-y-3">
        {features.map((feature) => (
          <div key={feature.id} className="rounded-xl border border-border/60 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{feature.label}</p>
              <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-400">
                unverified
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{feature.claim}</p>
            {feature.notes && <p className="text-[11px] text-muted-foreground/80 mt-1">{feature.notes}</p>}
            <div className="flex flex-wrap gap-2 mt-2">
              <Button size="sm" disabled={busy === feature.id} onClick={() => review(feature, "verify")}>
                Verify and enable
              </Button>
              <Button size="sm" variant="ghost" disabled={busy === feature.id} onClick={() => review(feature, "discard")}>
                Discard
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}