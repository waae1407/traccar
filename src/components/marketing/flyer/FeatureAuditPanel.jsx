import React from "react";
import { cn } from "@/lib/utils";
import { APP_FEATURE_AUDIT, AUDIT_STATUS } from "@/lib/marketing/appFeatureAudit";

export default function FeatureAuditPanel() {
  const counts = { live: 0, partial: 0, not_built: 0 };
  APP_FEATURE_AUDIT.forEach((f) => {
    counts[f.status] += 1;
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-syne text-lg font-bold">Application feature audit</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What is genuinely built and marketable today, and what must not be advertised yet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-emerald-400">
            {counts.live} live
          </span>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-amber-400">
            {counts.partial} limited
          </span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-white/45">
            {counts.not_built} not built
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {APP_FEATURE_AUDIT.map((feature) => (
          <div
            key={feature.name}
            className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-3"
          >
            <span
              className={cn(
                "mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                AUDIT_STATUS[feature.status].className
              )}
            >
              {AUDIT_STATUS[feature.status].label}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">{feature.name}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{feature.note}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}