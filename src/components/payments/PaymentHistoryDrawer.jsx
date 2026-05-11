import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { X, ExternalLink, DollarSign } from "lucide-react";

const METHOD_STYLE = {
  stripe: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  zelle: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  cash: "bg-green-500/15 text-green-400 border-green-500/25",
  cashapp: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  venmo: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  check: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  other: "bg-white/10 text-white/50 border-white/15",
};

export default function PaymentHistoryDrawer({ booking, onClose }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["payment-logs", booking.id],
    queryFn: () => base44.entities.PaymentLog.filter({ booking_request_id: booking.id }),
    enabled: !!booking.id,
  });

  const sorted = [...logs].sort((a, b) => (a.week_number || 0) - (b.week_number || 0));
  const total = sorted.filter(l => l.status === "paid").reduce((s, l) => s + (l.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full flex flex-col overflow-hidden z-10"
        style={{ background: "hsl(222 28% 9%)", borderLeft: "1px solid hsl(222 20% 18%)" }}>

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/[0.07]">
          <div>
            <h3 className="font-bold text-white text-base">{booking.customer_full_name}</h3>
            <p className="text-xs text-white/40 mt-0.5">{booking.vehicle_name}</p>
            <p className="text-xs text-emerald-400 font-semibold mt-1">${total.toLocaleString()} total collected</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-xl bg-white/[0.06] flex items-center justify-center hover:bg-white/10 transition-all">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        {/* Log list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading ? (
            [1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.05] animate-pulse" />)
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <DollarSign className="h-8 w-8 text-white/20 mb-3" />
              <p className="text-white/40 text-sm">No payment history yet</p>
              <p className="text-white/25 text-xs mt-1">Payments will appear here as they are processed</p>
            </div>
          ) : (
            sorted.map((log) => {
              const methodCls = METHOD_STYLE[log.payment_method] || METHOD_STYLE.other;
              return (
                <div key={log.id} className="rounded-xl border border-white/[0.07] p-4"
                  style={{ background: "hsl(222 24% 12% / 0.8)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white/50">Week {log.week_number}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${methodCls}`}>
                        {log.payment_method}
                      </span>
                      {log.status === "refunded" && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-purple-500/15 text-purple-400 border-purple-500/25">refunded</span>
                      )}
                    </div>
                    <span className="text-sm font-bold text-white">${(log.amount || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white/30">
                      {log.paid_at ? format(new Date(log.paid_at), "MMM d, yyyy · h:mm a") : "—"}
                      {log.recorded_by && log.recorded_by !== "autopay" ? ` · by ${log.recorded_by}` : ""}
                    </p>
                    {log.receipt_url && (
                      <a href={log.receipt_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors">
                        <ExternalLink className="h-3 w-3" /> Receipt
                      </a>
                    )}
                  </div>
                  {log.notes && <p className="text-xs text-white/30 mt-1 italic">{log.notes}</p>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}