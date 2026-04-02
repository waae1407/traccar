import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileKey, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import RTOFormDialog from "@/components/rto/RTOFormDialog";
import { Progress } from "@/components/ui/progress";

export default function RentToOwn() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const queryClient = useQueryClient();

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: () => base44.entities.RentToOwnContract.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.RentToOwnContract.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      setDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RentToOwnContract.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      setDialogOpen(false);
      setEditingContract(null);
    },
  });

  const handleSave = (data) => {
    if (editingContract) {
      updateMutation.mutate({ id: editingContract.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns = [
    { key: "customer_name", label: "Customer", render: (r) => <span className="font-medium">{r.customer_name || "—"}</span> },
    { key: "vehicle_name", label: "Vehicle", render: (r) => r.vehicle_name || "—" },
    { key: "weekly_payment", label: "Weekly", render: (r) => `$${r.weekly_payment?.toLocaleString()}` },
    { key: "total_paid", label: "Total Paid", render: (r) => `$${(r.total_paid || 0).toLocaleString()}` },
    { key: "remaining", label: "Remaining", render: (r) => `$${((r.total_contract_value || 0) - (r.total_paid || 0)).toLocaleString()}` },
    { key: "progress", label: "Ownership Progress", render: (r) => {
      const pct = r.total_payments_required ? Math.round((r.consistent_payments_made / r.total_payments_required) * 100) : 0;
      return (
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress value={pct} className="h-2 flex-1" />
          <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
        </div>
      );
    }},
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  if (!isLoading && contracts.length === 0) {
    return (
      <>
        <EmptyState icon={FileKey} title="No contracts yet" description="Create your first rent-to-own contract." actionLabel="New Contract" onAction={() => setDialogOpen(true)} />
        <RTOFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{contracts.length} contracts</p>
        <Button onClick={() => { setEditingContract(null); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> New Contract
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={contracts}
        isLoading={isLoading}
        onRowClick={(row) => { setEditingContract(row); setDialogOpen(true); }}
      />
      <RTOFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingContract(null); }}
        onSave={handleSave}
        contract={editingContract}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}