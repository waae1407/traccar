import React from "react";
import { Download } from "lucide-react";
import { downloadCsv } from "@/lib/operational/sharedExportUtils";

export default function StabilizationExportPanel({ exports = {} }) {
  const entries = Object.entries(exports);
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Operational Exports</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {entries.map(([key, rows]) => (
          <button key={key} onClick={() => downloadCsv(rows || [], `${key}-${new Date().toISOString().slice(0, 10)}.csv`)} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-left hover:bg-white/[0.08] transition-colors">
            <Download className="h-4 w-4 text-primary mb-2" />
            <p className="font-semibold text-white capitalize">{key.replaceAll(/([A-Z])/g, " $1")}</p>
            <p className="text-xs text-white/40 mt-1">Export current report</p>
          </button>
        ))}
      </div>
    </div>
  );
}