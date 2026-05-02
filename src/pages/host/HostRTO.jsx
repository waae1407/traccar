import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { FileKey, TrendingUp, DollarSign, CheckCircle2 } from "lucide-react";

const statusColors = {
  Active: "bg-green-500/20 text-green-400",
  "At Risk": "bg-yellow-500/20 text-yellow-400",
  Completed: "bg-blue-500/20 text-blue-400",
  Cancelled: "bg-red-500/20 text-red-400",
};

export default function HostRTO() {
  const { user } = useAuth();

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["host-rto", host?.id],
    queryFn: () => base44.entities.RentToOwnContract.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const totalValue = contracts.reduce((s, c) => s + (c.total_contract_value || 0), 0);
  const totalCollected = contracts.reduce((s, c) => s + (c.total_paid || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white font-syne">RTO Contracts</h1>
        <p className="text-white/40 text-sm mt-1">Rent-to-Own contracts for your vehicles</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/[0.08] p-5 glass text-center">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Active Contracts</p>
          <p className="text-2xl font-black text-white font-syne">{contracts.filter(c => c.status === "Active").length}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] p-5 glass text-center">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Total Value</p>
          <p className="text-2xl font-black text-green-400 font-syne">${totalValue.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] p-5 glass text-center">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Collected So Far</p>
          <p className="text-2xl font-black text-primary font-syne">${totalCollected.toLocaleString()}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />)}</div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-20">
          <FileKey className="h-12 w-12 text-white/20 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">No RTO Contracts</h3>
          <p className="text-white/40 text-sm">When renters enter RTO agreements on your vehicles, they'll appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {contracts.map(c => {
            const progress = c.total_contract_value > 0 ? Math.min(100, ((c.total_paid || 0) / c.total_contract_value) * 100) : 0;
            const remaining = (c.total_contract_value || 0) - (c.total_paid || 0);
            const equity = c.total_contract_value > 0 ? ((c.total_paid || 0) / c.total_contract_value) * 100 : 0;
            return (
              <div key={c.id} className="rounded-2xl border border-white/[0.08] p-6 glass">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-white">{c.vehicle_name}</h3>
                    <p className="text-sm text-white/40">{c.customer_name} · Started {c.start_date}</p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusColors[c.status] || "bg-white/10 text-white/60"}`}>{c.status}</span>
                </div>
                <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
                  <div><p className="text-white/40 text-xs">Weekly Payment</p><p className="font-bold text-white">${c.weekly_payment}/wk</p></div>
                  <div><p className="text-white/40 text-xs">Collected</p><p className="font-bold text-green-400">${(c.total_paid || 0).toLocaleString()}</p></div>
                  <div><p className="text-white/40 text-xs">Remaining</p><p className="font-bold text-white">${remaining.toLocaleString()}</p></div>
                  <div><p className="text-white/40 text-xs">Equity</p><p className="font-bold text-primary">{equity.toFixed(1)}%</p></div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-white/40 mb-1">
                    <span>Progress toward ownership</span>
                    <span>{progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full gradient-primary transition-all" style={{ width: `${progress}%` }} />
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