import React from "react";
import Flyer from "@/components/marketing/flyer/Flyer";
import { FLYER_PRESETS } from "@/lib/marketing/flyerPresets";

const SAMPLE = FLYER_PRESETS.find((preset) => preset.id === "ai-inspection");

const ROWS = [
  ["Feature", SAMPLE.feature],
  ["Kicker", SAMPLE.kicker],
  ["Headline", SAMPLE.headline.split("\n").join(" ")],
  ["Body", SAMPLE.copy.split("\n").join(" ")],
  ["Benefits", SAMPLE.benefits.map((benefit) => benefit.label).join(" · ")],
  ["CTA", `DM “${SAMPLE.cta}”`],
];

export default function FlyerSample() {
  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1199px] space-y-5">
        <header className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            Sample 5 of 5 · finished flyer
          </p>
          <h1 className="font-syne text-2xl font-bold">AI Inspection</h1>
          <p className="text-sm text-muted-foreground">
            Native 1199 × 1312 artboard, nothing else on the page, so every detail can be
            inspected.
          </p>
        </header>

        <div className="overflow-hidden rounded-2xl border border-border">
          <Flyer preset={SAMPLE} />
        </div>

        <dl className="grid gap-x-8 gap-y-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          {ROWS.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-0.5 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}