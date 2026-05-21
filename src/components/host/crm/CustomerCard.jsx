import React from "react";
import { ChevronRight, AlertTriangle, CheckCircle2, Clock, XCircle, Shield } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function getRiskInfo(customer, activeBooking, openDispute) {
  if (openDispute) return { level: "open_dispute", label: "Dispute", color: "bg-orange-100 text-orange-700 border-orange-200", icon: Shield };
  if (activeBooking?.booking_status === "suspended") return { level: "high_risk", label: "Suspended", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle };
  if (activeBooking?.booking_status === "grace_period") return { level: "needs_attention", label: "Grace Period", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock };
  if (activeBooking?.booking_status === "payment_due") return { level: "needs_attention", label: "Payment Due", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: AlertTriangle };
  if (activeBooking?.booking_status === "under_review") return { level: "needs_attention", label: "Under Review", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Clock };
  if (customer.booking_count > 0) return { level: "healthy", label: "Healthy", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 };
  return { level: "healthy", label: "Lead", color: "bg-gray-100 text-gray-500 border-gray-200", icon: CheckCircle2 };
}

const BOOKING_STATUS_LABEL = {
  active: "Active", confirmed: "Confirmed", approved: "Approved",
  completed: "Completed", cancelled: "Cancelled", suspended: "Suspended",
  under_review: "Under Review", payment_due: "Payment Due", grace_period: "Grace Period",
};

export default function CustomerCard({ customer, activeBooking, openDispute, isSelected, onClick }) {
  const c = customer;
  const risk = getRiskInfo(c, activeBooking, openDispute);
  const RiskIcon = risk.icon;
  const isRTO = activeBooking?.booking_type === "Rent-to-Own" || activeBooking?.contract_type === "rent_to_own";
  const lastActivity = c.updated_date || c.created_date;
  const lastActivityLabel = lastActivity ? formatDistanceToNow(new Date(lastActivity), { addSuffix: true }) : null;

  const paymentColor =
    activeBooking?.booking_status === "payment_due" ? "text-yellow-600" :
    activeBooking?.booking_status === "grace_period" ? "text-amber-600" :
    activeBooking?.booking_status === "suspended" ? "text-red-600" :
    ["active", "confirmed", "approved"].includes(activeBooking?.booking_status) ? "text-emerald-600" : null;

  const paymentLabel =
    activeBooking?.booking_status === "payment_due" ? "Payment Due" :
    activeBooking?.booking_status === "grace_period" ? "Grace Period" :
    activeBooking?.booking_status === "suspended" ? "Suspended" :
    ["active", "confirmed", "approved"].includes(activeBooking?.booking_status) ? "Current" : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-4 border-b border-gray-50 last:border-0 transition-colors ${isSelected ? "bg-pink-50/60" : "hover:bg-gray-50/60"}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white mt-0.5"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          {c.full_name?.charAt(0)?.toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-sm font-semibold text-gray-900">{c.full_name}</p>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${risk.color}`}>
              <RiskIcon className="h-2.5 w-2.5" />
              {risk.label}
            </span>
            {isRTO && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">RTO</span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 truncate mb-1">{c.email}</p>
          {activeBooking && (
            <p className="text-[11px] text-gray-500">
              {activeBooking.vehicle_name && <span>{activeBooking.vehicle_name} · </span>}
              <span>{BOOKING_STATUS_LABEL[activeBooking.booking_status] || activeBooking.booking_status}</span>
              {paymentLabel && <span className={`ml-1 font-semibold ${paymentColor}`}>· {paymentLabel}</span>}
            </p>
          )}
          <div className="flex gap-3 mt-1.5 text-[11px] text-gray-400">
            <span>{c.booking_count || 0} booking{c.booking_count !== 1 ? "s" : ""}</span>
            <span>${(c.total_spent || 0).toLocaleString()}</span>
            {lastActivityLabel && <span>{lastActivityLabel}</span>}
          </div>
        </div>
        <ChevronRight className={`h-4 w-4 text-gray-300 flex-shrink-0 mt-2 transition-transform ${isSelected ? "rotate-90" : ""}`} />
      </div>
    </button>
  );
}