import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DollarSign, CheckCircle2, Clock, AlertTriangle, Zap, Search } from "lucide-react";

const statusConfig = {
  pending: { label: "Pending", color: "bg-yellow-500/20 text-yellow-400" },
  processing: { label: "Processing", color: "bg-blue-500/20 text-blue-400" },
  paid: { label: "Paid", color: "bg-green-500/20 text-green-400" },
  failed: { label: "Failed", color: "bg-red-500/20 text-red-400" },
};

export default function AdminPayouts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: () => base44.entities.HostPayout.list("-created_date", 300),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.HostPayout.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-payouts"] }),
  });

  const triggerPayout = async (payout) => {
    updateMutation.mutate({ id: payout.id, data: { status: "processing" } });
    const res = await base44.functions.invoke("processHostPayout", { payout_id: payout.id });
    if (res.data?.success) updateMutation.mutate({ id: payout.id, data: { status: "paid", payout_date: new Date().toISOString().split("T")[0], stripe_transfer_id: res.data.transfer_id } });
  };

  const filtered = payouts.filter(p => {
    const matchSearch = !search || p.host_name?.toLowerCase().includes(search.toLowerCase()) || p.host_email?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || p.status === filter;
    return matchSearch && matchFilter;
  });

  const totalPending = payouts.filter(p => p.status === "pending").reduce((s, p) => s + (p.net_payout || 0), 0);
  const totalPaid = payouts.filter(p => p.status === "paid").reduce((s, p) => s + (p.net_payout || 0), 0);
  const totalPlatformFees = payouts.reduce((s, p) => s + (p.platform_fee || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white font-syne">Host Payouts</h1>
        <p className="text-white/40 text-sm mt-1">Live certified Stripe Connect execution · guarded by duplicate prevention and audit logging · {payouts.filter(p => p.status === "pending").length} pending</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-5 text-center">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Pending Payouts</p>
          <p className="text-2xl font-black text-yellow-400 font-syne">${totalPending.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5 text-center">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Total Paid Out</p>
          <p className="text-2xl font-black text-green-400 font-syne">${totalPaid.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Platform Revenue</p>
          <p className="text-2xl font-black text-primary font-syne">${totalPlatformFees.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-primary/50"
            placeholder="Search by host name..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {["all", "pending", "processing", "paid", "failed"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all capitalize ${filter === s ? "bg-primary text-white" : "bg-white/[0.06] text-white/50 hover:text-white"}`}>
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <DollarSign className="h-10 w-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40">No payouts found</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] glass overflow-hidden">
          <div className="divide-y divide-white/[0.06]">
            {filtered.map(p => {
              const cfg = statusConfig[p.status] || statusConfig.pending;
              return (
                <div key={p.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{p.host_name}</p>
                    <p className="text-xs text-white/40">{p.period_start} → {p.period_end} · {p.booking_count} bookings</p>
                    {p.stripe_transfer_id && <p className="text-xs font-mono text-white/20 mt-0.5">{p.stripe_transfer_id}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">${p.net_payout?.toLocaleString()}</p>
                      <p className="text-xs text-white/30">${p.gross_collected?.toLocaleString()} gross · ${p.platform_fee?.toLocaleString()} fee</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cfg.color}`}>{cfg.label}</span>
                    {p.status === "pending" && (
                      <button onClick={() => triggerPayout(p)} disabled={updateMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-primary/20 border border-primary/30 hover:bg-primary/30 transition-all">
                        <Zap className="h-3 w-3" /> Pay Now
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}