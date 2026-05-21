import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Lock, DollarSign, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const HOLD_REASON_LABELS = {
  dispute:        { label: "Dispute",         color: "text-orange-400", bg: "bg-orange-500/20 border-orange-500/30" },
  chargeback:     { label: "Chargeback",      color: "text-red-400",    bg: "bg-red-500/20 border-red-500/30" },
  compliance:     { label: "Compliance",      color: "text-yellow-400", bg: "bg-yellow-500/20 border-yellow-500/30" },
  admin_override: { label: "Admin Override",  color: "text-purple-400", bg: "bg-purple-500/20 border-purple-500/30" },
  reserve_window: { label: "Reserve Window",  color: "text-blue-400",   bg: "bg-blue-500/20 border-blue-500/30" },
  "":             { label: "On Hold",         color: "text-muted-foreground", bg: "bg-muted/30 border-border" },
};

export default function PayoutHoldsTab() {
  const queryClient = useQueryClient();
  const [releasing, setReleasing] = useState(null);

  const { data: payouts = [], isLoading, refetch } = useQuery({
    queryKey: ["payout-holds"],
    queryFn: () => base44.entities.HostPayout.filter({ status: "held" }),
    staleTime: 30_000,
  });

  const totalHeld = payouts.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);

  const handleRelease = async (payout) => {
    setReleasing(payout.id);
    try {
      await base44.entities.HostPayout.update(payout.id, {
        status: "released",
        released_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries(["payout-holds"]);
    } finally {
      setReleasing(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Payout Holds</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Host payouts currently blocked from disbursement.</p>
        </div>
        <button onClick={refetch} className="h-8 w-8 rounded-xl bg-muted/40 border border-border flex items-center justify-center hover:bg-muted/60">
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-xl p-3 text-center border border-orange-500/20">
          <p className="text-2xl font-black text-orange-400">{payouts.length}</p>
          <p className="text-[10px] text-muted-foreground font-semibold">Holds Active</p>
        </div>
        <div className="glass rounded-xl p-3 text-center border border-red-500/20">
          <p className="text-xl font-black text-red-400">${totalHeld.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground font-semibold">Total Held</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : payouts.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl">
          <CheckCircle2 className="h-10 w-10 text-emerald-400/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No payout holds active</p>
          <p className="text-xs text-muted-foreground/60 mt-1">All host payouts are processing normally</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payouts.map(payout => {
            const reason = HOLD_REASON_LABELS[payout.hold_reason || ""] || HOLD_REASON_LABELS[""];
            const isOverdue = payout.release_after && new Date(payout.release_after) < new Date();
            return (
              <div key={payout.id} className="glass rounded-xl p-4 border border-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${reason.bg} ${reason.color}`}>
                        {reason.label}
                      </span>
                      {isOverdue && (
                        <span className="text-[10px] font-bold text-red-400 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Release date passed
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-foreground truncate">{payout.host_name || payout.host_email}</p>
                    <p className="text-xs text-muted-foreground">{payout.vehicle_name || "—"}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <p className="text-sm font-black text-primary">${(payout.net_host_payout || payout.net_payout || 0).toLocaleString()}</p>
                      {payout.held_at && (
                        <p className="text-[10px] text-muted-foreground">
                          Held {formatDistanceToNow(new Date(payout.held_at), { addSuffix: true })}
                        </p>
                      )}
                      {payout.release_after && (
                        <p className={`text-[10px] font-semibold ${isOverdue ? "text-red-400" : "text-muted-foreground"}`}>
                          Release: {format(new Date(payout.release_after), "MMM d, yyyy")}
                        </p>
                      )}
                    </div>
                    {payout.hold_notes && (
                      <p className="text-[10px] text-muted-foreground/70 mt-1 italic">{payout.hold_notes}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleRelease(payout)}
                      disabled={releasing === payout.id}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-50 transition-all"
                      style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
                    >
                      {releasing === payout.id ? "..." : "Release"}
                    </button>
                    {payout.booking_request_id && (
                      <a href={`/bookings-admin?search=${payout.booking_request_id}`}
                        className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-1 text-center">
                        <ExternalLink className="h-2.5 w-2.5" /> Booking
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}