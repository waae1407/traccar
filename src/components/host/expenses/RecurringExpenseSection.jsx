import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { RefreshCw, AlertTriangle, PauseCircle, PlayCircle, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { differenceInDays, format } from "date-fns";

const CATEGORY_LABELS = {
  insurance: "Insurance", gps_subscription: "GPS Subscription", loan_payment: "Loan / Financing",
  storage_parking: "Storage / Parking", software_tools: "Software / Tools",
  service_contract: "Service Contract", registration: "Registration",
  fuel: "Fuel Account", cleaning: "Cleaning Service", other: "Other",
};

const FREQ_LABELS = { weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };

const CATEGORY_COLORS = {
  insurance: "#3b82f6", gps_subscription: "#8b5cf6", loan_payment: "#f97316",
  storage_parking: "#6b7280", software_tools: "#06b6d4", service_contract: "#10b981",
  registration: "#f59e0b", fuel: "#e91e8c", cleaning: "#84cc16", other: "#9ca3af",
};

function getDueStatus(nextDueDate, status) {
  if (status === "paused") return { label: "Paused", color: "text-gray-500 bg-gray-100 border-gray-200" };
  if (status === "cancelled") return { label: "Cancelled", color: "text-red-500 bg-red-50 border-red-200" };
  if (!nextDueDate) return { label: "Active", color: "text-green-600 bg-green-50 border-green-200" };
  const days = differenceInDays(new Date(nextDueDate), new Date());
  if (days < 0) return { label: "Overdue", color: "text-red-600 bg-red-50 border-red-200", urgent: true };
  if (days <= 7) return { label: "Due in " + days + "d", color: "text-orange-600 bg-orange-50 border-orange-200", urgent: true };
  if (days <= 14) return { label: "Due in " + days + "d", color: "text-yellow-600 bg-yellow-50 border-yellow-200" };
  return { label: "Active", color: "text-green-600 bg-green-50 border-green-200" };
}

function RecurringRow({ item }) {
  const qc = useQueryClient();
  const dueStatus = getDueStatus(item.next_due_date, item.status);
  const color = CATEGORY_COLORS[item.category] || "#9ca3af";

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.RecurringExpense.update(item.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-recurring-expenses"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.RecurringExpense.delete(item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-recurring-expenses"] }),
  });

  const togglePause = () => {
    updateMutation.mutate({ status: item.status === "paused" ? "active" : "paused" });
  };

  const cancel = () => {
    if (window.confirm("Cancel \"" + (CATEGORY_LABELS[item.category] || item.category) + "\" recurring expense?")) {
      deleteMutation.mutate();
    }
  };

  return (
    <div className={"flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 " + (dueStatus.urgent ? "bg-red-50/30" : "")}>
      <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + "18" }}>
        <RefreshCw className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-semibold text-gray-900">{CATEGORY_LABELS[item.category] || item.category}</p>
          <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded border " + dueStatus.color}>{dueStatus.label}</span>
          {item.tax_deductible && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-100">TAX</span>}
        </div>
        <p className="text-xs text-gray-400 truncate">
          {item.vehicle_name || "Fleet"} {"\u00b7"} {FREQ_LABELS[item.frequency] || item.frequency}
          {item.vendor ? " \u00b7 " + item.vendor : ""}
          {item.next_due_date ? " \u00b7 Due " + format(new Date(item.next_due_date), "MMM d, yyyy") : ""}
        </p>
      </div>
      <p className="text-sm font-bold text-gray-700 flex-shrink-0">${(item.amount || 0).toLocaleString()}</p>
      <div className="flex gap-1 flex-shrink-0">
        {item.status !== "cancelled" && (
          <button onClick={togglePause} disabled={updateMutation.isPending}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600" title={item.status === "paused" ? "Resume" : "Pause"}>
            {item.status === "paused" ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
          </button>
        )}
        <button onClick={cancel} disabled={deleteMutation.isPending}
          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400" title="Cancel">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function RecurringExpenseSection({ recurringExpenses = [], vehicles = [], hostId, user }) {
  const [expanded, setExpanded] = useState(true);
  const [statusFilter, setStatusFilter] = useState("active");

  const filtered = recurringExpenses.filter(r => !statusFilter || r.status === statusFilter);

  const totalMonthly = recurringExpenses
    .filter(r => r.status === "active")
    .reduce((s, r) => {
      const amount = r.amount || 0;
      if (r.frequency === "weekly") return s + amount * 4.33;
      if (r.frequency === "quarterly") return s + amount / 3;
      if (r.frequency === "yearly") return s + amount / 12;
      return s + amount;
    }, 0);

  const dueSoon = recurringExpenses.filter(r => {
    if (r.status !== "active" || !r.next_due_date) return false;
    const days = differenceInDays(new Date(r.next_due_date), new Date());
    return days <= 7;
  });

  return (
    <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-50 hover:bg-gray-50/50">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-4 w-4 text-blue-500" />
          <h3 className="font-bold text-gray-900 text-sm">Recurring Expenses</h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
            {"$" + Math.round(totalMonthly).toLocaleString() + "/mo"}
          </span>
          {dueSoon.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> {dueSoon.length} due soon
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {expanded && (
        <>
          <div className="flex gap-1 px-4 py-2 border-b border-gray-50 bg-gray-50/50">
            {[["active", "Active"], ["paused", "Paused"], ["cancelled", "Cancelled"], ["", "All"]].map(([v, l]) => (
              <button key={v} onClick={() => setStatusFilter(v)}
                className={"px-3 py-1 rounded-full text-xs font-semibold transition-colors " + (statusFilter === v ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:text-gray-700")}>
                {l}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <RefreshCw className="h-6 w-6 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-400 text-xs">No {statusFilter || ""} recurring expenses.</p>
            </div>
          ) : (
            filtered.map(r => <RecurringRow key={r.id} item={r} />)
          )}
        </>
      )}
    </div>
  );
}