import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { DollarSign, Zap, Search, Download } from "lucide-react";
import { OperationalPageHeader, OperationalMetricGrid, OperationalListContainer } from "@/components/admin/operational";

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

  const totalPending = payouts.filter(p => p.status === "pending").reduce((s, p) => s + (p.net_payout || p.net_host_payout || 0), 0);
  const totalPaid = payouts.filter(p => p.status === "paid").reduce((s, p) => s + (p.net_payout || p.net_host_payout || 0), 0);
  const totalPlatformFees = payouts.reduce((s, p) => s + (p.platform_fee || p.uride_platform_fee_amount || 0), 0);

  const exportCsv = () => {
    const rows = [["Host", "Email", "Vehicle", "Gross", "Platform Fee", "Net Payout", "Status", "Period Start", "Period End", "Transfer ID"], ...filtered.map(p => [p.host_name || "", p.host_email || "", p.vehicle_name || "", p.gross_collected || p.gross_booking_amount || 0, p.platform_fee || p.uride_platform_fee_amount || 0, p.net_payout || p.net_host_payout || 0, p.status || "", p.period_start || "", p.period_end || "", p.stripe_transfer_id || ""])];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `admin-payouts-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const metrics = [
    { label: "Pending Payouts", value: totalPending, type: "currency", color: "text-yellow-400", bg: "bg-yellow-500/[0.06] border-yellow-500/20" },
    { label: "Total Paid Out", value: totalPaid, type: "currency", color: "text-green-400", bg: "bg-green-500/[0.06] border-green-500/20" },
    { label: "Platform Revenue", value: totalPlatformFees, type: "currency", color: "text-primary", bg: "bg-primary/[0.06] border-primary/20" },
    { label: "Filtered Records", value: filtered.length, color: "text-white" },
  ];

  return (
    <div className="space-y-5 animate-fade-in-up">
      <OperationalPageHeader
        title="Host Payouts"
        subtitle={`Stripe Connect payout operations · ${payouts.filter(p => p.status === "pending").length} pending`}
        eyebrow="Operations"
        action={<button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white bg-primary hover:bg-primary/90"><Download className="h-4 w-4" /> Export</button>}
      />

      <OperationalMetricGrid metrics={metrics} />

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
        <OperationalListContainer title="Payout Records" count={filtered.length} loading={isLoading} emptyIcon={DollarSign} emptyTitle="No payouts found" emptyDescription="Adjust filters to review host payout records.">
          <div className="divide-y divide-white/[0.06]">
            {filtered.map(p => {
              const cfg = statusConfig[p.status] || statusConfig.pending;
              return (
                <div key={p.id} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{p.host_name || p.host_email || "Unknown host"}</p>
                    <p className="text-xs text-white/40">{p.period_start} → {p.period_end} · {p.booking_count || 0} bookings</p>
                    {p.stripe_transfer_id && <p className="text-xs font-mono text-white/20 mt-0.5 truncate">{p.stripe_transfer_id}</p>}
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">${(p.net_payout || p.net_host_payout || 0).toLocaleString()}</p>
                      <p className="text-xs text-white/30">${(p.gross_collected || p.gross_booking_amount || 0).toLocaleString()} gross · ${(p.platform_fee || p.uride_platform_fee_amount || 0).toLocaleString()} fee</p>
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
        </OperationalListContainer>
      )}
    </div>
  );
}