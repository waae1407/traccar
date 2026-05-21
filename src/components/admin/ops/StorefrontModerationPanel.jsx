import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { X, Globe, AlertTriangle, EyeOff, Flag, CheckCircle2, ExternalLink } from "lucide-react";

const MODERATION_ACTIONS = [
  {
    key: "suspended",
    label: "Suspend",
    description: "Block public access immediately. Bookings cannot be made.",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/30 hover:bg-red-500/20",
    icon: AlertTriangle,
  },
  {
    key: "unpublished",
    label: "Unpublish",
    description: "Remove from public view. Host retains draft access.",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20",
    icon: EyeOff,
  },
  {
    key: "under_review",
    label: "Flag for Review",
    description: "Mark as under review. Store becomes inaccessible publicly.",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20",
    icon: Flag,
  },
  {
    key: "active",
    label: "Restore / Approve",
    description: "Clear all moderation flags. Store returns to normal live status.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20",
    icon: CheckCircle2,
  },
];

const STATUS_LABELS = {
  active: { label: "Active", color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/30" },
  suspended: { label: "Suspended", color: "text-red-400", bg: "bg-red-500/20 border-red-500/30" },
  unpublished: { label: "Unpublished", color: "text-orange-400", bg: "bg-orange-500/20 border-orange-500/30" },
  under_review: { label: "Under Review", color: "text-yellow-400", bg: "bg-yellow-500/20 border-yellow-500/30" },
};

export default function StorefrontModerationPanel({ brand, host, onClose }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedAction, setSelectedAction] = useState(null);
  const [reason, setReason] = useState("");
  const [hostVisibleReason, setHostVisibleReason] = useState("");
  const [adminNotes, setAdminNotes] = useState(brand?.admin_moderation_notes || "");
  const [saving, setSaving] = useState(false);

  const currentStatus = brand?.moderation_status || "active";
  const statusCfg = STATUS_LABELS[currentStatus] || STATUS_LABELS.active;
  const storeUrl = `/host/${brand?.business_slug}`;

  const handleApply = async () => {
    if (!selectedAction) return;
    if (selectedAction !== "active" && !reason.trim()) {
      alert("Please provide a reason for this moderation action.");
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();

      // Update brand settings
      await base44.entities.HostBrandSettings.update(brand.id, {
        moderation_status: selectedAction,
        suspension_reason: selectedAction !== "active" ? reason.trim() : "",
        host_visible_reason: hostVisibleReason.trim() || "",
        admin_moderation_notes: adminNotes.trim(),
        moderated_at: now,
        moderated_by: user?.email || "admin",
      });

      // Map to event type for audit log
      const eventTypeMap = {
        suspended: "storefront.unpublished",
        unpublished: "storefront.unpublished",
        under_review: "storefront.unpublished",
        active: "storefront.published",
      };

      const summaryMap = {
        suspended: `Storefront suspended: ${reason}`,
        unpublished: `Storefront unpublished: ${reason}`,
        under_review: `Storefront flagged for review: ${reason}`,
        active: "Storefront moderation cleared — restored to active",
      };

      // Log ActivityEvent
      await base44.entities.ActivityEvent.create({
        event_type: eventTypeMap[selectedAction],
        actor_email: user?.email,
        actor_role: "admin",
        target_entity: "HostBrandSettings",
        target_id: brand.id,
        target_label: brand.business_display_name || brand.business_slug,
        host_id: brand.host_id,
        summary: summaryMap[selectedAction],
        event_status: "success",
        source: "admin_panel",
        metadata: {
          moderation_action: selectedAction,
          reason,
          host_visible_reason: hostVisibleReason,
          admin_notes: adminNotes,
          business_slug: brand.business_slug,
        },
      });

      qc.invalidateQueries({ queryKey: ["ops-storefronts"] });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-5 space-y-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-foreground">
            {brand?.business_display_name || brand?.business_slug}
          </h3>
          <p className="text-xs text-muted-foreground font-mono">/{brand?.business_slug}</p>
          {host && <p className="text-xs text-muted-foreground mt-0.5">{host.full_name} · {host.email}</p>}
        </div>
        <button onClick={onClose} className="h-8 w-8 rounded-lg bg-muted/40 flex items-center justify-center hover:bg-muted/60">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Current status */}
      <div className="flex items-center gap-3">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${statusCfg.bg} ${statusCfg.color}`}>
          {statusCfg.label}
        </span>
        {brand?.published_status === "live" && (
          <a href={storeUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> View Store
          </a>
        )}
      </div>

      {/* Existing suspension info */}
      {currentStatus !== "active" && brand?.suspension_reason && (
        <div className="bg-muted/30 rounded-xl p-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Current Reason</p>
          <p className="text-xs text-foreground">{brand.suspension_reason}</p>
        </div>
      )}

      {/* Action selection */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Moderation Action</p>
        <div className="space-y-2">
          {MODERATION_ACTIONS.filter(a => a.key !== currentStatus).map(action => {
            const Icon = action.icon;
            const isSelected = selectedAction === action.key;
            return (
              <button key={action.key} onClick={() => setSelectedAction(action.key)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  isSelected
                    ? `${action.bg} border-current ring-1 ring-current/30`
                    : "border-border bg-muted/20 hover:bg-muted/40"
                }`}>
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 flex-shrink-0 ${isSelected ? action.color : "text-muted-foreground"}`} />
                  <div>
                    <p className={`text-xs font-bold ${isSelected ? action.color : "text-foreground"}`}>{action.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug">{action.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reason fields — only when not restoring */}
      {selectedAction && selectedAction !== "active" && (
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Reason (Internal) *</p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Why is this storefront being moderated? (admin-only)"
              className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Host-Visible Message (optional)</p>
            <input
              type="text"
              value={hostVisibleReason}
              onChange={e => setHostVisibleReason(e.target.value)}
              placeholder="Message shown to the host (leave blank to keep private)"
              className="w-full h-9 px-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      )}

      {/* Admin notes (always visible) */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Admin Notes</p>
        <textarea
          value={adminNotes}
          onChange={e => setAdminNotes(e.target.value)}
          rows={3}
          placeholder="Ongoing admin notes about this storefront..."
          className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary resize-none"
        />
      </div>

      <button
        onClick={handleApply}
        disabled={saving || !selectedAction}
        className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
      >
        {saving ? "Applying..." : selectedAction ? `Apply — ${MODERATION_ACTIONS.find(a => a.key === selectedAction)?.label}` : "Select an action"}
      </button>
    </div>
  );
}