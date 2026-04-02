import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import PaymentFormDialog from "@/components/payments/PaymentFormDialog";
import { format } from "date-fns";

export default function Payments() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const queryClient = useQueryClient();

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: () => base44.entities.Payment.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Payment.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      setDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Payment.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      setDialogOpen(false);
      setEditingPayment(null);
    },
  });

  const handleSave = (data) => {
    if (editingPayment) {
      updateMutation.mutate({ id: editingPayment.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns = [
    { key: "customer_name", label: "Customer", render: (r) => <span className="font-medium">{r.customer_name || "—"}</span> },
    { key: "amount", label: "Amount", render: (r) => <span className="font-semibold">${r.amount?.toLocaleString()}</span> },
    { key: "payment_type", label: "Type", render: (r) => r.payment_type },
    { key: "payment_method", label: "Method", render: (r) => r.payment_method || "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "due_date", label: "Due Date", render: (r) => r.due_date ? format(new Date(r.due_date), "MMM d, yyyy") : "—" },
    { key: "paid_date", label: "Paid Date", render: (r) => r.paid_date ? format(new Date(r.paid_date), "MMM d, yyyy") : "—" },
  ];

  if (!isLoading && payments.length === 0) {
    return (
      <>
        <EmptyState icon={DollarSign} title="No payments yet" description="Record your first payment." actionLabel="Record Payment" onAction={() => setDialogOpen(true)} />
        <PaymentFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{payments.length} payments</p>
        <Button onClick={() => { setEditingPayment(null); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Record Payment
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={payments}
        isLoading={isLoading}
        onRowClick={(row) => { setEditingPayment(row); setDialogOpen(true); }}
      />
      <PaymentFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingPayment(null); }}
        onSave={handleSave}
        payment={editingPayment}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}