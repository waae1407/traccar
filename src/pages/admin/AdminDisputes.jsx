import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Shield, DollarSign, Clock, CheckCircle2, Search, X, FileText, ExternalLink, User, Car, ChevronRight, Activity } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useAuth } from "@/lib/AuthContext";

const STATUS_CONFIG = {
  open: { label: "Open", color: "text-orange-400", bg: "bg-orange-500/20 border-orange-500/30" },
  under_review: { label: "Under Review", color: "text-yellow-400", bg: "bg-yellow-500/20 border-yellow-500/30" },
  evidence_requested: { label: "Evidence Requested", color: "text-blue-400", bg: "bg-blue-500/20 border-blue-500/30" },
  payout_held: { label: "Payout Held", color: "text-purple-400", bg: "bg-purple-500/20 border-purple-500/30" },
  resolved_host_favor: { label: "Resolved (Host)", color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/30" },
  resolved_customer_favor: { label: "Resolved (Customer)", color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/30" },
  resolved_split: { label: "Resolved (Split)", color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/30" },
  closed_no_action: { label: "Closed", color: "text-muted-foreground", bg: "bg-muted/30 border-border" },
  chargeback: { label: "Chargeback", color: "text-red-400", bg: "bg-red-500/20 border-red-500/30" },
};

const TYPE_LABELS = {
  damage: "Damage", smoking: "Smoking", cleaning: "Cleaning", late_return: "Late Return",
  payment_dispute: "Payment Dispute", chargeback: "Chargeback",
  unauthorized_driver: "Unauthorized Driver", gps_tampering: "GPS Tampering",
};

const RESOLUTION_STATUSES = ["under_review", "evidence_requested", "payout_held", "resolved_host_favor", "resolved_customer_favor", "resolved_split", "closed_no_action"];

function DisputeCard({ dispute, selected, onSelect }) {
  const st = STATUS_CONFIG[dispute.status] || STATUS_CONFIG.open;
  const daysUntilDue = dispute.due_by ? differenceInDays(new Date(dispute.due_by), new Date()) : null;
  const isUrgent = daysUntilDue !== null && daysUntilDue <= 3;

  return (
    <button
      onClick={() => onSelect(dispute)}
      className={`w-full text-left p-4 rounded-xl border transition-all ${selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${st.bg} ${st.color}`}>
              {st.label}
            </span>
            <span className="text-[10px] text-muted-foreground font-semibold bg-muted/40 px-1.5 py-0.5 rounded">
              {TYPE_LABELS[dispute.dispute_type] || dispute.dispute_type}
            </span>
            {dispute.stripe_dispute_amount && (
              <span className="text-[10px] font-bold text-red-400">
                ${dispute.stripe_dispute_amount.toFixed(2)}
              </span>
            )}
          </div>
          <p className="text-xs text-foreground font-semibold leading-snug truncate">
            {dispute.customer_email || "Unknown customer"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {dispute.vehicle_name || "—"} · {dispute.created_date ? format(new Date(dispute.created_date), "MMM d, yyyy") : "—"}
          </p>
          {daysUntilDue !== null && (
            <p className={`text-[10px] font-bold mt-1 ${isUrgent ? "text-red-400" : "text-yellow-400"}`}>
              ⏰ {daysUntilDue <= 0 ? "OVERDUE" : `${daysUntilDue}d until Stripe deadline`}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
      </div>
    </button>
  );
}

function DisputeDetail({ dispute, onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [adminNotes, setAdminNotes] = useState(dispute.admin_notes || "");
  const [newStatus, setNewStatus] = useState(dispute.status);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.Dispute.update(dispute.id, {
        admin_notes: adminNotes,
        status: newStatus,
      });
      queryClient.invalidateQueries(["disputes"]);
    } finally {
      setSaving(false);
    }
  };

  const st = STATUS_CONFIG[dispute.status] || STATUS_CONFIG.open;
  const daysUntilDue = dispute.due_by ? differenceInDays(new Date(dispute.due_by), new Date()) : null;

  return (
    <div className="glass rounded-2xl p-5 space-y-4 h-full overflow-y-auto">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-foreground">{TYPE_LABELS[dispute.dispute_type] || dispute.dispute_type} Dispute</h3>
          <p className="text-xs text-muted-foreground">Opened {dispute.created_date ? format(new Date(dispute.created_date), "MMM d, yyyy h:mm a") : "—"}</p>
        </div>
        <button onClick={onClose} className="h-8 w-8 rounded-lg bg-muted/40 flex items-center justify-center hover:bg-muted/60">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Status + Due date */}
      <div className="flex items-center gap-3">
        <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${st.bg} ${st.color}`}>{st.label}</span>
        {daysUntilDue !== null && (
          <span className={`text-xs font-bold ${daysUntilDue <= 3 ? "text-red-400" : "text-yellow-400"}`}>
            ⏰ {daysUntilDue <= 0 ? "EVIDENCE OVERDUE" : `${daysUntilDue} days to submit evidence`}
          </span>
        )}
      </div>

      {/* Key info */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: User, label: "Customer", value: dispute.customer_email },
          { icon: Car, label: "Vehicle", value: dispute.vehicle_name },
          { icon: DollarSign, label: "Amount", value: dispute.stripe_dispute_amount ? `$${dispute.stripe_dispute_amount.toFixed(2)}` : "—" },
          { icon: FileText, label: "Stripe Dispute ID", value: dispute.stripe_dispute_id || "—" },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-muted/30 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground font-semibold uppercase">{label}</p>
            </div>
            <p className="text-xs text-foreground font-semibold break-all">{value || "—"}</p>
          </div>
        ))}
      </div>

      {/* Booking link */}
      {dispute.booking_request_id && (
        <a
          href={`/bookings-admin?search=${dispute.booking_request_id}`}
          className="flex items-center gap-2 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View Booking {dispute.booking_request_id}
        </a>
      )}

      {/* Description */}
      {dispute.description && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Description</p>
          <p className="text-xs text-foreground bg-muted/30 rounded-xl p-3">{dispute.description}</p>
        </div>
      )}

      {/* Evidence URLs */}
      {(dispute.host_evidence_urls?.length > 0 || dispute.customer_evidence_urls?.length > 0) && (
        <div className="space-y-2">
          {dispute.host_evidence_urls?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Host Evidence</p>
              <div className="space-y-1">
                {dispute.host_evidence_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="block text-xs text-primary hover:underline truncate">{url}</a>
                ))}
              </div>
            </div>
          )}
          {dispute.customer_evidence_urls?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Customer Evidence</p>
              <div className="space-y-1">
                {dispute.customer_evidence_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="block text-xs text-primary hover:underline truncate">{url}</a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Change status */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Update Status</p>
        <select
          value={newStatus}
          onChange={e => setNewStatus(e.target.value)}
          className="w-full h-9 px-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:border-primary"
        >
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Admin notes */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Admin Notes</p>
        <textarea
          value={adminNotes}
          onChange={e => setAdminNotes(e.target.value)}
          rows={4}
          placeholder="Add internal notes, evidence review, resolution rationale..."
          className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary resize-none"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-all"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

export default function AdminDisputes() {
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: disputes = [], isLoading } = useQuery({
    queryKey: ["disputes"],
    queryFn: () => base44.entities.Dispute.list("-created_date", 100),
    staleTime: 30_000,
  });

  const filtered = disputes.filter(d => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (typeFilter !== "all" && d.dispute_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.customer_email?.toLowerCase().includes(q) && !d.vehicle_name?.toLowerCase().includes(q) && !d.stripe_dispute_id?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Count chargebacks with upcoming deadline
  const urgentCount = disputes.filter(d => {
    if (d.status === "chargeback" || d.dispute_type === "chargeback") {
      const daysLeft = d.due_by ? differenceInDays(new Date(d.due_by), new Date()) : null;
      return daysLeft !== null && daysLeft <= 5;
    }
    return false;
  }).length;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Admin Operations</p>
        <h1 className="text-xl font-black text-foreground" style={{ fontFamily: "var(--font-syne)" }}>Dispute Queue</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Chargebacks, damage claims, and payment disputes.</p>
      </div>

      {/* Urgent alert */}
      {urgentCount > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-red-500/30 bg-red-500/10">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-300">{urgentCount} chargeback{urgentCount > 1 ? "s" : ""} require urgent action</p>
            <p className="text-xs text-red-400/70">Stripe evidence deadlines within 5 days. Filter by "Chargeback" status to review.</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open", value: disputes.filter(d => d.status === "open").length, color: "text-orange-400" },
          { label: "Chargebacks", value: disputes.filter(d => d.dispute_type === "chargeback").length, color: "text-red-400" },
          { label: "Resolved", value: disputes.filter(d => ["resolved_host_favor", "resolved_customer_favor", "resolved_split"].includes(d.status)).length, color: "text-emerald-400" },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-3 text-center">
            <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground font-semibold">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left: list */}
        <div className="flex-1 space-y-3">
          {/* Filters */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search customer, vehicle, Stripe ID..."
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:border-primary"
            >
              <option value="all">All Status</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="h-9 px-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:border-primary"
            >
              <option value="all">All Types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 glass rounded-2xl">
              <Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No disputes found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Chargebacks from Stripe appear here automatically</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(d => (
                <DisputeCard key={d.id} dispute={d} selected={selected?.id === d.id} onSelect={setSelected} />
              ))}
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        {selected && (
          <div className="lg:w-96 flex-shrink-0">
            <DisputeDetail key={selected.id} dispute={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </div>
  );
}