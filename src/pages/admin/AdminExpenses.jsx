import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { loadSharedExpenseEngine } from "@/lib/operational/sharedExpenseEngine";
import { buildExpenseExportRows, downloadCsv } from "@/lib/operational/sharedExportUtils";
import {
  OperationalPageHeader,
  OperationalMetricGrid,
  OperationalFilters,
  OperationalSectionCard,
  OperationalListContainer,
  OperationalRecordHealth,
} from "@/components/admin/operational";
import PrototypePagination from "@/components/admin/prototypes/PrototypePagination";
import PrototypeDetailDrawer from "@/components/admin/prototypes/PrototypeDetailDrawer";


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
    <div className="space-y-5 animate-fade-in-up">
      <OperationalPageHeader
        title="Admin Expenses"
        subtitle="Fleet and operational expense tracking across hosts and vehicles"
        eyebrow="Operations"
        action={<Button onClick={() => downloadCsv(buildExpenseExportRows(expenses), "admin-expenses.csv")} className="gap-2"><Download className="h-4 w-4" /> Export</Button>}
      />

      <OperationalFilters filters={filters} onChange={(next) => { setFilters(next); setPage(0); }} hosts={hosts} vehicles={vehicles} categories={categories} showCostRange showReimbursable showTaxDeductible resultCount={expenses.length} totalCount={data?.allExpenses?.length || 0} />
      <OperationalMetricGrid metrics={metrics} />
      <OperationalRecordHealth currentCount={data?.allExpenses?.length || 0} historicalCount={0} needsReviewCount={(data?.allExpenses || []).filter((item) => !item.host_id).length} dateFilter={currentDateFilter} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <OperationalListContainer title="Expense Records" count={pagedExpenses.length} loading={isLoading} emptyTitle="No expenses found" emptyDescription="Adjust filters or sync operational records to review expenses.">
            <div className="divide-y divide-white/[0.06]">
              {pagedExpenses.map((expense) => (
                <button key={expense.id} onClick={() => setSelected(expense)} className="w-full text-left px-4 py-3 hover:bg-white/[0.04] transition-all">
                  <div className="flex items-center justify-between gap-4"><span className="font-medium text-white truncate">{expense.vehicle_name || "Fleet"}</span><span className="font-bold text-white">${Number(expense.amount || 0).toLocaleString()}</span></div>
                  <div className="text-xs text-white/40 mt-1 truncate">{expense.host_name || "Unknown host"} · {expense.expense_type || expense.category || "other"} · {expense.date || "No date"}</div>
                </button>
              ))}
            </div>
          </OperationalListContainer>
        </div>
        <OperationalSectionCard title="High-Cost Vehicles">
          <div className="p-4 space-y-3">
            {highCostVehicles.map(([vehicleId, amount]) => {
              const vehicle = vehicles.find((item) => item.id === vehicleId);
              return <div key={vehicleId} className="flex justify-between gap-3 text-sm"><span className="text-white/45 truncate">{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Fleet/Unknown"}</span><span className="font-semibold text-white">${amount.toLocaleString()}</span></div>;
            })}
          </div>
        </OperationalSectionCard>
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