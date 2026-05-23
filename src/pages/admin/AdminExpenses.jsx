import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { loadSharedExpenseEngine } from "@/lib/operational/sharedExpenseEngine";
import { buildExpenseExportRows, buildRecurringExpenseExportRows, downloadCsv } from "@/lib/operational/sharedExportUtils";
import { SHARED_DATE_RANGES } from "@/lib/operational/sharedOperationalFilters";
import {
  OperationalPageShell,
  OperationalHero,
  OperationalKpiGrid,
  OperationalFilterBar,
  OperationalAdvancedFilters,
  OperationalExportToolbar,
  OperationalDataSection,
  OperationalDetailDrawer,
  OperationalPagination,
} from "@/components/operational";
import { Receipt } from "lucide-react";
import AdminRecurringExpensesSection from "@/components/admin/expenses/AdminRecurringExpensesSection";

const PAGE_SIZE = 50;

export default function AdminExpenses() {
  const [filters, setFilters] = useState({ dateRange: "last30" });
  const [activeTab, setActiveTab] = useState("expenses");
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
  const recurringExpenses = data?.recurringExpenses || [];
  const hosts = data?.sources?.hosts || [];
  const vehicles = data?.sources?.vehicles || [];
  const categories = useMemo(() => [...new Set((data?.allExpenses || []).map((item) => item.expense_type || item.category).filter(Boolean))], [data]);
  const highCostVehicles = useMemo(() => Object.entries(data?.breakdowns?.byVehicle || {}).sort((a, b) => b[1] - a[1]).slice(0, 5), [data]);
  const pagedExpenses = expenses.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const metrics = [
    { label: "Total expenses", value: data?.kpis?.totalExpenses, type: "currency", variant: "danger" },
    { label: "Recurring obligations", value: data?.kpis?.recurringObligations, type: "currency", variant: "warning" },
    { label: "Reimbursable totals", value: data?.kpis?.reimbursableTotal, type: "currency", variant: "info" },
    { label: "Tax deductible totals", value: data?.kpis?.taxDeductibleTotal, type: "currency", variant: "primary" },
  ];

  return (
    <OperationalPageShell mode="admin">
      <OperationalHero
        mode="admin"
        title="Admin Expenses"
        subtitle="Fleet and operational expense tracking across hosts and vehicles"
        eyebrow="Operations"
        actions={<OperationalExportToolbar mode="admin" exports={[{ label: activeTab === "recurring" ? "Export Recurring" : "Export", onClick: () => downloadCsv(activeTab === "recurring" ? buildRecurringExpenseExportRows(recurringExpenses) : buildExpenseExportRows(expenses), activeTab === "recurring" ? "admin-recurring-expenses.csv" : "admin-expenses.csv") }]} />}
      />

      <OperationalKpiGrid mode="admin" metrics={metrics} />

      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2">
        {[
          { id: "expenses", label: "Expense Records" },
          { id: "recurring", label: "Recurring Expenses" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${activeTab === tab.id ? "text-white" : "text-white/45 hover:bg-white/[0.05] hover:text-white/75"}`}
            style={activeTab === tab.id ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "expenses" && <>
      <OperationalDataSection mode="admin" title="Expense Insights" subtitle="Highest-cost vehicles and record health" bodyClassName="p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 lg:col-span-2">
            <p className="text-xs font-bold uppercase tracking-wider text-white/35">Record Health</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div><p className="text-white/35">Current</p><p className="font-bold text-white">{(data?.allExpenses?.length || 0).toLocaleString()}</p></div>
              <div><p className="text-white/35">Needs review</p><p className="font-bold text-yellow-400">{(data?.allExpenses || []).filter((item) => !item.host_id).length.toLocaleString()}</p></div>
              <div><p className="text-white/35">Period</p><p className="font-bold text-white">{filters.dateRange || "last30"}</p></div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-white/35">High-Cost Vehicles</p>
            <div className="mt-3 space-y-2">
              {highCostVehicles.map(([vehicleId, amount]) => {
                const vehicle = vehicles.find((item) => item.id === vehicleId);
                return <div key={vehicleId} className="flex justify-between gap-3 text-sm"><span className="truncate text-white/45">{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Fleet/Unknown"}</span><span className="font-semibold text-white">${amount.toLocaleString()}</span></div>;
              })}
            </div>
          </div>
        </div>
      </OperationalDataSection>

      <OperationalFilterBar mode="admin" filters={filters} onChange={(next) => { setFilters(next); setPage(0); }} vehicles={vehicles} categories={categories} dateRanges={SHARED_DATE_RANGES} resultCount={expenses.length} totalCount={data?.allExpenses?.length || 0} />
      <OperationalAdvancedFilters
        mode="admin"
        filters={filters}
        onChange={(next) => { setFilters(next); setPage(0); }}
        hosts={hosts}
        fields={[
          { key: "costRange", label: "amounts", options: ["0-100", "100-500", "500-1000", "1000+"] },
          { key: "reimbursable", label: "reimbursement", options: [{ value: "yes", label: "Reimbursable" }, { value: "no", label: "Non-reimbursable" }] },
          { key: "taxDeductible", label: "tax status", options: [{ value: "yes", label: "Tax deductible" }, { value: "no", label: "Not tax deductible" }] },
        ]}
      />

      <OperationalDataSection mode="admin" title="Expense Records" count={expenses.length} loading={isLoading} empty={expenses.length === 0} emptyIcon={Receipt} emptyTitle="No expenses found" emptyDescription="Adjust filters or sync operational records to review expenses.">
        <div className="divide-y divide-white/[0.06]">
          {pagedExpenses.map((expense) => (
            <button key={expense.id} onClick={() => setSelected(expense)} className="w-full px-4 py-3 text-left transition-all hover:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-4"><span className="truncate font-medium text-white">{expense.vehicle_name || "Fleet"}</span><span className="font-bold text-white">${Number(expense.amount || 0).toLocaleString()}</span></div>
              <div className="mt-1 truncate text-xs text-white/40">{expense.host_name || "Unknown host"} · {expense.expense_type || expense.category || "other"} · {expense.date || "No date"}</div>
            </button>
          ))}
        </div>
      </OperationalDataSection>

      <OperationalPagination mode="admin" page={page} pageSize={PAGE_SIZE} total={expenses.length} onPageChange={setPage} />
      </>}

      {activeTab === "recurring" && <AdminRecurringExpensesSection recurring={recurringExpenses} isLoading={isLoading} />}

      <OperationalDetailDrawer mode="admin" title="Expense detail" record={selected} open={!!selected} onClose={() => setSelected(null)} fields={[
        { key: "host_name", label: "Host" }, { key: "vehicle_name", label: "Vehicle" }, { key: "expense_type", label: "Category" },
        { key: "amount", label: "Amount", render: (r) => `$${Number(r.amount || 0).toLocaleString()}` }, { key: "date", label: "Date" },
        { key: "description", label: "Description" }, { key: "reimbursable", label: "Reimbursable", render: (r) => r.reimbursable ? "Yes" : "No" },
        { key: "tax_deductible", label: "Tax deductible", render: (r) => r.tax_deductible ? "Yes" : "No" },
      ]} />
    </OperationalPageShell>
  );
}