import React from "react";

/**
 * Shared gradient hero header for all Host portal pages.
 * Mirrors the luxury feel of the customer-facing MyBookings header.
 */
export default function HostPageHeader({ title, subtitle, action }) {
  return (
    <div className="relative overflow-hidden rounded-3xl mb-6" style={{ background: "linear-gradient(160deg, #0f0c29 0%, #302b63 60%, #24243e 100%)" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 30% 50%, hsl(338 90% 56% / 0.25) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, hsl(265 80% 62% / 0.2) 0%, transparent 50%)" }} />
      <div className="relative z-10 px-6 pt-6 pb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white leading-tight" style={{ fontFamily: "var(--font-syne)" }}>{title}</h1>
          {subtitle && <p className="text-white/50 text-sm mt-1">{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {/* wave divider */}
      <div className="h-4">
        <svg viewBox="0 0 500 16" fill="#f8f8fa" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
          <path d="M0 16L500 16L500 6C400 14 250 1 0 10L0 16Z"/>
        </svg>
      </div>
    </div>
  );
}