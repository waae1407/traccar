import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { loadSharedExpenseEngine } from "@/lib/operational/sharedExpenseEngine";
import { buildRecurringExpenseExportRows, downloadCsv } from "@/lib/operational/sharedExportUtils";
import PrototypePageHeader from "@/components/admin/prototypes/PrototypePageHeader";
import PrototypeMetricGrid from "@/components/admin/prototypes/PrototypeMetricGrid";
import PrototypeFilters from "@/components/admin/prototypes/PrototypeFilters";
import PrototypePagination from "@/components/admin/prototypes/PrototypePagination";
import PrototypeDetailDrawer from "@/components/admin/prototypes/PrototypeDetailDrawer";

const PAGE_SIZE = 50;

function formatDueStatus(status) {
  return String(status || "").replaceAll("_", " ");
}

export default function AdminRecurringExpenses() {
  const [filters, setFilters] = useState({ dateRange: "last30" });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-recurring-expenses-prototype", filters, page],
    queryFn: async () => {
      const user = await base44.auth.me();
      return loadSharedExpenseEngine({ mode: "admin", user, filters, limit: 500 });
    },
  });

  const recurring = data?.recurringExpenses || [];
  const hosts = data?.sources?.hosts || [];
  const vehicles = data?.sources?.vehicles || [];
  const categories = useMemo(() => [...new Set((data?.allRecurringExpenses || []).map((item) => item.category).filter(Boolean))], [data]);
  const pagedRecurring = recurring.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const metrics = [
    { label: "Recurring obligations", value: data?.kpis?.recurringObligations, type: "currency" },
    { label: "Projected monthly", value: data?.kpis?.projectedMonthlyRecurring, type: "currency" },
    { label: "Due soon", value: data?.kpis?.recurringDueSoonCount },
    { label: "Overdue", value: data?.kpis?.recurringOverdueCount },
  ];

  return (
    <div className="p-6 space-y-6 mesh-bg min-h-screen">
      <PrototypePageHeader
        title="Admin Recurring Expenses Prototype"
        subtitle="Read-only recurring obligations preview sourced through the shared expense engine."
        action={<Button onClick={() => downloadCsv(buildRecurringExpenseExportRows(recurring), "admin-recurring-expenses-prototype.csv")} className="gap-2"><Download className="h-4 w-4" /> Export</Button>}
      />
      <PrototypeFilters filters={filters} onChange={(next) => { setFilters(next); setPage(0); }} hosts={hosts} vehicles={vehicles} categories={categories} />
      <PrototypeMetricGrid metrics={metrics} />

      <div className="glass rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 font-semibold">Recurring obligations by host</div>
        {isLoading ? <div className="p-6 text-muted-foreground">Loading shared engine data...</div> : pagedRecurring.map((item) => (
          <button key={item.id} onClick={() => setSelected(item)} className="w-full text-left p-4 border-b border-white/5 hover:bg-white/[0.04] transition-all">
            <div className="flex justify-between gap-4"><span className="font-medium">{item.category || "Recurring"}</span><span>${Number(item.monthly_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span></div>
            <div className="text-xs text-muted-foreground mt-1">{item.host_name || "Unknown host"} · {item.vehicle_name || "Fleet"} · {item.frequency || "monthly"} · {formatDueStatus(item.due_status)}</div>
          </button>
        ))}
      </div>

      <PrototypePagination page={page} pageSize={PAGE_SIZE} total={recurring.length} onPageChange={setPage} />
      <PrototypeDetailDrawer title="Recurring expense detail" record={selected} open={!!selected} onOpenChange={() => setSelected(null)} fields={[
        { key: "host_name", label: "Host" }, { key: "vehicle_name", label: "Vehicle linkage" }, { key: "category", label: "Category" },
        { key: "vendor", label: "Vendor" }, { key: "amount", label: "Amount", render: (r) => `$${Number(r.amount || 0).toLocaleString()}` },
        { key: "frequency", label: "Frequency" }, { key: "monthly_amount", label: "Projected monthly", render: (r) => `$${Number(r.monthly_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
        { key: "next_due_date", label: "Next due" }, { key: "due_status", label: "Due status", render: (r) => formatDueStatus(r.due_status) }, { key: "notes", label: "Notes" },
      ]} />
    </div>
  );
}