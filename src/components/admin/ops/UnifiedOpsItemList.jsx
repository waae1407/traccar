import React from "react";
import { AlertTriangle, Bell, Activity, ShieldCheck, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const icons = { needs: AlertTriangle, notifications: Bell, events: Activity, audit: ShieldCheck };
const severityClasses = {
  critical: "border-red-500/40 bg-red-500/10 text-red-200",
  high: "border-orange-500/35 bg-orange-500/10 text-orange-200",
  medium: "border-yellow-500/30 bg-yellow-500/10 text-yellow-100",
  low: "border-blue-500/30 bg-blue-500/10 text-blue-100",
  info: "border-white/10 bg-white/5 text-white/70",
};

export default function UnifiedOpsItemList({ title, subtitle, items, variant = "events", onSelect, limit }) {
  const Icon = icons[variant] || Activity;
  const visible = limit ? items.slice(0, limit) : items;
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <div>
            <p className="font-black text-white">{title}</p>
            {subtitle && <p className="text-xs text-white/40">{subtitle}</p>}
          </div>
        </div>
        <span className="rounded-full border border-white/10 px-2 py-1 text-xs font-bold text-white/50">{items.length}</span>
      </div>
      {visible.length === 0 ? (
        <div className="p-8 text-center text-sm text-white/35">Nothing to show.</div>
      ) : (
        <div className="divide-y divide-white/10">
          {visible.map(item => (
            <button key={`${item.entityName}-${item.id}-${item.dedupeKey}`} onClick={() => onSelect?.(item)} className="w-full p-4 text-left transition hover:bg-white/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${severityClasses[item.severity] || severityClasses.info}`}>{item.severity}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-white/50">{item.domain?.replace(/_/g, " ")}</span>
                    <span className="text-[10px] text-white/35">{item.kind}</span>
                    {item.repeatCount > 1 && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-200">x{item.repeatCount}</span>}
                  </div>
                  <p className="truncate font-bold text-white">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-white/45">{item.message}</p>
                  <p className="mt-2 text-[11px] text-white/30">{item.status || "event"} · {item.createdAt ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true }) : "recent"}</p>
                </div>
                <ChevronRight className="mt-2 h-4 w-4 flex-shrink-0 text-white/25" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}