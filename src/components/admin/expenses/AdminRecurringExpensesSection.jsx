import React, { useMemo, useState } from "react";
import { Repeat } from "lucide-react";
import {
  OperationalDataSection,
  OperationalDetailDrawer,
  OperationalPagination,
} from "@/components/operational";

const PAGE_SIZE = 50;

function formatDueStatus(status) {
  return String(status || "").replaceAll("_", " ");
}

export default function AdminRecurringExpensesSection({ recurring = [], isLoading = false }) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);

  const pagedRecurring = useMemo(
    () => recurring.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [recurring, page]
  );

  return (
    <>
      <OperationalDataSection
        mode="admin"
        title="Recurring Expense Records"
        subtitle="Recurring fleet obligations, vendor commitments, and upcoming expense visibility"
        count={recurring.length}
        loading={isLoading}
        empty={recurring.length === 0}
        emptyIcon={Repeat}
        emptyTitle="No recurring expenses found"
        emptyDescription="Adjust filters or review recurring obligations from host records."
      >
        <div className="divide-y divide-white/[0.06]">
          {pagedRecurring.map((item) => (
            <button key={item.id} onClick={() => setSelected(item)} className="w-full px-4 py-3 text-left transition-all hover:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-4">
                <span className="truncate font-medium text-white">{item.category || "Recurring"}</span>
                <span className="font-bold text-white">${Number(item.monthly_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
              </div>
              <div className="mt-1 truncate text-xs text-white/40">
                {item.host_name || "Unknown host"} · {item.vehicle_name || "Fleet"} · {item.frequency || "monthly"} · {formatDueStatus(item.due_status)}
              </div>
            </button>
          ))}
        </div>
      </OperationalDataSection>

      <OperationalPagination mode="admin" page={page} pageSize={PAGE_SIZE} total={recurring.length} onPageChange={setPage} />
      <OperationalDetailDrawer mode="admin" title="Recurring expense detail" record={selected} open={!!selected} onClose={() => setSelected(null)} fields={[
        { key: "host_name", label: "Host" },
        { key: "vehicle_name", label: "Vehicle linkage" },
        { key: "category", label: "Category" },
        { key: "vendor", label: "Vendor" },
        { key: "amount", label: "Amount", render: (r) => `$${Number(r.amount || 0).toLocaleString()}` },
        { key: "frequency", label: "Frequency" },
        { key: "monthly_amount", label: "Projected monthly", render: (r) => `$${Number(r.monthly_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
        { key: "next_due_date", label: "Next due" },
        { key: "due_status", label: "Due status", render: (r) => formatDueStatus(r.due_status) },
        { key: "notes", label: "Notes" },
      ]} />
    </>
  );
}