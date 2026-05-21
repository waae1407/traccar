import React from "react";
import { CheckCircle2, Clock, AlertTriangle, Wrench, ChevronRight, Receipt } from "lucide-react";
import { format } from "date-fns";

export const SERVICE_LABELS = {
  oil_change: "Oil Change", tire_rotation: "Tire Rotation", brake_service: "Brake Service",
  inspection: "Inspection", wash: "Detailing / Wash", tire_replacement: "Tire Replacement",
  battery: "Battery", ac_service: "A/C Service", other: "Other",
};

export const STATUS_CONFIG = {
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  scheduled: { label: "Scheduled", cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Clock },
  due_soon: { label: "Due Soon", cls: "bg-yellow-50 text-yellow-700 border-yellow-200", Icon: AlertTriangle },
  overdue: { label: "Overdue", cls: "bg-red-50 text-red-600 border-red-200", Icon: AlertTriangle },
  in_maintenance: { label: "In Maintenance", cls: "bg-orange-50 text-orange-700 border-orange-200", Icon: Wrench },
};

function fmtDate(d) {
  if (!d) return null;
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
}

export default function MaintenanceCard({ log, vehicleMileage, isSelected, onClick }) {
  const cfg = STATUS_CONFIG[log._status] || STATUS_CONFIG.completed;
  const StatusIcon = cfg.Icon;
  const milesLeft = log.next_service_mileage && vehicleMileage
    ? log.next_service_mileage - vehicleMileage : null;

  const vehicle = log.vehicle || {};
  const plate = vehicle.plate || log.plate;
  const vin = vehicle.vin || log.vin;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-4 border-b border-gray-50 last:border-0 transition-colors ${isSelected ? "bg-pink-50/40" : "hover:bg-gray-50/50"}`}
    >
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${cfg.cls}`}>
          <StatusIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-sm font-semibold text-gray-900">{SERVICE_LABELS[log.service_type] || log.service_type}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">
            {log.vehicle_name}
            {plate ? ` · ${plate}` : ""}
            {vin ? ` · ...${vin.slice(-6)}` : ""}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-400">
            <span>📅 {fmtDate(log.date)}</span>
            {log.mileage_at_service && <span>🔢 {log.mileage_at_service.toLocaleString()} mi</span>}
            {log.shop_name && <span>🏪 {log.shop_name}</span>}
            {log.next_service_date && <span>Next: {fmtDate(log.next_service_date)}</span>}
            {milesLeft !== null && (
              <span className={milesLeft <= 0 ? "text-red-500 font-semibold" : milesLeft <= 500 ? "text-yellow-600 font-semibold" : ""}>
                {milesLeft > 0 ? `${milesLeft.toLocaleString()} mi left` : `${Math.abs(milesLeft).toLocaleString()} mi overdue`}
              </span>
            )}
          </div>
          {log.notes && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{log.notes}</p>}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {log.cost > 0 && <p className="text-sm font-bold text-gray-900">${(log.cost || 0).toLocaleString()}</p>}
          {log.receipt_url && <Receipt className="h-3.5 w-3.5 text-pink-400" />}
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </div>
    </button>
  );
}