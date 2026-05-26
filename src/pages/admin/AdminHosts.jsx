import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Users, CheckCircle2, AlertTriangle, Search, ChevronDown, ChevronUp, Shield, FileText, DollarSign, Lock, Settings } from "lucide-react";
import HostRestrictionsPanel from "@/components/admin/HostRestrictionsPanel";
import HostVerificationPanel from "@/components/admin/HostVerificationPanel";
import AdminHostReputationPanel from "@/components/admin/reputation/AdminHostReputationPanel";
import HostDomainReviewPanel from "@/components/admin/HostDomainReviewPanel";
import OperatorPlanSummary from "@/components/admin/OperatorPlanSummary";

const statusConfig = {
  pending: { label: "Pending", color: "bg-yellow-500/20 text-yellow-400" },
  approved: { label: "Approved", color: "bg-green-500/20 text-green-400" },
  suspended: { label: "Suspended", color: "bg-red-500/20 text-red-400" },
  rejected: { label: "Rejected", color: "bg-red-500/20 text-red-400" },
};

const verificationConfig = {
  not_started: { label: "Not Started", color: "bg-white/10 text-white/40" },
  docs_requested: { label: "Docs Requested", color: "bg-yellow-500/20 text-yellow-400" },
  docs_submitted: { label: "Docs Submitted", color: "bg-blue-500/20 text-blue-400" },
  verified: { label: "Verified ✓", color: "bg-green-500/20 text-green-400" },
  failed: { label: "Failed", color: "bg-red-500/20 text-red-400" },
};

export default function AdminHosts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [verifyingHost, setVerifyingHost] = useState(null);
  const [restrictingHost, setRestrictingHost] = useState(null);

  const { data: hosts = [], isLoading } = useQuery({
    queryKey: ["admin-hosts"],
    queryFn: () => base44.entities.Host.list("-created_date", 200),
  });

  const { data: reputationSummaries = [] } = useQuery({
    queryKey: ["admin-host-reputation-summaries"],
    queryFn: () => base44.entities.HostReputationSummary.list("-updated_date", 500),
  });
  const { data: operatorPlans = [] } = useQuery({
    queryKey: ["admin-operator-plans"],
    queryFn: () => base44.entities.OperatorPlanConfiguration.list("-updated_date", 500),
  });
  const { data: dealerMemberships = [] } = useQuery({
    queryKey: ["admin-dealer-memberships"],
    queryFn: () => base44.entities.DealerNetworkMembership.list("-updated_date", 500),
  });
  const reputationMap = Object.fromEntries(reputationSummaries.map((s) => [s.host_id, s]));
  const operatorPlanMap = Object.fromEntries(operatorPlans.map((p) => [p.host_id, p]));
  const dealerMembershipMap = Object.fromEntries(dealerMemberships.map((m) => [m.host_id, m]));

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Host.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-hosts"] }),
  });

  const handleSuspend = (host) => updateMutation.mutate({ id: host.id, data: { status: "suspended" } });
  const handleReinstate = (host) => updateMutation.mutate({ id: host.id, data: { status: "approved" } });

  // Mark as viewed when expanded
  const handleExpand = (host) => {
    const next = expanded === host.id ? null : host.id;
    setExpanded(next);
    if (next && !host.admin_viewed) {
      updateMutation.mutate({ id: host.id, data: { admin_viewed: true } });
    }
  };

  const filtered = hosts.filter(h => {
    const matchSearch = !search || h.full_name?.toLowerCase().includes(search.toLowerCase()) || h.email?.toLowerCase().includes(search.toLowerCase()) || h.city?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || h.status === filter;
    return matchSearch && matchFilter;
  });

  const pending = hosts.filter(h => h.status === "pending");
  const approved = hosts.filter(h => h.status === "approved");
  const unviewed = hosts.filter(h => h.status === "pending" && !h.admin_viewed);
  const docsSubmitted = hosts.filter(h => h.verification_status === "docs_submitted");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white font-syne">Host Management</h1>
          <p className="text-white/40 text-sm mt-1">{hosts.length} total hosts · {pending.length} pending approval</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {unviewed.length > 0 && (
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-sm font-bold">
              <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
              {unviewed.length} new application{unviewed.length > 1 ? "s" : ""}
            </span>
          )}
          {docsSubmitted.length > 0 && (
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 text-sm font-bold">
              <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              {docsSubmitted.length} docs ready to review
            </span>
          )}
        </div>
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
            {s}{s === "pending" && pending.length > 0 ? ` (${pending.length})` : ""}
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
            const vCfg = verificationConfig[h.verification_status || "not_started"];
            const isExpanded = expanded === h.id;
            const isNew = h.status === "pending" && !h.admin_viewed;
            const hasDocsReady = h.verification_status === "docs_submitted";
            return (
              <div key={h.id} className={`rounded-2xl border overflow-hidden transition-all ${isNew ? "border-yellow-500/30" : hasDocsReady ? "border-blue-500/30" : "border-white/[0.08]"} glass`}>
                {isNew && <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, hsl(45 95% 55%), hsl(38 95% 50%))" }} />}
                {hasDocsReady && !isNew && <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #3b82f6, #6366f1)" }} />}
                <div className="px-6 py-4 flex items-center justify-between cursor-pointer" onClick={() => handleExpand(h)}>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold">
                        {h.full_name?.charAt(0).toUpperCase()}
                      </div>
                      {isNew && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-yellow-400 border-2 border-[hsl(222,28%,10%)]" />}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{h.full_name}</p>
                      <p className="text-xs text-white/40">{h.email} · {h.city}, {h.state}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cfg.color}`}>{cfg.label}</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${vCfg.color}`}>{vCfg.label}</span>
                    {h.stripe_onboarding_complete
                      ? <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">Stripe ✓</span>
                      : <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/40">No Stripe</span>}
                    {h.payout_frozen && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 font-bold">💸 Frozen</span>}
                    {h.booking_blocked && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold">🔒 Blocked</span>}
                    {h.host_under_review && <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-bold">👁 Review</span>}
                    {h.require_manual_approval && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold">✋ Manual</span>}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-white/40" /> : <ChevronDown className="h-4 w-4 text-white/40" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-6 py-4 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div><p className="text-white/40 text-xs">Phone</p><p className="text-white">{h.phone || "—"}</p></div>
                      <div><p className="text-white/40 text-xs">Business</p><p className="text-white">{h.business_name || "Individual"}</p></div>
                      <div><p className="text-white/40 text-xs">Business Type</p><p className="text-white capitalize">{h.business_type?.replace(/_/g, " ") || "—"}</p></div>
                      <div><p className="text-white/40 text-xs">EIN</p><p className="text-white">{h.ein_number || "—"}</p></div>
                      <div><p className="text-white/40 text-xs">Legal Name</p><p className="text-white">{h.business_legal_name || "—"}</p></div>
                      <div><p className="text-white/40 text-xs">Tax Class</p><p className="text-white">{h.tax_classification || "—"}</p></div>
                      <div><p className="text-white/40 text-xs">Total Earnings</p><p className="text-white">${(h.total_earnings || 0).toLocaleString()}</p></div>
                      <div><p className="text-white/40 text-xs">Commission</p><p className="text-white">{((h.commission_rate || 0.20) * 100).toFixed(0)}%</p></div>
                    </div>

                    {/* Document status chips */}
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "ID Front", ok: h.id_front_url, url: h.id_front_url },
                        { label: "ID Back", ok: h.id_back_url, url: h.id_back_url },
                        { label: "Selfie", ok: h.selfie_url, url: h.selfie_url },
                        { label: "EIN Letter", ok: h.ein_letter_url, url: h.ein_letter_url },
                      ].map(doc => (
                        <a key={doc.label} href={doc.url || "#"} target={doc.url ? "_blank" : undefined} rel="noreferrer"
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${doc.ok ? "bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25" : "bg-white/[0.05] text-white/30 border border-white/[0.08] cursor-default"}`}>
                          {doc.ok ? <CheckCircle2 className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                          {doc.label}
                        </a>
                      ))}
                    </div>

                    {h.bio && <p className="text-sm text-white/50 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">{h.bio}</p>}
                    {h.verification_notes && <p className="text-xs text-white/40 italic">Notes: {h.verification_notes}</p>}

                    {h.restriction_reason && (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0" />
                        <p className="text-xs text-yellow-300">{h.restriction_reason}</p>
                      </div>
                    )}

                    <AdminHostReputationPanel summary={reputationMap[h.id]} />
                    <OperatorPlanSummary plan={operatorPlanMap[h.id]} dealerMembership={dealerMembershipMap[h.id]} />
                    <HostDomainReviewPanel host={h} />

                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={() => setVerifyingHost(h)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
                        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                        <Shield className="h-4 w-4" /> Verify & Manage
                      </button>
                      <button onClick={() => setRestrictingHost(h)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 transition-all">
                        <Settings className="h-4 w-4" /> Restrictions
                      </button>
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

      {/* Verification Panel Modal */}
      {verifyingHost && (
        <HostVerificationPanel
          host={verifyingHost}
          open={!!verifyingHost}
          onClose={() => setVerifyingHost(null)}
        />
      )}

      {/* Restrictions Panel Modal */}
      {restrictingHost && (
        <HostRestrictionsPanel
          host={restrictingHost}
          onClose={() => setRestrictingHost(null)}
        />
      )}
    </div>
  );
}