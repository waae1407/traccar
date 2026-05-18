import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/useTenant";
import { Car, ImageIcon, CheckCircle, Loader2 } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import VehicleFormDialog from "@/components/vehicles/VehicleFormDialog";
import { toast } from "sonner";

export default function Vehicles() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [regenState, setRegenState] = useState("idle"); // idle | running | done
  const queryClient = useQueryClient();
  const { tenantFilter, companyId } = useTenant();
  const scopeKey = companyId || "all";

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles", scopeKey],
    queryFn: () => base44.entities.Vehicle.filter(tenantFilter(), "-created_date"),
  });

  const { data: hosts = [] } = useQuery({
    queryKey: ["hosts-all"],
    queryFn: () => base44.entities.Host.list("-created_date", 200),
  });
  const hostMap = Object.fromEntries(hosts.map(h => [h.id, h]));

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Vehicle.create({ ...data, ...tenantFilter() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicles", scopeKey] }); setDialogOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vehicle.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicles", scopeKey] }); setDialogOpen(false); setEditingVehicle(null); },
  });

  const handleSave = async (data) => {
    if (editingVehicle) {
      const wasBooked = editingVehicle.status === "Booked";
      const nowAvailable = data.status === "Available";

      // If vehicle is being moved from Booked → Available, cancel the active booking and notify customer
      if (wasBooked && nowAvailable) {
        try {
          const activeBookings = await base44.entities.BookingRequest.filter({
            vehicle_id: editingVehicle.id,
          });
          const active = activeBookings.find((b) =>
            ["active", "confirmed", "approved", "pending_review", "pending_payment"].includes(b.booking_status)
          );
          if (active) {
            await base44.entities.BookingRequest.update(active.id, {
              booking_status: "cancelled",
              payment_status: active.payment_status === "paid" ? "refunded" : active.payment_status,
            });
            if (active.user_email) {
              await base44.entities.Notification.create({
                user_email: active.user_email,
                title: "Booking Cancelled",
                body: `Your booking for ${editingVehicle.year} ${editingVehicle.make} ${editingVehicle.model} has been cancelled by the admin. Please contact us if you have questions.`,
                type: "booking",
                booking_request_id: active.id,
              });
            }
            toast.success("Booking cancelled and customer notified.");
          }
        } catch (err) {
          toast.error("Vehicle updated but failed to notify customer.");
        }
      }

      updateMutation.mutate({ id: editingVehicle.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns = [
    { key: "vehicle", label: "Vehicle", render: (r) => (
      <div>
        <p className="font-semibold text-white">{r.year} {r.make} {r.model}</p>
        <p className="text-xs text-white/35 mt-0.5">{r.color}</p>
      </div>
    )},
    { key: "plate", label: "Plate", render: (r) => r.plate
      ? <span className="font-mono text-xs px-2 py-1 rounded-lg bg-white/[0.06] text-white/70 border border-white/[0.08]">{r.plate}</span>
      : <span className="text-white/20">—</span> },
    { key: "vin", label: "VIN", render: (r) => r.vin
      ? <span className="font-mono text-xs text-white/40">{r.vin}</span>
      : <span className="text-white/20">—</span> },
    { key: "city", label: "City", render: (r) => <span className="text-white/60">{r.city || r.current_city || "—"}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "weekly_rate", label: "Weekly Rate", render: (r) => r.weekly_rate
      ? <span className="font-semibold text-green-400">${r.weekly_rate}</span>
      : <span className="text-white/20">—</span> },
    { key: "mileage", label: "Mileage", render: (r) => r.mileage
      ? <span className="text-white/60">{r.mileage.toLocaleString()} mi</span>
      : <span className="text-white/20">—</span> },
    { key: "host", label: "Host", render: (r) => {
      const h = r.host_id ? hostMap[r.host_id] : null;
      return h
        ? <span className="text-xs text-white/70">{h.full_name}{h.business_name ? ` — ${h.business_name}` : ""}</span>
        : <span className="text-white/20 text-xs">Admin fleet</span>;
    }},
    { key: "rto", label: "RTO", render: (r) => r.rent_to_own_eligible
      ? <span className="text-xs font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-lg border border-purple-500/20">Eligible</span>
      : <span className="text-white/20">—</span> },
  ];

  if (!isLoading && vehicles.length === 0) {
    return (
      <>
        <EmptyState icon={Car} title="No vehicles yet" description="Add your first vehicle to start building your fleet." actionLabel="Add Vehicle" onAction={() => setDialogOpen(true)} />
        <VehicleFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
      </>
    );
  }

  const outOfServiceCount = vehicles.filter((v) => v.status === "Out of Service").length;

  const handleRegenAll = async () => {
    setRegenState("running");
    try {
      await base44.functions.invoke("regenerateAllVehicleImages", {});
      setRegenState("done");
      queryClient.invalidateQueries({ queryKey: ["vehicles", scopeKey] });
      setTimeout(() => setRegenState("idle"), 4000);
    } catch (e) {
      toast.error("Regeneration failed: " + e.message);
      setRegenState("idle");
    }
  };

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-4">
        <PageHeader count={vehicles.length} countLabel="vehicles" onAdd={() => { setEditingVehicle(null); setDialogOpen(true); }} addLabel="Add Vehicle" />
        <button
          onClick={handleRegenAll}
          disabled={regenState !== "idle"}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white disabled:opacity-60 transition-all"
          style={{ background: "linear-gradient(135deg, hsl(199 90% 44%), hsl(265 80% 55%))" }}
        >
          {regenState === "running" && <><Loader2 className="h-4 w-4 animate-spin" /> Regenerating…</>}
          {regenState === "done" && <><CheckCircle className="h-4 w-4" /> Done!</>}
          {regenState === "idle" && <><ImageIcon className="h-4 w-4" /> Regenerate All Images</>}
        </button>
      </div>
      {outOfServiceCount > 0 && (
        <div className="mb-4 p-4 rounded-2xl border border-red-500/30 flex items-center gap-3"
          style={{ background: "hsl(0 72% 58% / 0.08)" }}>
          <span className="text-red-400 text-lg">🔴</span>
          <p className="text-sm font-bold text-red-300">
            {outOfServiceCount} vehicle{outOfServiceCount > 1 ? "s" : ""} Out of Service — inspect and manually set to Available when cleared.
          </p>
        </div>
      )}
      <DataTable columns={columns} data={vehicles} isLoading={isLoading}
        onRowClick={(row) => { setEditingVehicle(row); setDialogOpen(true); }} />
      <VehicleFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingVehicle(null); }}
        onSave={handleSave} vehicle={editingVehicle}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}