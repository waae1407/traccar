import React, { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

const ATTENTION_STATUSES = new Set(["payment_due", "grace_period", "suspended", "under_review"]);

const REASON_COLOR = {
  "Suspended": "text-red-600 bg-red-50 border-red-200",
  "Grace Period": "text-amber-600 bg-amber-50 border-amber-200",
  "Payment Due": "text-yellow-600 bg-yellow-50 border-yellow-200",
  "Under Review": "text-blue-600 bg-blue-50 border-blue-200",
  "Open Dispute": "text-orange-600 bg-orange-50 border-orange-200",
};

function getAttentionReason(booking, hasDispute) {
  if (hasDispute) return "Open Dispute";
  if (booking?.booking_status === "suspended") return "Suspended";
  if (booking?.booking_status === "grace_period") return "Grace Period";
  if (booking?.booking_status === "payment_due") return "Payment Due";
  if (booking?.booking_status === "under_review") return "Under Review";
  return null;
}

export default function NeedsAttention({ customers, bookingsByEmail, disputesByBookingId, onSelect }) {
  const [expanded, setExpanded] = useState(true);

  const attentionList = customers.filter(c => {
    const bks = bookingsByEmail[c.email] || [];
    const hasDispute = bks.some(b => disputesByBookingId[b.id]);
    const hasIssue = bks.some(b => ATTENTION_STATUSES.has(b.booking_status));
    return hasDispute || hasIssue;
  });

  if (attentionList.length === 0) return null;

  return (
    <div className="rounded-2xl border border-yellow-200 bg-yellow-50 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-bold text-yellow-800">
            {attentionList.length} Customer{attentionList.length !== 1 ? "s" : ""} Need Attention
          </span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-yellow-500" /> : <ChevronDown className="h-4 w-4 text-yellow-500" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {attentionList.map(c => {
            const bks = bookingsByEmail[c.email] || [];
            const active = bks.find(b => ATTENTION_STATUSES.has(b.booking_status));
            const hasDispute = bks.some(b => disputesByBookingId[b.id]);
            const reason = getAttentionReason(active, hasDispute);
            const colorClass = REASON_COLOR[reason] || "text-gray-600 bg-gray-100 border-gray-200";
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="w-full flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-yellow-100 hover:border-yellow-300 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-800">{c.full_name}</p>
                  {active?.vehicle_name && <p className="text-[11px] text-gray-400">{active.vehicle_name}</p>}
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colorClass}`}>
                  {reason}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}