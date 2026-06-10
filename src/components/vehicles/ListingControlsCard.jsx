import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

function VisibilityRow({ label, value, onEnable, onDisable, loading }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2">
        {value ? <Eye className="h-3.5 w-3.5 text-green-400" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-sm">{label}</span>
        <Badge className={value ? "bg-green-500/20 text-green-400 text-xs" : "bg-muted text-muted-foreground text-xs"}>
          {value ? "Visible" : "Hidden"}
        </Badge>
      </div>
      <div className="flex gap-1">
        {!value && (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={loading} onClick={onEnable}>Enable</Button>
        )}
        {value && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-red-400" disabled={loading} onClick={onDisable}>Hide</Button>
        )}
      </div>
    </div>
  );
}

export default function ListingControlsCard({ vehicle, onUpdate }) {
  const [saving, setSaving] = useState(false);

  const update = async (fields) => {
    setSaving(true);
    await base44.entities.Vehicle.update(vehicle.id, fields);
    setSaving(false);
    onUpdate?.();
  };

  if (!vehicle) return null;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          Admin Listing Controls
        </CardTitle>
        <p className="text-xs text-muted-foreground">Only modifies listing visibility — does not affect vehicle status or bookings.</p>
      </CardHeader>
      <CardContent className="space-y-0">
        <VisibilityRow
          label="Storefront Visibility"
          value={vehicle.storefront_visible !== false}
          onEnable={() => update({ storefront_visible: true })}
          onDisable={() => update({ storefront_visible: false })}
          loading={saving}
        />
        <VisibilityRow
          label="Marketplace Visibility (Host)"
          value={vehicle.marketplace_visible !== false}
          onEnable={() => update({ marketplace_visible: true })}
          onDisable={() => update({ marketplace_visible: false })}
          loading={saving}
        />
        <VisibilityRow
          label="Marketplace Approval (Admin)"
          value={vehicle.admin_marketplace_approved !== false}
          onEnable={() => update({ admin_marketplace_approved: true })}
          onDisable={() => update({ admin_marketplace_approved: false })}
          loading={saving}
        />
        {/* Summary */}
        <div className="pt-3 flex flex-wrap gap-2">
          {vehicle.status === "Available" && vehicle.approval_status === "approved" && vehicle.storefront_visible !== false && (
            <Badge className="bg-blue-500/20 text-blue-400 text-xs"><CheckCircle className="h-3 w-3 mr-1" />On Storefront</Badge>
          )}
          {vehicle.status === "Available" && vehicle.approval_status === "approved" && vehicle.marketplace_visible !== false && vehicle.admin_marketplace_approved !== false && (
            <Badge className="bg-green-500/20 text-green-400 text-xs"><CheckCircle className="h-3 w-3 mr-1" />On Marketplace</Badge>
          )}
          {vehicle.admin_marketplace_approved === false && (
            <Badge className="bg-red-500/20 text-red-400 text-xs"><XCircle className="h-3 w-3 mr-1" />Marketplace Blocked by Admin</Badge>
          )}
          {vehicle.marketplace_visible === false && (
            <Badge className="bg-muted text-muted-foreground text-xs"><EyeOff className="h-3 w-3 mr-1" />Marketplace Hidden by Host</Badge>
          )}
          {vehicle.storefront_visible === false && (
            <Badge className="bg-muted text-muted-foreground text-xs"><EyeOff className="h-3 w-3 mr-1" />Storefront Hidden</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}