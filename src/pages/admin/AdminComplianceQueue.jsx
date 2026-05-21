import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, CheckCircle2, Clock, Shield, Car, RefreshCw, ChevronRight, ExternalLink } from "lucide-react";
import { format, differenceInDays } from "date-fns";

const STATUS_CONFIG = {
  expired:       { label: "Expired",       color: "text-red-400",     bg: "bg-red-500/20 border-red-500/30",         priority: 0 },
  expiring_soon: { label: "Expiring Soon", color: "text-orange-400",  bg: "bg-orange-500/20 border-orange-500/30",   priority: 1 },
  pending_review:{ label: "Pending Review",color: "text-yellow-400",  bg: "bg-yellow-500/20 border-yellow-500/30",   priority: 2 },
  valid:         { label: "Valid",          color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/30", priority: 3 },
};

const DOC_LABELS = { insurance: "Insurance", registration: "Registration", inspection: "Inspection", title: "Title" };

function DocRow({ doc, activeBookings, onSendReminder, sending }) {
  const st = STATUS_CONFIG[doc.status] || STATUS_CONFIG.valid;
  const daysLeft = doc.expiry_date ? differenceInDays(new Date(doc.expiry_date), new Date()) : null;
  const affectedBookings = activeBookings.filter(b => b.vehicle_id === doc.vehicle_id);
  const hasActiveBooking = affectedBookings.length > 0;

  return (
    <div className={`p-4 rounded-xl border transition-all ${hasActiveBooking ? "border-red-500/40 bg-red-500/5" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${st.bg} ${st.color}`}>
              {st.label}
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
              {DOC_LABELS[doc.doc_type] || doc.doc_type}
            </span>
            {hasActiveBooking && (
              <span className="text-[10px] font-bold text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {affectedBookings.length} active rental{affectedBookings.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-foreground truncate">{doc.vehicle_name || "Unknown Vehicle"}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {doc.expiry_date && (
              <p className={`text-[10px] font-semibold ${daysLeft !== null && daysLeft < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                {daysLeft !== null && daysLeft < 0
                  ? `Expired ${Math.abs(daysLeft)}d ago (${doc.expiry_date})`
                  : daysLeft !== null
                    ? `Expires in ${daysLeft}d (${doc.expiry_date})`
                    : doc.expiry_date}
              </p>
            )}
            {doc.verified_by_admin && (
              <span className="text-[10px] text-emerald-400 font-semibold">✓ Admin verified</span>
            )}
          </div>
          {affectedBookings.length > 0 && (
            <div className="mt-2 space-y-1">
              {affectedBookings.slice(0, 2).map(b => (
                <div key={b.id} className="flex items-center gap-2">
                  <a
                    href={`/bookings-admin?search=${b.id}`}
                    className="text-[10px] text-primary hover:underline flex items-center gap-1"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    {b.customer_full_name || b.user_email} — {b.vehicle_name}
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {doc.doc_url && (
            <a href={doc.doc_url} target="_blank" rel="noreferrer"
              className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> View Doc
            </a>
          )}
          <button
            onClick={() => onSendReminder(doc)}
            disabled={sending === doc.id}
            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-muted/40 border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-50"
          >
            {sending === doc.id ? "Sending..." : "Send Reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminComplianceQueue() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("urgent"); // urgent | expiring | all
  const [sendingReminder, setSendingReminder] = useState(null);

  const { data: docs = [], isLoading: loadingDocs, refetch } = useQuery({
    queryKey: ["compliance-queue"],
    queryFn: () => base44.entities.HostVehicleCompliance.list("-created_date", 500),
    staleTime: 60_000,
  });

  const { data: activeBookings = [] } = useQuery({
    queryKey: ["compliance-active-bookings"],
    queryFn: () => base44.entities.BookingRequest.filter({ booking_status: "active" }),
    staleTime: 60_000,
  });

  const { data: hosts = [] } = useQuery({
    queryKey: ["compliance-hosts"],
    queryFn: () => base44.entities.Host.list("-created_date", 200),
    staleTime: 300_000,
  });

  const expiredDocs = docs.filter(d => d.status === "expired");
  const expiringSoon = docs.filter(d => d.status === "expiring_soon");
  const pendingReview = docs.filter(d => d.status === "pending_review");

  // Vehicles with active bookings + expired docs (most critical)
  const blockedVehicleIds = new Set(expiredDocs.map(d => d.vehicle_id));
  const activeBookingBlockedCount = activeBookings.filter(b => blockedVehicleIds.has(b.vehicle_id)).length;

  const filteredDocs = docs
    .filter(d => {
      if (filter === "urgent") return d.status === "expired" || (d.status === "expiring_soon" && activeBookings.some(b => b.vehicle_id === d.vehicle_id));
      if (filter === "expiring") return d.status === "expiring_soon";
      return ["expired", "expiring_soon", "pending_review"].includes(d.status);
    })
    .sort((a, b) => {
      const pa = STATUS_CONFIG[a.status]?.priority ?? 99;
      const pb = STATUS_CONFIG[b.status]?.priority ?? 99;
      if (pa !== pb) return pa - pb;
      return (a.expiry_date || "").localeCompare(b.expiry_date || "");
    });

  const handleSendReminder = async (doc) => {
    setSendingReminder(doc.id);
    try {
      await base44.functions.invoke('sendComplianceReminder', {
        host_id: doc.host_id,
        vehicle_id: doc.vehicle_id,
        doc_id: doc.id,
        doc_type: doc.doc_type,
        vehicle_name: doc.vehicle_name,
        expiry_date: doc.expiry_date,
        doc_status: doc.status,
      });
    } catch (err) {
      console.error("Reminder failed:", err);
    } finally {
      setSendingReminder(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Phase 2B</p>
          <h1 className="text-xl font-black text-foreground" style={{ fontFamily: "var(--font-syne)" }}>Compliance Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Expired and expiring compliance documents.</p>
        </div>
        <button onClick={refetch}
          className="h-9 w-9 rounded-xl bg-muted/40 border border-border flex items-center justify-center hover:bg-muted/60">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Critical alert */}
      {activeBookingBlockedCount > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-red-500/30 bg-red-500/10">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-300">
              {activeBookingBlockedCount} active rental{activeBookingBlockedCount > 1 ? "s" : ""} on vehicles with expired compliance
            </p>
            <p className="text-xs text-red-400/70">
              These vehicles may be operating without valid insurance or registration.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-xl p-3 text-center border border-red-500/20">
          <p className="text-2xl font-black text-red-400">{expiredDocs.length}</p>
          <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">Expired</p>
        </div>
        <div className="glass rounded-xl p-3 text-center border border-orange-500/20">
          <p className="text-2xl font-black text-orange-400">{expiringSoon.length}</p>
          <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">Expiring Soon</p>
        </div>
        <div className="glass rounded-xl p-3 text-center border border-yellow-500/20">
          <p className="text-2xl font-black text-yellow-400">{pendingReview.length}</p>
          <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">Pending Review</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { value: "urgent", label: "Urgent" },
          { value: "expiring", label: "Expiring Soon" },
          { value: "all", label: "All Issues" },
        ].map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filter === f.value ? "text-white" : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
            }`}
            style={filter === f.value ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Doc list */}
      {loadingDocs ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl">
          <CheckCircle2 className="h-10 w-10 text-emerald-400/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No compliance issues in this view</p>
          <p className="text-xs text-muted-foreground/60 mt-1">All active-rental vehicles have valid documentation</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDocs.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              activeBookings={activeBookings}
              onSendReminder={handleSendReminder}
              sending={sendingReminder}
            />
          ))}
        </div>
      )}
    </div>
  );
}