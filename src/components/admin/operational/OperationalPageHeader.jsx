import React from "react";

export default function OperationalPageHeader({ title, subtitle, action, eyebrow }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-primary mb-1">{eyebrow}</p>}
        <h1 className="font-syne text-2xl sm:text-3xl font-black text-white tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-white/45 mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2 sm:justify-end">{action}</div>}
    </div>
  );
}