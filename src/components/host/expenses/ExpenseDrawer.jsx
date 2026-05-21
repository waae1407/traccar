import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { X, FileText, ExternalLink, Car, User, Wrench, Shield } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { EXPENSE_TYPES, TYPE_COLORS } from "./ExpenseFilters";

const TABS = ["Details", "Vehicle", "Booking", "Maintenance", "Dispute", "Documents", "Timeline"];

function fmtDate(d) { if (!d) return "—"; try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; } }
function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gray-50 last:border-0">
      <p className="text-xs text-gray-400 flex-shrink-0">{label}</p>
      <p className="text-xs font-semibold text-gray-700 text-right">{value || "—"}</p>
    </div>
  );
}

export default function ExpenseDrawer({ expense, vehicle, onClose }) {
  const [tab, setTab] = useState("Details");
  const typeConfig = EXPENSE_TYPES.find(t => t.value === expense.expense_type);
  const color = TYPE_COLORS[expense.expense_type] || "#6b7280";

  const { data: bookings = [] } = useQuery({
    queryKey: ["exp-booking", expense.vehicle_id],
    queryFn: () => base44.entities.BookingRequest.filter({ vehicle_id: expense.vehicle_id }, "-created_date", 10),
    enabled: tab === "Booking" && !!expense.vehicle_id,
  });

  const { data: maintenanceLogs = [] } = useQuery({
    queryKey: ["exp-maint", expense.vehicle_id],
    queryFn: () => base44.entities.HostMaintenanceLog.filter({ vehicle_id: expense.vehicle_id }, "-date", 10),
    enabled: tab === "Maintenance" && !!expense.vehicle_id,
  });

  const { data: disputes = [] } = useQuery({
    queryKey: ["exp-disputes", expense.vehicle_id],
    queryFn: () => base44.entities.Dispute.filter({ vehicle_id: expense.vehicle_id }, "-created_date", 10),
    enabled: tab === "Dispute" && !!expense.vehicle_id,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["exp-timeline", expense.vehicle_id],
    queryFn: () => base44.entities.ActivityEvent.filter({ vehicle_id: expense.vehicle_id }, "-created_date", 20).catch(() => []),
    enabled: tab === "Timeline" && !!expense.vehicle_id,
  });

  const availableTabs = TABS.filter(t => {
    if (t === "Booking" && !expense.vehicle_id) return false;
    if (t === "Maintenance" && !expense.vehicle_id) return false;
    if (t === "Dispute" && expense.expense_type !== "damage") return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.06), hsl(265 80% 62% / 0.04))" }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
              <div className="h-3 w-3 rounded-full" style={{ background: color }} />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm capitalize">{typeConfig?.label || expense.expense_type}</p>
              <p className="text-xs text-gray-400">{expense.vehicle_name || "Fleet Expense"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-base font-black text-red-500">${(expense.amount || 0).toLocaleString()}</p>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0 overflow-x-auto no-scrollbar">
          {availableTabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-shrink-0 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors ${tab === t ? "border-pink-500 text-pink-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "Details" && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <Row label="Expense Type" value={typeConfig?.label || expense.expense_type} />
                <Row label="Date" value={fmtDate(expense.date)} />
                <Row label="Amount" value={`$${(expense.amount || 0).toLocaleString()}`} />
                <Row label="Vehicle" value={expense.vehicle_name || "Fleet"} />
                <Row label="Description" value={expense.description} />
                <Row label="Reimbursable" value={expense.reimbursable ? "Yes" : "No"} />
                {expense.reimbursable && <Row label="Reimbursement Status" value={expense.reimbursement_status || "Pending"} />}
              </div>
              <div className="flex gap-2">
                {expense.reimbursable && (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-yellow-50 border border-yellow-200 text-xs font-bold text-yellow-700">
                    💰 Reimbursable
                  </span>
                )}
                {expense.tax_deductible && (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-xs font-bold text-green-700">
                    🧾 Tax Deductible
                  </span>
                )}
                {expense.recurring && (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-700">
                    🔁 Recurring
                  </span>
                )}
              </div>
            </div>
          )}

          {tab === "Vehicle" && (
            <div className="space-y-3">
              {vehicle ? (
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Car className="h-5 w-5 text-pink-500" />
                    <p className="font-bold text-gray-800">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                  </div>
                  <Row label="Plate" value={vehicle.plate} />
                  <Row label="VIN" value={vehicle.vin} />
                  <Row label="Status" value={vehicle.status} />
                  <Row label="Mileage" value={vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : null} />
                  <Row label="City" value={vehicle.city} />
                </div>
              ) : <p className="text-sm text-gray-400 text-center py-8">No vehicle linked to this expense.</p>}
            </div>
          )}

          {tab === "Booking" && (
            <div className="space-y-3">
              {bookings.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No bookings found for this vehicle.</p>
                : bookings.slice(0, 5).map(b => (
                    <div key={b.id} className="rounded-2xl border border-gray-100 p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <p className="text-xs font-semibold text-gray-800">{b.customer_full_name || b.user_email}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${["active", "confirmed"].includes(b.booking_status) ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {b.booking_status?.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex gap-3 text-[11px] text-gray-400">
                        {b.start_date && <span>{fmtDate(b.start_date)}</span>}
                        {b.weekly_rate && <span>${b.weekly_rate}/wk</span>}
                      </div>
                    </div>
                  ))
              }
            </div>
          )}

          {tab === "Maintenance" && (
            <div className="space-y-3">
              {maintenanceLogs.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No maintenance logs for this vehicle.</p>
                : maintenanceLogs.map(m => (
                    <div key={m.id} className="rounded-2xl border border-gray-100 p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-gray-400" />
                          <p className="text-xs font-semibold text-gray-800 capitalize">{m.service_type?.replace(/_/g, " ")}</p>
                        </div>
                        <p className="text-xs font-bold text-red-500">{m.cost ? `$${m.cost}` : "—"}</p>
                      </div>
                      <p className="text-[11px] text-gray-400">{fmtDate(m.date)}{m.shop_name ? ` · ${m.shop_name}` : ""}</p>
                    </div>
                  ))
              }
            </div>
          )}

          {tab === "Dispute" && (
            <div className="space-y-3">
              {disputes.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No disputes linked to this vehicle.</p>
                : disputes.map(d => (
                    <div key={d.id} className="rounded-2xl border border-orange-100 bg-orange-50 p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-orange-400" />
                          <p className="text-xs font-semibold text-orange-800 capitalize">{d.dispute_type?.replace(/_/g, " ")}</p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{d.status}</span>
                      </div>
                      {d.description && <p className="text-[11px] text-orange-700">{d.description}</p>}
                      <p className="text-[10px] text-orange-500">{fmtDate(d.created_date)}</p>
                    </div>
                  ))
              }
            </div>
          )}

          {tab === "Documents" && (
            <div className="space-y-3">
              {expense.receipt_url
                ? <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-pink-500" />
                      <span className="text-xs font-semibold text-gray-700">Receipt / Invoice</span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                  </a>
                : <p className="text-sm text-gray-400 text-center py-8">No receipt uploaded for this expense.</p>
              }
            </div>
          )}

          {tab === "Timeline" && (
            <div className="space-y-1">
              {events.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No activity recorded for this vehicle.</p>
                : events.map(e => (
                    <div key={e.id} className="flex gap-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 mt-2 ${e.event_status === "error" ? "bg-red-400" : e.event_status === "warning" ? "bg-yellow-400" : "bg-emerald-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{e.event_title || e.event_type?.replace(/\./g, " · ")}</p>
                        {e.summary && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{e.summary}</p>}
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {e.created_date ? formatDistanceToNow(new Date(e.created_date), { addSuffix: true }) : ""}
                        </p>
                      </div>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}