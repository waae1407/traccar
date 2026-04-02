import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wrench, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import DataTable from "@/components/shared/DataTable";
import EmptyState from "@/components/shared/EmptyState";
import MaintenanceFormDialog from "@/components/maintenance/MaintenanceFormDialog";
import { format } from "date-fns";

export default function MaintenancePage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const queryClient = useQueryClient();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["maintenance"],
    queryFn: () => base44.entities.Maintenance.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Maintenance.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      setDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Maintenance.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      setDialogOpen(false);
      setEditingRecord(null);
    },
  });

  const handleSave = (data) => {
    if (editingRecord) {
      updateMutation.mutate({ id: editingRecord.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns = [
    { key: "vehicle_name", label: "Vehicle", render: (r) => <span className="font-medium">{r.vehicle_name || "—"}</span> },
    { key: "service_type", label: "Service Type" },
    { key: "cost", label: "Cost", render: (r) => r.cost ? `$${r.cost.toLocaleString()}` : "—" },
    { key: "date", label: "Date", render: (r) => r.date ? format(new Date(r.date), "MMM d, yyyy") : "—" },
    { key: "next_service_due", label: "Next Due", render: (r) => r.next_service_due ? format(new Date(r.next_service_due), "MMM d, yyyy") : "—" },
    { key: "notes", label: "Notes", render: (r) => r.notes ? <span className="truncate max-w-[200px] block text-sm">{r.notes}</span> : "—" },
  ];

  if (!isLoading && records.length === 0) {
    return (
      <>
        <EmptyState icon={Wrench} title="No maintenance records" description="Log your first maintenance service." actionLabel="Log Maintenance" onAction={() => setDialogOpen(true)} />
        <MaintenanceFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{records.length} records</p>
        <Button onClick={() => { setEditingRecord(null); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Log Maintenance
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={records}
        isLoading={isLoading}
        onRowClick={(row) => { setEditingRecord(row); setDialogOpen(true); }}
      />
      <MaintenanceFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingRecord(null); }}
        onSave={handleSave}
        record={editingRecord}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}