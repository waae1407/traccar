import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["maintenance"] }); setDialogOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Maintenance.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["maintenance"] }); setDialogOpen(false); setEditingRecord(null); },
  });

  const handleSave = (data) => {
    if (editingRecord) updateMutation.mutate({ id: editingRecord.id, data });
    else createMutation.mutate(data);
  };

  const columns = [
    { key: "vehicle_name", label: "Vehicle", render: (r) => (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-xl flex items-center justify-center bg-yellow-500/10 border border-yellow-500/20 flex-shrink-0">
          <Wrench className="h-3.5 w-3.5 text-yellow-400" />
        </div>
        <span className="font-medium text-white">{r.vehicle_name || "—"}</span>
      </div>
    )},
    { key: "service_type", label: "Service Type", render: (r) => (
      <span className="text-white/80">{r.service_type}</span>
    )},
    { key: "cost", label: "Cost", render: (r) => r.cost
      ? <span className="font-semibold text-white">${r.cost.toLocaleString()}</span>
      : <span className="text-white/20">—</span> },
    { key: "date", label: "Date", render: (r) => r.date
      ? <span className="text-white/60">{format(new Date(r.date), "MMM d, yyyy")}</span>
      : <span className="text-white/20">—</span> },
    { key: "next_service_due", label: "Next Due", render: (r) => {
      if (!r.next_service_due) return <span className="text-white/20">—</span>;
      const isOverdue = new Date(r.next_service_due) < new Date();
      return (
        <span className={isOverdue ? "text-red-400 font-semibold" : "text-white/60"}>
          {format(new Date(r.next_service_due), "MMM d, yyyy")}
          {isOverdue && " ⚠"}
        </span>
      );
    }},
    { key: "notes", label: "Notes", render: (r) => r.notes
      ? <span className="text-white/40 text-xs truncate max-w-[200px] block">{r.notes}</span>
      : <span className="text-white/20">—</span> },
  ];

  if (!isLoading && records.length === 0) {
    return (
      <>
        <EmptyState icon={Wrench} title="No maintenance records" description="Log your first service to track fleet maintenance history." actionLabel="Log Maintenance" onAction={() => setDialogOpen(true)} />
        <MaintenanceFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
      </>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader count={records.length} countLabel="records" onAdd={() => { setEditingRecord(null); setDialogOpen(true); }} addLabel="Log Maintenance" />
      <DataTable columns={columns} data={records} isLoading={isLoading}
        onRowClick={(row) => { setEditingRecord(row); setDialogOpen(true); }} />
      <MaintenanceFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingRecord(null); }}
        onSave={handleSave} record={editingRecord}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}