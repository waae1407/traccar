import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Users, CheckCircle2, XCircle, Clock, AlertTriangle, Search, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

const statusConfig = {
  pending: { label: "Pending", color: "bg-yellow-500/20 text-yellow-400" },
  approved: { label: "Approved", color: "bg-green-500/20 text-green-400" },
  suspended: { label: "Suspended", color: "bg-red-500/20 text-red-400" },
  rejected: { label: "Rejected", color: "bg-red-500/20 text-red-400" },
};

export default function AdminHosts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const { data: hosts = [], isLoading } = useQuery({
    queryKey: ["admin-hosts"],
    queryFn: () => base44.entities.Host.list("-created_date", 200),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Host.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-hosts"] }),
  });

  const handleApprove = async (host) => {
    await updateMutation.mutateAsync({ id: host.id, data: { status: "approved", approved_at: new Date().toISOString() } });
    await base44.functions.invoke("approveHost", { host_id: host.id, host_email: host.email, host_name: host.full_name });
  };

  const handleReject = (host) => updateMutation.mutate({ id: host.id, data: { status: "rejected" } });
  const handleSuspend = (host) => updateMutation.mutate({ id: host.id, data: { status: "suspended" } });
  const handleReinstate = (host) => updateMutation.mutate({ id: host.id, data: { status: "approved" } });

  const filtered = hosts.filter(h => {
    const matchSearch = !search || h.full_name?.toLowerCase().includes(search.toLowerCase()) || h.email?.toLowerCase().includes(search.toLowerCase()) || h.city?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || h.status === filter;
    return matchSearch && matchFilter;
  });

  const pending = hosts.filter(h => h.status === "pending");
  const approved = hosts.filter(h => h.status === "approved");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white font-syne">Host Management</h1>
        <p className="text-white/40 text-sm mt-1">{hosts.length} total hosts · {pending.length} pending approval</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Pending", value: pending.length, color: "text-yellow-400" },
          { label: "Approved", value: approved.length, color: "text-green-400" },
          { label: "Suspended", value: hosts.filter(h => h.status === "suspended").length, color: "text-red-400" },
          { label: "Total Fleet", value: hosts.reduce((s, h) => s + (h.total_vehicles || 0), 0), color: "text-primary" },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl border border-white/[0.08] p-4 glass text-center">
            <p className={`text-2xl font-black font-syne ${s.color}`}>{s.value}</p>
            <p className="text-xs text-white/40 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-primary/50"
            placeholder="Search hosts..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {["all", "pending", "approved", "suspended", "rejected"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all capitalize ${filter === s ? "bg-primary text-white" : "bg-white/[0.06] text-white/50 hover:text-white"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Host List */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-10 w-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40">No hosts found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(h => {
            const cfg = statusConfig[h.status] || statusConfig.pending;
            const isExpanded = expanded === h.id;
            return (
              <div key={h.id} className="rounded-2xl border border-white/[0.08] glass overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isExpanded ? null : h.id)}>
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {h.full_name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{h.full_name}</p>
                      <p className="text-xs text-white/40">{h.email} · {h.city}, {h.state}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs text-white/40 hidden md:block">
                      <p>Fleet Score: <span className="text-white font-bold">{h.fleet_score || 100}</span></p>
                      <p>Commission: <span className="text-white font-bold">{((h.commission_rate || 0.20) * 100).toFixed(0)}%</span></p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cfg.color}`}>{cfg.label}</span>
                    {h.stripe_onboarding_complete ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">Stripe ✓</span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/40">No Stripe</span>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-white/40" /> : <ChevronDown className="h-4 w-4 text-white/40" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-6 py-4 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div><p className="text-white/40 text-xs">Phone</p><p className="text-white">{h.phone || "—"}</p></div>
                      <div><p className="text-white/40 text-xs">Business</p><p className="text-white">{h.business_name || "Individual"}</p></div>
                      <div><p className="text-white/40 text-xs">Total Earnings</p><p className="text-white">${(h.total_earnings || 0).toLocaleString()}</p></div>
                      <div><p className="text-white/40 text-xs">Total Payouts</p><p className="text-white">${(h.total_payouts || 0).toLocaleString()}</p></div>
                    </div>
                    {h.bio && <p className="text-sm text-white/50 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">{h.bio}</p>}
                    <div className="flex items-center gap-3 flex-wrap">
                      {h.status === "pending" && (
                        <>
                          <button onClick={() => handleApprove(h)} disabled={updateMutation.isPending}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-green-500/20 border border-green-500/30 hover:bg-green-500/30 transition-all">
                            <CheckCircle2 className="h-4 w-4" /> Approve
                          </button>
                          <button onClick={() => handleReject(h)} disabled={updateMutation.isPending}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all">
                            <XCircle className="h-4 w-4" /> Reject
                          </button>
                        </>
                      )}
                      {h.status === "approved" && (
                        <button onClick={() => handleSuspend(h)} disabled={updateMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all">
                          <AlertTriangle className="h-4 w-4" /> Suspend
                        </button>
                      )}
                      {h.status === "suspended" && (
                        <button onClick={() => handleReinstate(h)} disabled={updateMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-green-400 bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-all">
                          <CheckCircle2 className="h-4 w-4" /> Reinstate
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}