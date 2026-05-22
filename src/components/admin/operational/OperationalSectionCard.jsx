import React from "react";

export default function OperationalSectionCard({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`rounded-3xl border border-white/[0.08] bg-white/[0.04] shadow-card overflow-hidden ${className}`}>
      {(title || subtitle || action) && (
        <div className="px-4 sm:px-5 py-4 border-b border-white/[0.06] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h3 className="font-bold text-white text-sm">{title}</h3>}
            {subtitle && <p className="text-xs text-white/35 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}