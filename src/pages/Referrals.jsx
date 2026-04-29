import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Gift, Search, Filter, DollarSign, Users, CheckCircle, Clock, XCircle, ExternalLink, ChevronDown, ChevronUp, Ban, BadgeCheck } from "lucide-react";

const STATUS_CONFIG = {
  pending:   { label: "Pending",   color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  signed_up: { label: "Signed Up", color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20" },
  booked:    { label: "Booked",    color: "text-cyan-400",   bg: "bg-cyan-500/10 border-cyan-500/20" },
  active:    { label: "Active",    color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20" },
  credited:  { label: "Credited",  color: "text-primary",    bg: "bg-pink-500/10 border-pink-500/20" },
  voided:    { label: "Voided",    color: "text-white/30",   bg: "bg-white/5 border-white/10" },
};

function StatChip({ label, value, color = "text-white" }) {
  return (
    <div className="rounded-2xl p-4 border border-white/[0.07] flex flex-col gap-1" style={{ background: "hsl(222 24% 11%)" }}>
      <p className={`text-2xl font-bold ${color}`} style={{ fontFamily: "var(--font-syne)" }}>{value}</p>
      <p className="text-xs text-white/40">{label}</p>
    </div>
  );
}

function ReferralRow({ referral, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_CONFIG[referral.status] || STATUS_CONFIG.pending;

  return (
    <div className="border border-white/[0.07] rounded-2xl overflow-hidden mb-2" style={{ background: "hsl(222 24% 11%)" }}>
      {/* Main row */}
      <div className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors" onClick={() => setExpanded(!expanded)}>
        {/* Referrer */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white">{referral.referrer_name || referral.referrer_email}</p>
            <span className="text-[10px] text-white/30">→ referred →</span>
            <p className="text-sm font-semibold text-white">{referral.referee_name || referral.referee_email}</p>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-white/30">{referral.referrer_email}</span>
            <span className="text-white/20">·</span>
            <span className="text-xs text-white/30">{referral.referee_email}</span>
            {referral.created_date && (
              <>
                <span className="text-white/20">·</span>
                <span className="text-xs text-white/25">{format(new Date(referral.created_date), "MMM d, yyyy")}</span>
              </>
            )}
          </div>
        </div>

        {/* Credits */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-white/30">Referrer</p>
            <p className={`text-sm font-bold ${referral.referrer_credit_applied ? "text-green-400" : "text-white/40"}`}>
              {referral.referrer_credit_applied ? `✓ $${referral.referrer_credit_amount || 25}` : `$${referral.referrer_credit_amount || 25} pending`}
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-white/30">Referee</p>
            <p className={`text-sm font-bold ${referral.referee_credit_applied ? "text-green-400" : "text-white/40"}`}>
              {referral.referee_credit_applied ? `✓ $${referral.referee_credit_amount || 25}` : `$${referral.referee_credit_amount || 25} pending`}
            </p>
          </div>
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${s.bg} ${s.color}`}>{s.label}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-4 py-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-white/30 uppercase tracking-wider mb-1">Referral Code</p>
              <p className="font-mono font-bold text-white">{referral.referral_code}</p>
            </div>
            <div>
              <p className="text-white/30 uppercase tracking-wider mb-1">Status</p>
              <p className={`font-bold ${s.color}`}>{s.label}</p>
            </div>
            <div>
              <p className="text-white/30 uppercase tracking-wider mb-1">Referrer Credit</p>
              <p className={`font-bold ${referral.referrer_credit_applied ? "text-green-400" : "text-white/50"}`}>
                ${referral.referrer_credit_amount || 25} {referral.referrer_credit_applied ? `· applied ${referral.referrer_credit_applied_at ? format(new Date(referral.referrer_credit_applied_at), "MMM d") : ""}` : "· not yet applied"}
              </p>
            </div>
            <div>
              <p className="text-white/30 uppercase tracking-wider mb-1">Referee Credit</p>
              <p className={`font-bold ${referral.referee_credit_applied ? "text-green-400" : "text-white/50"}`}>
                ${referral.referee_credit_amount || 25} {referral.referee_credit_applied ? `· applied ${referral.referee_credit_applied_at ? format(new Date(referral.referee_credit_applied_at), "MMM d") : ""}` : "· not yet applied"}
              </p>
            </div>
          </div>

          {referral.booking_request_id && (
            <div>
              <p className="text-white/30 text-xs uppercase tracking-wider mb-1">Qualifying Booking</p>
              <a href={`/checkout?request=${referral.booking_request_id}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                View Booking <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {referral.notes && (
            <div>
              <p className="text-white/30 text-xs uppercase tracking-wider mb-1">Notes</p>
              <p className="text-xs text-white/60">{referral.notes}</p>
            </div>
          )}

          {/* Admin actions */}
          <div className="flex gap-2 flex-wrap pt-1">
            {referral.status !== "credited" && referral.status !== "voided" && (
              <button
                onClick={() => onUpdate(referral.id, { status: "credited", referrer_credit_applied: true, referee_credit_applied: true, referrer_credit_applied_at: new Date().toISOString(), referee_credit_applied_at: new Date().toISOString() })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-green-400 border border-green-500/30 hover:bg-green-500/10 transition-colors">
                <BadgeCheck className="h-3.5 w-3.5" /> Mark Credited
              </button>
            )}
            {referral.status !== "voided" && (
              <button
                onClick={() => onUpdate(referral.id, { status: "voided", notes: "Voided by admin" })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors">
                <Ban className="h-3.5 w-3.5" /> Void Referral
              </button>
            )}
            {!referral.referrer_credit_applied && (
              <button
                onClick={() => onUpdate(referral.id, { referrer_credit_applied: true, referrer_credit_applied_at: new Date().toISOString() })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white/50 border border-white/10 hover:bg-white/5 transition-colors">
                <CheckCircle className="h-3.5 w-3.5" /> Mark Referrer Paid
              </button>
            )}
            {!referral.referee_credit_applied && (
              <button
                onClick={() => onUpdate(referral.id, { referee_credit_applied: true, referee_credit_applied_at: new Date().toISOString() })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white/50 border border-white/10 hover:bg-white/5 transition-colors">
                <CheckCircle className="h-3.5 w-3.5" /> Mark Referee Paid
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Referrals() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ["referrals-admin"],
    queryFn: () => base44.entities.Referral.list("-created_date", 500),
  });

  const { data: referralCodes = [] } = useQuery({
    queryKey: ["referral-codes-admin"],
    queryFn: () => base44.entities.ReferralCode.list("-created_date", 500),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Referral.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referrals-admin"] }),
  });

  const handleUpdate = (id, data) => updateMutation.mutate({ id, data });

  // Stats
  const totalReferrals = referrals.length;
  const credited = referrals.filter(r => r.status === "credited").length;
  const pending = referrals.filter(r => !["credited", "voided"].includes(r.status)).length;
  const totalIssued = referrals.filter(r => r.status === "credited").length * 50; // $25 each side
  const totalApplied = referrals.filter(r => r.referrer_credit_applied || r.referee_credit_applied)
    .reduce((sum, r) => sum + (r.referrer_credit_applied ? (r.referrer_credit_amount || 25) : 0) + (r.referee_credit_applied ? (r.referee_credit_amount || 25) : 0), 0);

  // Filter
  const filtered = referrals.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${r.referrer_email} ${r.referrer_name} ${r.referee_email} ${r.referee_name} ${r.referral_code}`.toLowerCase().includes(q)) return false;
    }
    if (dateFrom && new Date(r.created_date) < new Date(dateFrom)) return false;
    if (dateTo && new Date(r.created_date) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  const inputCls = "h-9 px-3 rounded-xl text-sm text-white placeholder-white/30 border border-white/10 outline-none focus:border-primary/50 transition-colors";
  const inputStyle = { background: "hsl(222 24% 11%)" };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <Gift className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-syne)" }}>Rent for Free — Referral Program</h1>
          <p className="text-sm text-white/40 mt-0.5">Track all referrals, credits issued, and earnings</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatChip label="Total Referrals" value={totalReferrals} />
        <StatChip label="Credited" value={credited} color="text-green-400" />
        <StatChip label="Pending" value={pending} color="text-yellow-400" />
        <StatChip label="Total $ Issued" value={`$${totalIssued}`} color="text-primary" />
      </div>

      {/* Top Referrers */}
      {referralCodes.filter(c => c.total_referrals > 0).length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] p-5 mb-5" style={{ background: "hsl(222 24% 11%)" }}>
          <p className="text-sm font-bold text-white mb-3">🏆 Top Referrers</p>
          <div className="space-y-2">
            {[...referralCodes].sort((a, b) => (b.total_credits_earned || 0) - (a.total_credits_earned || 0)).slice(0, 5).map(rc => (
              <div key={rc.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-white font-medium">{rc.user_name || rc.user_email}</span>
                  <span className="text-white/30 text-xs ml-2">{rc.user_email}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-white/40 text-xs">{rc.total_referrals || 0} referrals</span>
                  <span className="text-green-400 font-bold">${rc.total_credits_earned || 0} earned</span>
                  <span className="text-white/30 text-xs">${rc.total_credits_used || 0} used</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search referrer, referee, code…"
            className={`w-full ${inputCls} pl-9`} style={inputStyle} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className={`${inputCls} pr-8`} style={inputStyle}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className={inputCls} style={inputStyle} placeholder="From" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className={inputCls} style={inputStyle} placeholder="To" />
      </div>

      <p className="text-xs text-white/30 mb-3">
        Showing {filtered.length} of {referrals.length} referrals
        {search && ` matching "${search}"`}
      </p>

      {/* Referral rows */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "hsl(222 24% 11%)" }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Gift className="h-10 w-10 text-white/10 mx-auto mb-3" />
          <p className="text-white/30 text-sm">No referrals found</p>
          <p className="text-white/20 text-xs mt-1">Referrals appear here when customers share their links</p>
        </div>
      ) : (
        <div>
          {filtered.map(r => (
            <ReferralRow key={r.id} referral={r} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}