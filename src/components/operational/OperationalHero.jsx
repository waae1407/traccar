import React from "react";
import { cn } from "@/lib/utils";

const titleStyles = {
  host: "text-gray-950",
  admin: "text-white",
};

const subtitleStyles = {
  host: "text-gray-500",
  admin: "text-white/45",
};

export default function OperationalHero({ mode = "host", title, subtitle, eyebrow, actions, context, className }) {
  return (
    <section className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className={cn("font-syne text-2xl font-black tracking-tight sm:text-3xl", titleStyles[mode] || titleStyles.host)}>
          {title}
        </h1>
        {subtitle && <p className={cn("mt-1 max-w-3xl text-sm", subtitleStyles[mode] || subtitleStyles.host)}>{subtitle}</p>}
        {mode === "admin" && context && <p className="mt-2 text-xs font-medium text-white/30">{context}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
    </section>
  );
}