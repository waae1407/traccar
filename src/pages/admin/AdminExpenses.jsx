import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { loadSharedExpenseEngine } from "@/lib/operational/sharedExpenseEngine";
import { buildExpenseExportRows, downloadCsv } from "@/lib/operational/sharedExportUtils";
import PrototypePageHeader from "@/components/admin/prototypes/PrototypePageHeader";
import PrototypeMetricGrid from "@/components/admin/prototypes/PrototypeMetricGrid";
import PrototypeFilters from "@/components/admin/prototypes/PrototypeFilters";
import PrototypePagination from "@/components/admin/prototypes/PrototypePagination";
import PrototypeDetailDrawer from "@/components/admin/prototypes/PrototypeDetailDrawer";
import PrototypeReconciliationPanel from "@/components/admin/prototypes/PrototypeReconciliationPanel";


const PAGE_SIZE = 50;

export default function AdminExpenses() {
  const [filters, setFilters] = useState({ dateRange: "last30" });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-expenses-prototype", filters, page],
    queryFn: async () => {
      const user = await base44.auth.me();
      return loadSharedExpenseEngine({ mode: "admin", user, filters, limit: 500 });
    },
  });

  const expenses = data?.expenses || [];
  const currentDateFilter = filters.dateRange || "last30";
  const hosts = data?.sources?.hosts || [];
  const vehicles = data?.sources?.vehicles || [];
  const categories = useMemo(() => [...new Set((data?.allExpenses || []).map((item) => item.expense_type || item.category).filter(Boolean))], [data]);
  const highCostVehicles = useMemo(() => Object.entries(data?.breakdowns?.byVehicle || {}).sort((a, b) => b[1] - a[1]).slice(0, 5), [data]);
  const pagedExpenses = expenses.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const metrics = [
    { label: "Total expenses", value: data?.kpis?.totalExpenses, type: "currency" },
    { label: "Recurring obligations", value: data?.kpis?.recurringObligations, type: "currency" },
    { label: "Reimbursable totals", value: data?.kpis?.reimbursableTotal, type: "currency" },
    { label: "Tax deductible totals", value: data?.kpis?.taxDeductibleTotal, type: "currency" },
  ];

  return (
    <div className="p-6 space-y-6 mesh-bg min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white font-syne">Expenses</h1>
          <p className="text-white/40 text-sm mt-1">Fleet and operational expense tracking</p>
        </div>
        <Button onClick={() => downloadCsv(buildExpenseExportRows(expenses), "admin-expenses.csv")} className="gap-2"><Download className="h-4 w-4" /> Export</Button>
      </div>

      <PrototypeFilters filters={filters} onChange={(next) => { setFilters(next); setPage(0); }} hosts={hosts} vehicles={vehicles} categories={categories} showCostRange showReimbursable showTaxDeductible />
      <div className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary capitalize">
        Date range: {currentDateFilter.replaceAll("_", " ")}
      </div>
      <PrototypeMetricGrid metrics={metrics} />
      <PrototypeReconciliationPanel modernCount={data?.allExpenses?.length || 0} legacyCount={0} unresolvedCount={(data?.allExpenses || []).filter((item) => !item.host_id).length} dateFilter={currentDateFilter} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/10 font-semibold">Expense records</div>
          {isLoading ? <div className="p-6 text-muted-foreground">Loading shared engine data...</div> : pagedExpenses.map((expense) => (
            <button key={expense.id} onClick={() => setSelected(expense)} className="w-full text-left p-4 border-b border-white/5 hover:bg-white/[0.04] transition-all">
              <div className="flex justify-between gap-4"><span className="font-medium">{expense.vehicle_name || "Fleet"}</span><span>${Number(expense.amount || 0).toLocaleString()}</span></div>
              <div className="text-xs text-muted-foreground mt-1">{expense.host_name || "Unknown host"} · {expense.expense_type || expense.category || "other"} · {expense.date || "No date"}</div>
            </button>
          ))}
        </div>
        <div className="glass rounded-2xl p-4">
          <h3 className="font-semibold mb-3">High-cost vehicles</h3>
          <div className="space-y-3">
            {highCostVehicles.map(([vehicleId, amount]) => {
              const vehicle = vehicles.find((item) => item.id === vehicleId);
              return <div key={vehicleId} className="flex justify-between text-sm"><span className="text-muted-foreground">{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Fleet/Unknown"}</span><span>${amount.toLocaleString()}</span></div>;
            })}
          </div>
        </div>
      </div>

      <PrototypePagination page={page} pageSize={PAGE_SIZE} total={expenses.length} onPageChange={setPage} />
      <PrototypeDetailDrawer title="Expense detail" record={selected} open={!!selected} onOpenChange={() => setSelected(null)} fields={[
        { key: "host_name", label: "Host" }, { key: "vehicle_name", label: "Vehicle" }, { key: "expense_type", label: "Category" },
        { key: "amount", label: "Amount", render: (r) => `$${Number(r.amount || 0).toLocaleString()}` }, { key: "date", label: "Date" },
        { key: "description", label: "Description" }, { key: "reimbursable", label: "Reimbursable", render: (r) => r.reimbursable ? "Yes" : "No" },
        { key: "tax_deductible", label: "Tax deductible", render: (r) => r.tax_deductible ? "Yes" : "No" },
      ]} />
    </div>
  );
}