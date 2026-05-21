import React, { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Wrench, Clock, DollarSign, CalendarX } from "lucide-react";
import { differenceInDays, format } from "date-fns";

function getAlerts(logs, vehicles, vehicleMileageMap) {
  const alerts = [];
  const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));

  // Vehicles in Maintenance status
  vehicles.filter(v => v.status === "Maintenance").forEach(v => {
    const alreadyHasLog = logs.some(l => l.vehicle_id === v.id && l.status === "scheduled");
    if (!alreadyHasLog) {
      alerts.push({
        id: `maint_${v.id}`,
        vehicle: `${v.year} ${v.make} ${v.model}`,
        reason: "Vehicle marked Maintenance",
        urgency: "high",
        type: "in_maintenance",
        vehicleId: v.id,
      });
    }
  });

  // Overdue and due-soon from logs
  const now = new Date();
  logs.forEach(l => {
    const vehicle = vehicleMap[l.vehicle_id];
    const mileage = vehicleMileageMap[l.vehicle_id] || 0;
    let isOverdue = false;
    let isDueSoon = false;
    let reason = "";
    let dueDate = null;

    if (l.next_service_date) {
      const days = differenceInDays(new Date(l.next_service_date), now);
      if (days < 0) { isOverdue = true; reason = `${l.service_type?.replace(/_/g, " ")} overdue since ${l.next_service_date}`; }
      else if (days <= 14) { isDueSoon = true; reason = `${l.service_type?.replace(/_/g, " ")} due in ${days} day${days !== 1 ? "s" : ""}`; dueDate = l.next_service_date; }
    }
    if (!isOverdue && l.next_service_mileage && mileage) {
      const milesLeft = l.next_service_mileage - mileage;
      if (milesLeft <= 0) { isOverdue = true; reason = `${l.service_type?.replace(/_/g, " ")} mileage exceeded by ${Math.abs(milesLeft).toLocaleString()} mi`; }
      else if (milesLeft <= 500) { isDueSoon = true; reason = `${l.service_type?.replace(/_/g, " ")} — ${milesLeft.toLocaleString()} mi remaining`; }
    }

    if (isOverdue || isDueSoon) {
      alerts.push({
        id: l.id,
        vehicle: l.vehicle_name || vehicle ? `${vehicle?.year} ${vehicle?.make} ${vehicle?.model}` : "Unknown Vehicle",
        reason,
        urgency: isOverdue ? "critical" : "medium",
        type: isOverdue ? "overdue" : "due_soon",
        dueDate,
        logId: l.id,
        vehicleId: l.vehicle_id,
        serviceType: l.service_type,
      });
    }

    // Missing next service date on completed logs
    if (l.status === "completed" && !l.next_service_date && !l.next_service_mileage && l.service_type === "oil_change") {
      alerts.push({
        id: `missing_${l.id}`,
        vehicle: l.vehicle_name || "Unknown Vehicle",
        reason: "Oil change logged — no next service date set",
        urgency: "low",
        type: "missing_schedule",
        vehicleId: l.vehicle_id,
        logId: l.id,
      });
    }
  });

  // Deduplicate by vehicleId + type (keep highest urgency)
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const seen = new Map();
  alerts.forEach(a => {
    const key = `${a.vehicleId}_${a.type}`;
    const existing = seen.get(key);
    if (!existing || urgencyOrder[a.urgency] < urgencyOrder[existing.urgency]) {
      seen.set(key, a);
    }
  });

  return Array.from(seen.values()).sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
}

const URGENCY = {
  critical: { cls: "bg-red-100 text-red-700 border-red-200", label: "Overdue", border: "border-red-100" },
  high: { cls: "bg-orange-100 text-orange-700 border-orange-200", label: "In Maintenance", border: "border-orange-100" },
  medium: { cls: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Due Soon", border: "border-yellow-100" },
  low: { cls: "bg-blue-100 text-blue-700 border-blue-200", label: "Action Needed", border: "border-blue-100" },
};

export default function MaintenanceAlerts({ logs, vehicles, vehicleMileageMap, onLogService }) {
  const [expanded, setExpanded] = useState(true);
  const alerts = getAlerts(logs, vehicles, vehicleMileageMap);

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-200 bg-emerald-50">
        <Wrench className="h-5 w-5 text-emerald-500 flex-shrink-0" />
        <p className="text-sm font-semibold text-emerald-800">All vehicles are currently maintenance-ready.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-yellow-200 bg-yellow-50 overflow-hidden">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-bold text-yellow-800">{alerts.length} Maintenance Alert{alerts.length !== 1 ? "s" : ""}</span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-yellow-500" /> : <ChevronDown className="h-4 w-4 text-yellow-500" />}
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {alerts.map(a => {
            const u = URGENCY[a.urgency];
            return (
              <div key={a.id} className={`bg-white rounded-xl p-3 border flex items-start gap-3 ${u.border}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{a.vehicle}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 capitalize">{a.reason}</p>
                  {a.dueDate && <p className="text-[10px] text-gray-400 mt-0.5">Due: {a.dueDate}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${u.cls}`}>{u.label}</span>
                  <button
                    onClick={() => onLogService(a.vehicleId)}
                    className="text-[10px] font-semibold text-pink-600 hover:underline"
                  >
                    Log Service
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}