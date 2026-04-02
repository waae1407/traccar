import React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export default function DataTable({ columns, data, isLoading, onRowClick, emptyMessage }) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/[0.07] overflow-hidden" style={{ background: "hsl(222 24% 11% / 0.8)" }}>
        <div className="p-4 space-y-2">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] p-12 text-center" style={{ background: "hsl(222 24% 11% / 0.8)" }}>
        <p className="text-white/30 text-sm">{emptyMessage || "No records found"}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] overflow-hidden" style={{ boxShadow: "0 4px 32px hsl(222 28% 5% / 0.5)", background: "hsl(222 24% 10% / 0.9)" }}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]" style={{ background: "hsl(222 28% 8% / 0.8)" }}>
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-white/35">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr
                key={row.id || idx}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-b border-white/[0.04] last:border-0 transition-all duration-150",
                  onRowClick && "cursor-pointer hover:bg-primary/[0.05]"
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3.5 text-sm text-white/70">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}