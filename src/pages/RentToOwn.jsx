import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileKey } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import RTOFormDialog from "@/components/rto/RTOFormDialog";

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["contracts"] }); setDialogOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RentToOwnContract.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["contracts"] }); setDialogOpen(false); setEditingContract(null); },
  });

  const handleSave = (data) => {
    if (editingContract) updateMutation.mutate({ id: editingContract.id, data });
    else createMutation.mutate(data);
  };

  const columns = [
    { key: "customer_name", label: "Customer", render: (r) => (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.4) 0%, hsl(265 80% 62% / 0.4) 100%)", border: "1px solid hsl(338 90% 56% / 0.3)" }}>
          {(r.customer_name || "?").charAt(0)}
        </div>
        <span className="font-medium text-white">{r.customer_name || "—"}</span>
      </div>
    )},
    { key: "vehicle_name", label: "Vehicle", render: (r) => <span className="text-white/60">{r.vehicle_name || "—"}</span> },
    { key: "weekly_payment", label: "Weekly", render: (r) => (
      <span className="font-semibold text-white">${r.weekly_payment?.toLocaleString()}</span>
    )},
    { key: "total_paid", label: "Total Paid", render: (r) => (
      <span className="font-semibold text-green-400">${(r.total_paid || 0).toLocaleString()}</span>
    )},
    { key: "remaining", label: "Remaining", render: (r) => (
      <span className="text-white/60">${((r.total_contract_value || 0) - (r.total_paid || 0)).toLocaleString()}</span>
    )},
    { key: "progress", label: "Ownership Progress", render: (r) => {
      const pct = r.total_payments_required ? Math.round((r.consistent_payments_made / r.total_payments_required) * 100) : 0;
      return (
        <div className="flex items-center gap-3 min-w-[140px]">
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} />
          </div>
          <span className="text-xs font-semibold text-white/60 w-8 text-right">{pct}%</span>
        </div>
      );
    }},
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  if (!isLoading && contracts.length === 0) {
    return (
      <>
        <EmptyState icon={FileKey} title="No contracts yet" description="Create your first rent-to-own contract to start the ownership journey." actionLabel="New Contract" onAction={() => setDialogOpen(true)} />
        <RTOFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
      </>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader count={contracts.length} countLabel="contracts" onAdd={() => { setEditingContract(null); setDialogOpen(true); }} addLabel="New Contract" />
      <DataTable columns={columns} data={contracts} isLoading={isLoading}
        onRowClick={(row) => { setEditingContract(row); setDialogOpen(true); }} />
      <RTOFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingContract(null); }}
        onSave={handleSave} contract={editingContract}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}