import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, CheckCircle, XCircle, Lock } from "lucide-react";

/**
 * Admin-only Listing Controls card shown on Vehicle 360.
 * Accepts hostPlan to apply correct plan rules to displayed status.
 * Admin can never force a FleetOS vehicle onto the marketplace.
 */

function planLabel(plan) {
  if (plan === "marketplace_partner") return "Marketplace Partner";
  if (plan === "hybrid_growth") return "Hybrid Growth";
  if (plan === "fleetos_professional") return "FleetOS Professional";
  return plan || "Unknown";
}

function deriveMarketplaceStatus(vehicle, hostPlan) {
  if (hostPlan === "fleetos_professional") return "blocked_by_plan_fleetos";
  if (vehicle.status !== "Available") return "blocked_by_vehicle_status";
  if (vehicle.approval_status !== "approved") return "blocked_by_vehicle_status";
  if (vehicle.admin_marketplace_approved === false) return "blocked_by_admin";
  if (hostPlan === "marketplace_partner") return "automatic_marketplace_partner";
  // hybrid_growth or unknown
  if (vehicle.marketplace_visible === false) return "hidden_by_hybrid_host";
  return "visible";
}

function deriveStorefrontStatus(vehicle, hostPlan) {
  if (vehicle.status !== "Available") return "blocked_by_vehicle_status";
  if (vehicle.approval_status !== "approved") return "blocked_by_vehicle_status";
  if (hostPlan === "marketplace_partner") return "automatic_marketplace_partner";
  if (vehicle.storefront_visible === false) return "hidden_by_host";
  return "visible";
}

const MKT_LABELS = {
  visible: { label: "Visible on Marketplace", color: "bg-green-500/20 text-green-400" },
  automatic_marketplace_partner: { label: "Auto-Listed (MP)", color: "bg-green-500/20 text-green-400" },
  hidden_by_hybrid_host: { label: "Hidden by Host", color: "bg-muted text-muted-foreground" },
  blocked_by_admin: { label: "Blocked by Admin", color: "bg-red-500/20 text-red-400" },
  blocked_by_plan_fleetos: { label: "Blocked — FleetOS Plan", color: "bg-orange-500/20 text-orange-400" },
  blocked_by_inactive_hybrid_subscription: { label: "Blocked — Inactive Sub", color: "bg-yellow-500/20 text-yellow-400" },
  blocked_by_vehicle_status: { label: "Blocked — Vehicle Status", color: "bg-muted text-muted-foreground" },
  blocked_by_host_status: { label: "Blocked — Host Status", color: "bg-red-500/20 text-red-400" },
};

const SF_LABELS = {
  visible: { label: "Visible on Storefront", color: "bg-blue-500/20 text-blue-400" },
  automatic_marketplace_partner: { label: "Auto-Visible (MP)", color: "bg-blue-500/20 text-blue-400" },
  hidden_by_host: { label: "Hidden by Host", color: "bg-muted text-muted-foreground" },
  storefront_not_published: { label: "Storefront Not Published", color: "bg-muted text-muted-foreground" },
  store_suspended: { label: "Store Suspended", color: "bg-red-500/20 text-red-400" },
  blocked_by_vehicle_status: { label: "Blocked — Vehicle Status", color: "bg-muted text-muted-foreground" },
};

function StatusBadge({ map, key }) {
  const entry = map[key] || { label: key, color: "bg-muted text-muted-foreground" };
  return <Badge className={`text-xs ${entry.color}`}>{entry.label}</Badge>;
}

function VisibilityRow({ label, value, onEnable, onDisable, locked, lockedReason, loading }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2 flex-wrap">
        {locked ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : value ? <Eye className="h-3.5 w-3.5 text-green-400" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-sm">{label}</span>
        {locked ? (
          <Badge className="bg-orange-500/20 text-orange-400 text-xs">{lockedReason || "Plan Locked"}</Badge>
        ) : (
          <Badge className={value ? "bg-green-500/20 text-green-400 text-xs" : "bg-muted text-muted-foreground text-xs"}>
            {value ? "On" : "Off"}
          </Badge>
        )}
      </div>
      {!locked && (
        <div className="flex gap-1">
          {!value && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={loading} onClick={onEnable}>Enable</Button>}
          {value && <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-red-400" disabled={loading} onClick={onDisable}>Hide</Button>}
        </div>
      )}
    </div>
  );
}

export default function ListingControlsCard({ vehicle, hostPlan, onUpdate }) {
  const [saving, setSaving] = useState(false);

  const update = async (fields) => {
    setSaving(true);
    await base44.entities.Vehicle.update(vehicle.id, fields);
    setSaving(false);
    onUpdate?.();
  };

  if (!vehicle) return null;

  const isFleetOS = hostPlan === "fleetos_professional";
  const isMarketplacePartner = hostPlan === "marketplace_partner" || !hostPlan;
  const mktStatus = deriveMarketplaceStatus(vehicle, hostPlan);
  const sfStatus = deriveStorefrontStatus(vehicle, hostPlan);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          Admin Listing Controls
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">Host Plan:</p>
          <Badge className="bg-secondary text-secondary-foreground text-xs">{planLabel(hostPlan)}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Listing fields only — does not affect vehicle status, bookings, or compliance.</p>
      </CardHeader>
      <CardContent className="space-y-0">
        {/* Storefront visibility — always admin-editable */}
        <VisibilityRow
          label="Storefront Visibility"
          value={vehicle.storefront_visible !== false}
          onEnable={() => update({ storefront_visible: true })}
          onDisable={() => update({ storefront_visible: false })}
          loading={saving}
        />

        {/* Marketplace host toggle — locked for Marketplace Partner (auto) and FleetOS (blocked) */}
        <VisibilityRow
          label="Marketplace Visibility (Host Setting)"
          value={vehicle.marketplace_visible !== false}
          onEnable={() => update({ marketplace_visible: true })}
          onDisable={() => update({ marketplace_visible: false })}
          locked={isMarketplacePartner || isFleetOS}
          lockedReason={isFleetOS ? "FleetOS Blocked" : "Auto (MP)"}
          loading={saving}
        />

        {/* Admin approval gate — not applicable for FleetOS */}
        <VisibilityRow
          label="Marketplace Approval (Admin Gate)"
          value={vehicle.admin_marketplace_approved !== false}
          onEnable={() => update({ admin_marketplace_approved: true })}
          onDisable={() => update({ admin_marketplace_approved: false })}
          locked={isFleetOS}
          lockedReason="FleetOS — N/A"
          loading={saving}
        />

        {/* Derived status summary */}
        <div className="pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground w-24">Marketplace:</p>
            <StatusBadge map={MKT_LABELS} key={mktStatus} />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground w-24">Storefront:</p>
            <StatusBadge map={SF_LABELS} key={sfStatus} />
          </div>
          {isFleetOS && (
            <p className="text-[10px] text-orange-400/80 pt-1 leading-relaxed">
              FleetOS Professional vehicles are not eligible for uRide Marketplace listing. To list on the marketplace, the host must switch to Marketplace Partner or Hybrid Growth.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}