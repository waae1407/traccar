import React from "react";

function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function HistoricalPayoutBackfillPreview({ rows = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold">Historical Payout Backfill Preview</p>
          <p className="text-xs text-white/40 mt-1">Preview only — non-executable and no Stripe transfers.</p>
        </div>
        <span className="text-sm text-white/50">{rows.length} proposed rows</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03]">
            <tr>{["Source Payment", "Host", "Booking", "Week", "Gross", "Platform Fee", "Host Payout", "Confidence", "Safety", "Stripe Evidence"].map((h) => <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-white/40">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((row) => (
              <tr key={row.sourcePaymentId} className="border-t border-white/[0.05]">
                <td className="px-3 py-2 font-mono text-xs text-white/60">{row.sourcePaymentId}</td>
                <td className="px-3 py-2 text-white/70">{row.hostName || row.hostId || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-white/50">{row.bookingId}</td>
                <td className="px-3 py-2 text-white/60">{row.weekNumber || "—"}</td>
                <td className="px-3 py-2 text-white/70">{money(row.grossAmount)}</td>
                <td className="px-3 py-2 text-white/70">{money(row.estimatedPlatformFee)}</td>
                <td className="px-3 py-2 text-white/70">{money(row.estimatedHostPayout)}</td>
                <td className="px-3 py-2 text-white/60 capitalize">{String(row.confidence).replaceAll("_", " ")}</td>
                <td className="px-3 py-2 text-white/50 max-w-md">{row.safetyReason}</td>
                <td className="px-3 py-2 text-white/60">{row.hasStripeTransferEvidence ? "Yes" : "No"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-white/40">No payout backfill preview rows.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}