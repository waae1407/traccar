import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Plus, RotateCcw, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import CreateReceivableDialog from "./CreateReceivableDialog";

const statusConfig = {
  open: { label: "Open", icon: AlertCircle, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  partially_paid: { label: "Partially Recovered", icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  paid: { label: "Fully Recovered", icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  partially_recovered: { label: "Partially Recovered", icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  recovered: { label: "Fully Recovered", icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  waived: { label: "Waived", icon: CheckCircle2, color: "text-white/40", bg: "bg-white/5 border-white/10" },
  disputed: { label: "Disputed", icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
};

export default function ReceivableManager({ hosts }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: receivables = [], isLoading } = useQuery({
    queryKey: ["admin-host-receivables"],
    queryFn: () => base44.entities.HostReceivable.list("-created_date", 200),
  });

  const openReceivables = receivables.filter((r) =>
    ["open", "partially_paid", "partially_recovered"].includes(r.status)
  );
  const totalOutstanding = openReceivables.reduce((s, r) => s + (r.remaining_amount || 0), 0);
  const totalRecovered = receivables.reduce((s, r) => s + (r.recovered_amount || 0), 0);

  const hostName = (id) => hosts.find((h) => h.id === id)?.full_name || "Unknown host";
  const hostEmail = (id) => hosts.find((h) => h.id === id)?.email || "";

  const waiveReceivable = async (receivable) => {
    if (!confirm(`Waive $${(receivable.remaining_amount || 0).toFixed(2)} receivable for ${hostName(receivable.host_id)}?`)) return;
    try {
      await base44.entities.HostReceivable.update(receivable.id, {
        status: "waived",
        resolved_at: new Date().toISOString(),
        resolved_by: "admin",
        resolution_method: "admin_waived",
        audit_log: [
          ...(receivable.audit_log || []),
          { action: "waived", amount: receivable.remaining_amount, changed_at: new Date().toISOString(), changed_by: "admin", note: "Admin waived remaining balance" },
        ],
      });
      qc.invalidateQueries({ queryKey: ["admin-host-receivables"] });
      toast({ title: "Receivable waived" });
    } catch (err) {
      toast({ title: "Failed to waive", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-5">
          <div>
            <p className="text-xs text-white/40">Outstanding Receivables</p>
            <p className="text-lg font-bold text-orange-400">${totalOutstanding.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-white/40">Open Count</p>
            <p className="text-lg font-bold text-white">{openReceivables.length}</p>
          </div>
          <div>
            <p className="text-xs text-white/40">Total Recovered (all-time)</p>
            <p className="text-lg font-bold text-green-400">${totalRecovered.toFixed(2)}</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-primary text-white">
          <Plus className="h-4 w-4" /> Create Receivable
        </Button>
      </div>

      {/* Receivables list */}
      <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold text-white/80">Host Receivables</p>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-white/40">Loading...</div>
        ) : receivables.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-white/40">No receivables. Create one to recover owed fees from future payouts.</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {receivables.map((r) => {
              const cfg = statusConfig[r.status] || statusConfig.open;
              const Icon = cfg.icon;
              const pct = r.original_amount > 0 ? Math.round(((r.recovered_amount || 0) / r.original_amount) * 100) : 0;
              return (
                <div key={r.id} className="px-4 py-3.5 hover:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{hostName(r.host_id)}</p>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
                          <Icon className="mr-1 inline h-2.5 w-2.5" />
                          {cfg.label}
                        </span>
                      </div>
                      <p className="truncate text-xs text-white/30">{hostEmail(r.host_id)}</p>
                      {r.description && <p className="mt-1 text-xs text-white/50 line-clamp-1">{r.description}</p>}
                      {r.offset_from_future_payouts && ["open", "partially_paid", "partially_recovered"].includes(r.status) && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-primary/70">
                          <RotateCcw className="h-3 w-3" /> Auto-offsetting from future payouts
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-white">${(r.remaining_amount || 0).toFixed(2)}</p>
                      <p className="text-xs text-white/30">of ${(r.original_amount || 0).toFixed(2)}</p>
                      {pct > 0 && (
                        <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full bg-green-500/60" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                  {["open", "partially_paid", "partially_recovered"].includes(r.status) && (
                    <div className="mt-2 flex justify-end">
                      <button onClick={() => waiveReceivable(r)} className="text-[11px] text-white/40 hover:text-white/70">
                        Waive remaining
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateReceivableDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        hosts={hosts}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["admin-host-receivables"] })}
      />
    </div>
  );
}