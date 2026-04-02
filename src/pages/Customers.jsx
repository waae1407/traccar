import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Customer.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setDialogOpen(false);
      setEditingCustomer(null);
    },
  });

  const handleSave = (data) => {
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns = [
    { key: "full_name", label: "Name", render: (r) => <span className="font-medium">{r.full_name}</span> },
    { key: "phone", label: "Phone", render: (r) => (
      <span className="flex items-center gap-1.5 text-sm">
        <Phone className="h-3.5 w-3.5 text-muted-foreground" />{r.phone}
      </span>
    )},
    { key: "email", label: "Email", render: (r) => r.email ? (
      <span className="flex items-center gap-1.5 text-sm">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />{r.email}
      </span>
    ) : "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "lead_source", label: "Source", render: (r) => r.lead_source || "—" },
    { key: "weekly_income", label: "Weekly Income", render: (r) => r.weekly_income ? `$${r.weekly_income.toLocaleString()}` : "—" },
  ];

  if (!isLoading && customers.length === 0) {
    return (
      <>
        <EmptyState icon={Users} title="No customers yet" description="Add your first customer to get started." actionLabel="Add Customer" onAction={() => setDialogOpen(true)} />
        <CustomerFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{customers.length} customers</p>
        <Button onClick={() => { setEditingCustomer(null); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add Customer
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={customers}
        isLoading={isLoading}
        onRowClick={(row) => { setEditingCustomer(row); setDialogOpen(true); }}
      />
      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingCustomer(null); }}
        onSave={handleSave}
        customer={editingCustomer}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}