import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/useTenant";
import { Car } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import VehicleFormDialog from "@/components/vehicles/VehicleFormDialog";

export default function Vehicles() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const queryClient = useQueryClient();
  const { tenantFilter, companyId } = useTenant();
  const scopeKey = companyId || "all";

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles", scopeKey],
    queryFn: () => base44.entities.Vehicle.filter(tenantFilter(), "-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Vehicle.create({ ...data, ...tenantFilter() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicles", scopeKey] }); setDialogOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vehicle.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vehicles", scopeKey] }); setDialogOpen(false); setEditingVehicle(null); },
  });

  const handleSave = (data) => {
    if (editingVehicle) updateMutation.mutate({ id: editingVehicle.id, data });
    else createMutation.mutate(data);
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
    { key: "current_city", label: "City", render: (r) => <span className="text-white/60">{r.current_city || "—"}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "weekly_rate", label: "Weekly Rate", render: (r) => r.weekly_rate
      ? <span className="font-semibold text-green-400">${r.weekly_rate}</span>
      : <span className="text-white/20">—</span> },
    { key: "mileage", label: "Mileage", render: (r) => r.mileage
      ? <span className="text-white/60">{r.mileage.toLocaleString()} mi</span>
      : <span className="text-white/20">—</span> },
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

  return (
    <div className="animate-fade-in-up">
      <PageHeader count={vehicles.length} countLabel="vehicles" onAdd={() => { setEditingVehicle(null); setDialogOpen(true); }} addLabel="Add Vehicle" />
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