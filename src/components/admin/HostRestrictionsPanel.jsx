import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { X, DollarSign, Lock, ClipboardCheck, Eye, RotateCcw } from "lucide-react";

const RESTRICTIONS = [
  {
    key: "payout_frozen",
    label: "Freeze Payouts",
    description: "Block all outgoing payouts until unfrozen.",
    icon: DollarSign,
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/30",
    auditOn: "payment.failed",
    auditOff: "payout.released",
    summaryOn: (h, r) => `Payouts frozen for ${h.full_name}: ${r}`,
    summaryOff: (h) => `Payouts unfrozen for ${h.full_name}`,
  },
  {
    key: "booking_blocked",
    label: "Block New Bookings",
    description: "Prevent customers from booking this host's vehicles.",
    icon: Lock,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    auditOn: "booking.suspended",
    auditOff: "booking.status_changed",
    summaryOn: (h, r) => `New bookings blocked for ${h.full_name}: ${r}`,
    summaryOff: (h) => `Booking block lifted for ${h.full_name}`,
  },
  {
    key: "require_manual_approval",
    label: "Require Manual Approval",
    description: "All new bookings must be manually approved by admin.",
    icon: ClipboardCheck,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
    auditOn: "booking.status_changed",
    auditOff: "booking.status_changed",
    summaryOn: (h, r) => `Manual booking approval required for ${h.full_name}: ${r}`,
    summaryOff: (h) => `Manual approval requirement removed for ${h.full_name}`,
  },
  {
    key: "host_under_review",
    label: "Place Under Review",
    description: "Mark host as under operational review.",
    icon: Eye,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/30",
    auditOn: "admin.override",
    auditOff: "admin.override",
    summaryOn: (h, r) => `${h.full_name} placed under operational review: ${r}`,
    summaryOff: (h) => `${h.full_name} removed from operational review`,
  },
];

export default function HostRestrictionsPanel({ host, onClose }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [reason, setReason] = useState(host.restriction_reason || "");
  const [adminNotes, setAdminNotes] = useState(host.restriction_admin_notes || "");
  const [expiresAt, setExpiresAt] = useState(
    host.restriction_expires_at ? host.restriction_expires_at.split("T")[0] : ""
  );
  const [saving, setSaving] = useState(null);

  const hasAnyRestriction = host.payout_frozen || host.booking_blocked || host.require_manual_approval || host.host_under_review;

  const toggleRestriction = async (restriction, currentValue) => {
    if (!currentValue && !reason.trim()) {
      alert("Please provide a reason before applying a restriction.");
      return;
    }
    setSaving(restriction.key);
    try {
      const now = new Date().toISOString();
      const turningOn = !currentValue;

      const update = {
        [restriction.key]: turningOn,
        restriction_reason: turningOn ? reason.trim() : (host.restriction_reason || ""),
        restriction_admin_notes: adminNotes.trim(),
        restriction_set_by: turningOn ? (user?.email || "admin") : host.restriction_set_by,
        restriction_set_at: turningOn ? now : host.restriction_set_at,
        restriction_expires_at: turningOn && expiresAt ? new Date(expiresAt).toISOString() : null,
      };

      await base44.entities.Host.update(host.id, update);

      // Audit log
      await base44.entities.ActivityEvent.create({
        event_type: turningOn ? restriction.auditOn : restriction.auditOff,
        actor_email: user?.email,
        actor_role: "admin",
        target_entity: "Host",
        target_id: host.id,
        target_label: host.full_name,
        host_id: host.id,
        summary: turningOn
          ? restriction.summaryOn(host, reason)
          : restriction.summaryOff(host),
        event_status: "success",
        source: "admin_panel",
        metadata: {
          restriction_key: restriction.key,
          action: turningOn ? "enabled" : "disabled",
          reason: turningOn ? reason : "",
          expires_at: turningOn && expiresAt ? expiresAt : null,
        },
      });

      qc.invalidateQueries({ queryKey: ["admin-hosts"] });
      // Refresh local state from re-fetch
      onClose();
    } finally {
      setSaving(null);
    }
  };

  const clearAllRestrictions = async () => {
    if (!confirm("Clear all restrictions for this host?")) return;
    setSaving("all");
    try {
      await base44.entities.Host.update(host.id, {
        payout_frozen: false,
        booking_blocked: false,
        require_manual_approval: false,
        host_under_review: false,
        restriction_reason: "",
        restriction_admin_notes: "",
        restriction_expires_at: null,
      });
      await base44.entities.ActivityEvent.create({
        event_type: "admin.override",
        actor_email: user?.email,
        actor_role: "admin",
        target_entity: "Host",
        target_id: host.id,
        target_label: host.full_name,
        host_id: host.id,
        summary: `All operational restrictions cleared for ${host.full_name}`,
        event_status: "success",
        source: "admin_panel",
        metadata: { action: "clear_all_restrictions" },
      });
      qc.invalidateQueries({ queryKey: ["admin-hosts"] });
      onClose();
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-md glass rounded-2xl border border-border p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-foreground">Operational Restrictions</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{host.full_name} · {host.email}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg bg-muted/40 flex items-center justify-center hover:bg-muted/60">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Restrictions */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">Restrictions</p>
          {RESTRICTIONS.map(r => {
            const Icon = r.icon;
            const isActive = !!host[r.key];
            return (
              <div key={r.key} className={`flex items-center justify-between p-3 rounded-xl border ${
                isActive ? `${r.bg} ${r.color}` : "bg-muted/20 border-border"
              }`}>
                <div className="flex items-center gap-2.5">
                  <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? r.color : "text-muted-foreground"}`} />
                  <div>
                    <p className={`text-xs font-bold ${isActive ? r.color : "text-foreground"}`}>{r.label}</p>
                    <p className="text-[10px] text-muted-foreground">{r.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleRestriction(r, isActive)}
                  disabled={saving === r.key}
                  className={`flex-shrink-0 ml-3 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 ${
                    isActive
                      ? "bg-muted/40 text-muted-foreground hover:bg-muted/60 border border-border"
                      : "text-white"
                  }`}
                  style={!isActive ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}
                >
                  {saving === r.key ? "..." : isActive ? "Remove" : "Enable"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Reason & admin notes */}
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">
              Reason <span className="text-primary">*required when enabling</span>
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Reason for restriction (audit trail)"
              className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Admin Notes</p>
            <textarea
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes (not visible to host)"
              className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Auto-Expiry Date (optional)</p>
            <input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="w-full h-9 px-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Existing restriction info */}
        {host.restriction_set_by && (
          <div className="bg-muted/20 rounded-xl p-3">
            <p className="text-[10px] text-muted-foreground">
              Last set by <span className="text-foreground font-semibold">{host.restriction_set_by}</span>
              {host.restriction_set_at && ` on ${new Date(host.restriction_set_at).toLocaleDateString()}`}
            </p>
            {host.restriction_expires_at && (
              <p className="text-[10px] text-yellow-400 mt-0.5">
                Expires: {new Date(host.restriction_expires_at).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* Clear all */}
        {hasAnyRestriction && (
          <button
            onClick={clearAllRestrictions}
            disabled={saving === "all"}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            {saving === "all" ? "Clearing..." : "Clear All Restrictions"}
          </button>
        )}
      </div>
    </div>
  );
}