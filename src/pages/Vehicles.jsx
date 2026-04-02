import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Car, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import VehicleFormDialog from "@/components/vehicles/VehicleFormDialog";

export default function Vehicles() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const queryClient = useQueryClient();

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => base44.entities.Vehicle.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Vehicle.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vehicle.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setDialogOpen(false);
      setEditingVehicle(null);
    },
  });

  const handleSave = (data) => {
    if (editingVehicle) {
      updateMutation.mutate({ id: editingVehicle.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns = [
    { key: "vehicle", label: "Vehicle", render: (r) => (
      <div>
        <p className="font-medium">{r.year} {r.make} {r.model}</p>
        <p className="text-xs text-muted-foreground">{r.color}</p>
      </div>
    )},
    { key: "plate", label: "Plate", render: (r) => r.plate || "—" },
    { key: "vin", label: "VIN", render: (r) => r.vin ? <span className="font-mono text-xs">{r.vin}</span> : "—" },
    { key: "current_city", label: "City", render: (r) => r.current_city || "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "weekly_rate", label: "Weekly Rate", render: (r) => r.weekly_rate ? `$${r.weekly_rate}` : "—" },
    { key: "mileage", label: "Mileage", render: (r) => r.mileage ? r.mileage.toLocaleString() : "—" },
    { key: "rto", label: "RTO", render: (r) => r.rent_to_own_eligible ? "✓" : "—" },
  ];

  if (!isLoading && vehicles.length === 0) {
    return (
      <>
        <EmptyState icon={Car} title="No vehicles yet" description="Add your first vehicle to the fleet." actionLabel="Add Vehicle" onAction={() => setDialogOpen(true)} />
        <VehicleFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{vehicles.length} vehicles</p>
        <Button onClick={() => { setEditingVehicle(null); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add Vehicle
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={vehicles}
        isLoading={isLoading}
        onRowClick={(row) => { setEditingVehicle(row); setDialogOpen(true); }}
      />
      <VehicleFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingVehicle(null); }}
        onSave={handleSave}
        vehicle={editingVehicle}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}