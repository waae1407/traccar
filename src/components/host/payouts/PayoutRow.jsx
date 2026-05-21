import React from "react";
import { ChevronRight, Receipt } from "lucide-react";
import { format } from "date-fns";

const STATUS_CFG = {
  pending:    { label: "Pending",    color: "text-yellow-600",  bg: "bg-yellow-50 border-yellow-200" },
  processing: { label: "Processing", color: "text-blue-600",    bg: "bg-blue-50 border-blue-200" },
  paid:       { label: "Paid",       color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  failed:     { label: "Failed",     color: "text-red-600",     bg: "bg-red-50 border-red-200" },
  held:       { label: "Held",       color: "text-orange-600",  bg: "bg-orange-50 border-orange-200" },
  released:   { label: "Released",   color: "text-purple-600",  bg: "bg-purple-50 border-purple-200" },
};

function fmt(n) {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PayoutRow({ payout, booking, onSelect, onReceipt }) {
  const p = payout;
  const gross = p.gross_booking_amount || p.gross_collected || 0;
  const net = p.net_host_payout || p.net_payout || 0;
  const stripeFee = p.stripe_fee_amount || 0;
  const platformFee = p.uride_platform_fee_amount || p.platform_fee || 0;
  const appliedRate = p.uride_platform_fee_rate || 0.08;
  const cfg = STATUS_CFG[p.status] || STATUS_CFG.pending;

  return (
    <div className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors">
      <button className="w-full text-left px-5 py-4" onClick={() => onSelect?.(p)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {p.vehicle_name || `Payout ${p.id?.slice(0, 8)}`}
              </p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                {cfg.label}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-2 text-[11px] text-gray-400">
              {p.period_start && (
                <span>{p.period_start} — {p.period_end}</span>
              )}
              {booking?.customer_full_name && (
                <span className="text-gray-500">· {booking.customer_full_name}</span>
              )}
              {p.payout_date && (
                <span>· Paid {p.payout_date}</span>
              )}
            </div>
            {/* Fee line */}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0 text-[11px] text-gray-400">
              <span>Gross: <span className="text-gray-600">${fmt(gross)}</span></span>
              {platformFee > 0 && <span>Fee ({(appliedRate * 100).toFixed(0)}%): <span className="text-red-400/80">-${fmt(platformFee)}</span></span>}
              {stripeFee > 0 && <span>Stripe: <span className="text-red-400/80">-${fmt(stripeFee)}</span></span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900">${fmt(net)}</p>
              <p className="text-[10px] text-gray-400">net</p>
            </div>
            {onReceipt && (
              <button onClick={e => { e.stopPropagation(); onReceipt(p); }}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
                <Receipt className="h-3.5 w-3.5 text-gray-500" />
              </button>
            )}
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </div>
        </div>
      </button>
    </div>
  );
}