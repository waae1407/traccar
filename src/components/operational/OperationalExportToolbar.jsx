import React from "react";
import { Download, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OperationalExportToolbar({ mode = "host", exports = [], syncAction, actions, align = "end", className }) {
  const buttonClass = mode === "admin"
    ? "border-white/[0.1] bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white"
    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900";

  return (
    <div className={cn("flex flex-wrap gap-2", align === "end" ? "justify-start sm:justify-end" : "justify-start", className)}>
      {exports.map((item) => (
        <button key={item.label} type="button" onClick={item.onClick} disabled={item.disabled} className={cn("inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold transition-all disabled:opacity-50", buttonClass)}>
          <Download className="h-3.5 w-3.5" /> {item.label}
        </button>
      ))}
      {syncAction && (
        <button type="button" onClick={syncAction.onClick} disabled={syncAction.disabled || syncAction.loading} className={cn("inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold transition-all disabled:opacity-50", buttonClass)}>
          <RefreshCw className={cn("h-3.5 w-3.5", syncAction.loading && "animate-spin")} /> {syncAction.loading ? syncAction.loadingLabel || "Updating…" : syncAction.label || "Sync"}
        </button>
      )}
      {actions}
    </div>
  );
}