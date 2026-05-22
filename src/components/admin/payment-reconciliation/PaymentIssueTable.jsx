import React from "react";

function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentIssueTable({ rows = [] }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-card/80">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] border-b border-white/[0.06]">
            <tr>
              {['Severity','Confidence','Customer','Booking','Expected','Collected','Issues','Date'].map((heading) => (
                <th key={heading} className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-white/40">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-white/[0.04] last:border-0 hover:bg-primary/[0.04]">
                <td className="px-4 py-3"><span className={row.severity === 'critical' ? 'text-red-400 font-bold' : 'text-yellow-400 font-bold'}>{row.severity}</span></td>
                <td className="px-4 py-3 text-white/70 capitalize">{String(row.confidence || '').replaceAll('_', ' ')}</td>
                <td className="px-4 py-3 text-white/80">
                  <div>{row.payment?.customer_name || row.booking?.customer_full_name || '—'}</div>
                  <div className="text-xs text-white/35">{row.payment?.customer_email || row.booking?.user_email || ''}</div>
                </td>
                <td className="px-4 py-3 text-white/60 font-mono text-xs">{row.payment?.booking_request_id || row.booking?.id || row.payout?.booking_request_id || '—'}</td>
                <td className="px-4 py-3 text-white/70">{money(row.expectedAmount)}</td>
                <td className="px-4 py-3 text-white/70">{money(row.collectedAmount)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 max-w-lg">
                    {row.issueTypes.map((issue) => <span key={issue} className="px-2 py-0.5 rounded-full bg-white/[0.06] text-white/55 text-[10px]">{issue.replaceAll('_', ' ')}</span>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-white/45 whitespace-nowrap">{row.paidDate ? String(row.paidDate).slice(0, 10) : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-white/40">No reconciliation issues match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}