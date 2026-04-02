import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Phone, Mail } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import CustomerFormDialog from "@/components/customers/CustomerFormDialog";

export default function Customers() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Customer.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); setDialogOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Customer.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); setDialogOpen(false); setEditingCustomer(null); },
  });

  const handleSave = (data) => {
    if (editingCustomer) updateMutation.mutate({ id: editingCustomer.id, data });
    else createMutation.mutate(data);
  };

  const columns = [
    { key: "full_name", label: "Customer", render: (r) => (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%) 0%, hsl(265 80% 62%) 100%)" }}>
          {r.full_name?.charAt(0)}
        </div>
        <span className="font-medium text-white">{r.full_name}</span>
      </div>
    )},
    { key: "phone", label: "Phone", render: (r) => (
      <span className="flex items-center gap-1.5 text-white/60"><Phone className="h-3.5 w-3.5 text-white/30" />{r.phone}</span>
    )},
    { key: "email", label: "Email", render: (r) => r.email ? (
      <span className="flex items-center gap-1.5 text-white/60"><Mail className="h-3.5 w-3.5 text-white/30" />{r.email}</span>
    ) : <span className="text-white/20">—</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "lead_source", label: "Source", render: (r) => r.lead_source
      ? <span className="text-white/50 text-xs">{r.lead_source}</span>
      : <span className="text-white/20">—</span> },
    { key: "weekly_income", label: "Weekly Income", render: (r) => r.weekly_income
      ? <span className="font-semibold text-green-400">${r.weekly_income.toLocaleString()}</span>
      : <span className="text-white/20">—</span> },
  ];

  if (!isLoading && customers.length === 0) {
    return (
      <>
        <EmptyState icon={Users} title="No customers yet" description="Add your first customer to get started managing your fleet relationships." actionLabel="Add Customer" onAction={() => setDialogOpen(true)} />
        <CustomerFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
      </>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader count={customers.length} countLabel="customers" onAdd={() => { setEditingCustomer(null); setDialogOpen(true); }} addLabel="Add Customer" />
      <DataTable columns={columns} data={customers} isLoading={isLoading}
        onRowClick={(row) => { setEditingCustomer(row); setDialogOpen(true); }} />
      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingCustomer(null); }}
        onSave={handleSave} customer={editingCustomer}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}