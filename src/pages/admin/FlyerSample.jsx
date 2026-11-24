import React from "react";
import Flyer from "@/components/marketing/flyer/Flyer";
import { FLYER_PRESETS } from "@/lib/marketing/flyerPresets";

const SAMPLE = FLYER_PRESETS.find((preset) => preset.id === "ai-inspection");

export default function FlyerSample() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background px-4 py-3">
      <header className="mx-auto flex w-full max-w-[1199px] shrink-0 items-baseline gap-3 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
          Sample 5 of 5
        </p>
        <h1 className="font-syne text-base font-bold">AI Inspection</h1>
        <p className="text-xs text-muted-foreground">
          Whole flyer on one screen · native 1199 × 1312 artboard
        </p>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Flyer preset={SAMPLE} fitHeight className="shadow-2xl" />
      </div>
    </div>
  );
}