import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/useTenant";
import { DollarSign } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import PaymentFormDialog from "@/components/payments/PaymentFormDialog";
import { format } from "date-fns";

export default function Payments() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const queryClient = useQueryClient();
  const { tenantFilter, companyId } = useTenant();
  const scopeKey = companyId || "all";

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments", scopeKey],
    queryFn: () => base44.entities.Payment.filter(tenantFilter(), "-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Payment.create({ ...data, ...tenantFilter() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payments", scopeKey] }); setDialogOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Payment.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payments", scopeKey] }); setDialogOpen(false); setEditingPayment(null); },
  });

  const handleSave = (data) => {
    if (editingPayment) updateMutation.mutate({ id: editingPayment.id, data });
    else createMutation.mutate(data);
  };

  const methodIcon = { Card: "💳", Cash: "💵", Zelle: "⚡", ACH: "🏦" };

  const columns = [
    { key: "customer_name", label: "Customer", render: (r) => (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(152 60% 46% / 0.3) 0%, hsl(199 90% 54% / 0.3) 100%)", border: "1px solid hsl(152 60% 46% / 0.3)" }}>
          {(r.customer_name || "?").charAt(0)}
        </div>
        <span className="font-medium text-white">{r.customer_name || "—"}</span>
      </div>
    )},
    { key: "amount", label: "Amount", render: (r) => (
      <span className="font-bold text-white text-base">${r.amount?.toLocaleString()}</span>
    )},
    { key: "payment_type", label: "Type", render: (r) => (
      <span className="text-xs text-white/60 bg-white/[0.06] px-2.5 py-1 rounded-lg">{r.payment_type}</span>
    )},
    { key: "payment_method", label: "Method", render: (r) => r.payment_method ? (
      <span className="flex items-center gap-1.5 text-white/60 text-xs">
        <span>{methodIcon[r.payment_method] || "💰"}</span>{r.payment_method}
      </span>
    ) : <span className="text-white/20">—</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "due_date", label: "Due", render: (r) => r.due_date
      ? <span className="text-white/50 text-xs">{format(new Date(r.due_date), "MMM d, yyyy")}</span>
      : <span className="text-white/20">—</span> },
    { key: "paid_date", label: "Paid", render: (r) => r.paid_date
      ? <span className="text-green-400 text-xs">{format(new Date(r.paid_date), "MMM d, yyyy")}</span>
      : <span className="text-white/20">—</span> },
  ];

  if (!isLoading && payments.length === 0) {
    return (
      <>
        <EmptyState icon={DollarSign} title="No payments yet" description="Record your first payment to start tracking revenue." actionLabel="Record Payment" onAction={() => setDialogOpen(true)} />
        <PaymentFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
      </>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader count={payments.length} countLabel="payments" onAdd={() => { setEditingPayment(null); setDialogOpen(true); }} addLabel="Record Payment" />
      <DataTable columns={columns} data={payments} isLoading={isLoading}
        onRowClick={(row) => { setEditingPayment(row); setDialogOpen(true); }} />
      <PaymentFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingPayment(null); }}
        onSave={handleSave} payment={editingPayment}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}