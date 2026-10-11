import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { format } from "date-fns";

const fmtCurrency = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return "—"; }
};

const STATUS_COLORS = {
  paid: "text-emerald-500 bg-emerald-500/10",
  pending: "text-yellow-500 bg-yellow-500/10",
  processing: "text-blue-500 bg-blue-500/10",
  failed: "text-red-500 bg-red-500/10",
  failed_requires_manual_review: "text-red-500 bg-red-500/10",
  on_hold: "text-orange-500 bg-orange-500/10",
  held: "text-orange-500 bg-orange-500/10",
  voided_duplicate: "text-gray-400 bg-gray-500/10",
  active: "text-emerald-500 bg-emerald-500/10",
  cancelled: "text-red-500 bg-red-500/10",
  Available: "text-emerald-500 bg-emerald-500/10",
  Booked: "text-blue-500 bg-blue-500/10",
  "Active Rental": "text-emerald-500 bg-emerald-500/10",
  unpaid: "text-red-500 bg-red-500/10",
  overdue: "text-red-500 bg-red-500/10",
};

export default function PnLDetailSheet({ open, onOpenChange, title, subtitle, mode = "host", columns = [], rows = [], summary, emptyMessage = "No records found." }) {
  const isDark = mode === "admin";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={`w-full sm:max-w-lg overflow-y-auto p-0 ${isDark ? "" : ""}`}>
        <SheetHeader className={`px-5 pt-6 pb-3 ${isDark ? "bg-card/50" : "bg-gray-50"}`}>
          <SheetTitle className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{title}</SheetTitle>
          {subtitle && <SheetDescription className={isDark ? "text-white/40" : "text-gray-400"}>{subtitle}</SheetDescription>}
        </SheetHeader>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-5 text-center">
            <p className={`text-sm ${isDark ? "text-white/30" : "text-gray-400"}`}>{emptyMessage}</p>
          </div>
        ) : (
          <div className="px-3 py-3 space-y-2">
            {rows.map((row, i) => (
              <div
                key={row._id || i}
                className={`rounded-2xl border p-3 ${isDark ? "bg-white/[0.03] border-white/[0.06]" : "bg-white border-gray-100"}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    {columns.map((col) => {
                      if (col.type === "status") {
                        const val = row[col.key];
                        const colorClass = STATUS_COLORS[val] || "text-gray-400 bg-gray-500/10";
                        return (
                          <span key={col.key} className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${colorClass}`}>
                            {String(val || "—").replace(/_/g, " ")}
                          </span>
                        );
                      }
                      if (col.type === "currency") {
                        return (
                          <div key={col.key} className="flex items-center justify-between gap-2">
                            <span className={`text-[11px] ${isDark ? "text-white/35" : "text-gray-400"}`}>{col.label}</span>
                            <span className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{fmtCurrency(row[col.key])}</span>
                          </div>
                        );
                      }
                      if (col.type === "date") {
                        return (
                          <div key={col.key} className="flex items-center justify-between gap-2">
                            <span className={`text-[11px] ${isDark ? "text-white/35" : "text-gray-400"}`}>{col.label}</span>
                            <span className={`text-xs ${isDark ? "text-white/60" : "text-gray-600"}`}>{fmtDate(row[col.key])}</span>
                          </div>
                        );
                      }
                      // default: text
                      return (
                        <div key={col.key} className="flex items-center justify-between gap-2">
                          <span className={`text-[11px] ${isDark ? "text-white/35" : "text-gray-400"}`}>{col.label}</span>
                          <span className={`text-xs ${isDark ? "text-white/70" : "text-gray-700"} truncate`}>{String(row[col.key] ?? "—")}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            {summary && (
              <div className={`mt-3 rounded-2xl border p-4 ${isDark ? "bg-primary/[0.06] border-primary/20" : "bg-pink-50 border-pink-100"}`}>
                <div className="space-y-1.5">
                  {summary.map((s, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className={`text-xs ${isDark ? "text-white/50" : "text-gray-500"}`}>{s.label}</span>
                      <span className={`text-sm font-bold ${s.color || (isDark ? "text-white" : "text-gray-900")}`}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}