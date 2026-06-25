import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Save, Settings2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function AvailabilityQuickEdit({ vehicle, hostId }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    minimum_rental_days: vehicle?.minimum_rental_days ?? 7,
    advance_notice_hours: vehicle?.advance_notice_hours ?? 0,
    pickup_window_start: vehicle?.pickup_window_start || "",
    pickup_window_end: vehicle?.pickup_window_end || "",
    return_window_start: vehicle?.return_window_start || "",
    return_window_end: vehicle?.return_window_end || "",
    delivery_available: vehicle?.delivery_available ?? false,
    contactless_pickup: vehicle?.contactless_pickup ?? false,
    instant_booking_enabled: vehicle?.instant_booking_enabled ?? true,
    available_by_default: vehicle?.available_by_default ?? true,
  });

  const [editing, setEditing] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Vehicle.update(vehicle.id, data),
    onSuccess: () => {
      toast({ title: "Updated", description: "Availability settings saved" });
      qc.invalidateQueries({ queryKey: ["vehicle-availability-calendar"] });
      qc.invalidateQueries({ queryKey: ["vehicle360_host"] });
      setEditing(false);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = () => {
    updateMutation.mutate({
      minimum_rental_days: Number(form.minimum_rental_days) || 7,
      advance_notice_hours: Number(form.advance_notice_hours) || 0,
      pickup_window_start: form.pickup_window_start || null,
      pickup_window_end: form.pickup_window_end || null,
      return_window_start: form.return_window_start || null,
      return_window_end: form.return_window_end || null,
      delivery_available: form.delivery_available,
      contactless_pickup: form.contactless_pickup,
      instant_booking_enabled: form.instant_booking_enabled,
      available_by_default: form.available_by_default,
    });
  };

  const toggleClass = (key) => {
    const on = form[key];
    return (
      <button
        type="button"
        onClick={() => editing && set(key, !on)}
        disabled={!editing}
        className={`relative h-5 w-9 rounded-full transition-colors flex-shrink-0 ${on ? "bg-primary" : "bg-muted"} ${!editing ? "opacity-50" : ""}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : "left-0.5"}`} />
      </button>
    );
  };

  const inputCls = editing
    ? "w-full h-9 rounded-lg border border-border bg-input text-sm px-2 text-foreground"
    : "w-full h-9 rounded-lg border border-border/50 bg-muted/30 text-sm px-2 text-muted-foreground cursor-default";

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Quick Edit — Availability Settings</h3>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : (
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="h-3 w-3 mr-1" />
            {updateMutation.isPending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Minimum Rental (days)</Label>
          <input
            type="number"
            min="1"
            disabled={!editing}
            className={inputCls + " mt-1"}
            value={form.minimum_rental_days}
            onChange={(e) => set("minimum_rental_days", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Advance Notice (hours)</Label>
          <input
            type="number"
            min="0"
            disabled={!editing}
            className={inputCls + " mt-1"}
            value={form.advance_notice_hours}
            onChange={(e) => set("advance_notice_hours", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Pickup Window Start</Label>
          <input
            type="time"
            disabled={!editing}
            className={inputCls + " mt-1"}
            value={form.pickup_window_start}
            onChange={(e) => set("pickup_window_start", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Pickup Window End</Label>
          <input
            type="time"
            disabled={!editing}
            className={inputCls + " mt-1"}
            value={form.pickup_window_end}
            onChange={(e) => set("pickup_window_end", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Return Window Start</Label>
          <input
            type="time"
            disabled={!editing}
            className={inputCls + " mt-1"}
            value={form.return_window_start}
            onChange={(e) => set("return_window_start", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Return Window End</Label>
          <input
            type="time"
            disabled={!editing}
            className={inputCls + " mt-1"}
            value={form.return_window_end}
            onChange={(e) => set("return_window_end", e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-border/50">
        <div className="flex items-center gap-2">
          {toggleClass("instant_booking_enabled")}
          <span className="text-sm text-muted-foreground">Instant Booking</span>
        </div>
        <div className="flex items-center gap-2">
          {toggleClass("delivery_available")}
          <span className="text-sm text-muted-foreground">Delivery Available</span>
        </div>
        <div className="flex items-center gap-2">
          {toggleClass("contactless_pickup")}
          <span className="text-sm text-muted-foreground">Contactless Pickup</span>
        </div>
        <div className="flex items-center gap-2">
          {toggleClass("available_by_default")}
          <span className="text-sm text-muted-foreground">Available by Default</span>
        </div>
      </div>
    </Card>
  );
}