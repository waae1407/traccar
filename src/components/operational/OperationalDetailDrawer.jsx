import React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OperationalDetailDrawer({ mode = "host", open, onClose, title = "Details", subtitle, record, fields = [], actions, children }) {
  if (!open) return null;
  const isAdmin = mode === "admin";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close details" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className={cn("relative h-full w-full max-w-md overflow-y-auto border-l p-5 shadow-2xl", isAdmin ? "border-white/[0.08] bg-background text-white" : "border-gray-200 bg-white text-gray-900")}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-syne text-xl font-black tracking-tight">{title}</h2>
            {subtitle && <p className={cn("mt-1 text-xs", isAdmin ? "text-white/40" : "text-gray-400")}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className={cn("rounded-xl p-2 transition-colors", isAdmin ? "text-white/45 hover:bg-white/[0.06] hover:text-white" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700")}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {actions && <div className="mb-5 flex flex-wrap gap-2">{actions}</div>}

        {children || (
          <div className="space-y-3">
            {fields.map((field) => {
              const value = field.render ? field.render(record || {}) : record?.[field.key];
              return (
                <div key={field.key} className={cn("rounded-2xl border p-3", isAdmin ? "border-white/[0.08] bg-white/[0.04]" : "border-gray-100 bg-gray-50")}>
                  <p className={cn("text-[10px] font-bold uppercase tracking-wider", isAdmin ? "text-white/35" : "text-gray-400")}>{field.label}</p>
                  <p className={cn("mt-1 text-sm font-semibold break-words", isAdmin ? "text-white" : "text-gray-900")}>{value || "—"}</p>
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}