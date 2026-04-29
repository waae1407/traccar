import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/useTenant";
import { Users, Phone, Mail, UserCheck } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import CustomerFormDialog from "@/components/customers/CustomerFormDialog";
import AdminFilters from "@/components/shared/AdminFilters";
import PlatformUsersTab from "@/components/customers/PlatformUsersTab";

export default function Customers() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [activeTab, setActiveTab] = useState("crm");
  const [filters, setFilters] = useState({ search: "", dateFrom: "", dateTo: "", customerStatus: "" });
  const queryClient = useQueryClient();
  const { tenantFilter, companyId } = useTenant();
  const scopeKey = companyId || "all";

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers", scopeKey],
    queryFn: () => base44.entities.Customer.filter(tenantFilter(), "-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Customer.create({ ...data, ...tenantFilter() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers", scopeKey] }); setDialogOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Customer.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers", scopeKey] }); setDialogOpen(false); setEditingCustomer(null); },
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

  const filtered = customers.filter((c) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!`${c.full_name} ${c.email} ${c.phone}`.toLowerCase().includes(q)) return false;
    }
    if (filters.customerStatus && c.status !== filters.customerStatus) return false;
    if (filters.dateFrom && new Date(c.created_date) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && new Date(c.created_date) > new Date(filters.dateTo + "T23:59:59")) return false;
    return true;
  });

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

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setActiveTab("crm")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "crm" ? "text-white" : "text-white/40 border border-white/10"}`}
          style={activeTab === "crm" ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : { background: "hsl(222 24% 11%)" }}
        >
          <Users className="h-4 w-4" /> CRM Customers
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === "users" ? "text-white" : "text-white/40 border border-white/10"}`}
          style={activeTab === "users" ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : { background: "hsl(222 24% 11%)" }}
        >
          <UserCheck className="h-4 w-4" /> Platform Users
        </button>
      </div>

      {activeTab === "users" ? (
        <PlatformUsersTab />
      ) : (
      <>
      <AdminFilters
        filters={filters}
        onChange={setFilter}
        options={{ showSearch: true, showDate: true, showCustomerStatus: true }}
        resultCount={filtered.length}
        totalCount={customers.length}
      />
      <DataTable columns={columns} data={filtered} isLoading={isLoading}
        onRowClick={(row) => { setEditingCustomer(row); setDialogOpen(true); }} />
      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingCustomer(null); }}
        onSave={handleSave} customer={editingCustomer}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
      </>
      )}
    </div>
  );
}