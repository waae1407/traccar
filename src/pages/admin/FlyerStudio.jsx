import React from "react";
import Flyer from "@/components/marketing/flyer/Flyer";
import FeatureAuditPanel from "@/components/marketing/flyer/FeatureAuditPanel";
import FlyerDownloadButton from "@/components/marketing/flyer/FlyerDownloadButton";
import { FLYER_PRESETS, REFERENCE_PRESET } from "@/lib/marketing/flyerPresets";
import { FLYER_W, FLYER_H } from "@/lib/marketing/flyerAssets";

export default function FlyerStudio() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-syne text-2xl font-bold">Flyer Studio</h1>
          <span className="rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
            Phase 1 · Review only
          </span>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          California Edition master at {FLYER_W} × {FLYER_H}. The landscape, all-white uRide logo,
          type treatment, magenta wedges, phone position and footer are locked. Feature name,
          headline, description, phone screen, benefit icons and CTA are data. Nothing is
          published or scheduled.
        </p>
      </header>

      <FeatureAuditPanel />

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-syne text-lg font-bold">Five sample flyers</h2>
          <p className="text-xs text-muted-foreground">
            Phone screens are live app UI with sanitized sample data.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {FLYER_PRESETS.map((preset) => (
            <article
              key={preset.id}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <Flyer preset={preset} stageId={`flyer-${preset.id}`} />
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="font-syne text-sm font-bold leading-tight">{preset.feature}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{preset.kicker}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                    DM “{preset.cta}”
                  </span>
                  <FlyerDownloadButton
                    stageId={`flyer-${preset.id}`}
                    fileName={`uride-flyer-${preset.id}.png`}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="font-syne text-lg font-bold">Master reference</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            The template's own TOAST preset, rendered through the same component with no screen
            override. Compare it against the approved artwork to confirm the rebuild matches
            layer for layer.
          </p>
        </div>
        <div className="max-w-md">
          <div className="overflow-hidden rounded-2xl border border-border">
            <Flyer preset={REFERENCE_PRESET} />
          </div>
        </div>
      </section>
    </div>
  );
}