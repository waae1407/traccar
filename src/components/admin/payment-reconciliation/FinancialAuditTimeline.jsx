import React from "react";

export default function FinancialAuditTimeline({ events = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Read-only Financial Audit Timeline</p>
      <div className="space-y-2 max-h-72 overflow-auto">
        {events.slice(0, 30).map((event) => (
          <div key={event.id} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">{event.label}</p>
              <p className="text-xs text-white/35 whitespace-nowrap">{String(event.timestamp).slice(0, 19).replace('T', ' ')}</p>
            </div>
            <p className="text-xs text-primary/80 mt-1">{event.type} · {event.entityType} · {event.entityId}</p>
            <p className="text-xs text-white/45 mt-1">{event.details}</p>
          </div>
        ))}
        {events.length === 0 && <p className="text-center text-white/40 py-8">No audit events found.</p>}
      </div>
    </div>
  );
}