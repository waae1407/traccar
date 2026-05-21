import React, { useState } from "react";
import { ChevronDown, ChevronRight, Receipt } from "lucide-react";

const statusConfig = {
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

export default function PayoutRow({ payout, commissionRate = 0.08, onReceipt }) {
  const [expanded, setExpanded] = useState(false);
  const p = payout;

  const gross = p.gross_booking_amount || p.gross_collected || 0;
  const net = p.net_host_payout || p.net_payout || 0;
  const stripeFee = p.stripe_fee_amount || 0;
  const platformFee = p.uride_platform_fee_amount || p.platform_fee || 0;
  const effectiveRate = p.stripe_effective_rate;
  const appliedRate = p.uride_platform_fee_rate || commissionRate;
  const cfg = statusConfig[p.status] || statusConfig.pending;

  return (
    <div className="border-b border-gray-50 last:border-0">
      {/* Row summary */}
      <div
        className="px-5 py-4 cursor-pointer hover:bg-gray-50/60 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {p.vehicle_name || `Period ${p.period_start}`}
              </p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                {cfg.label}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              {p.period_start && `${p.period_start} — ${p.period_end}`}
              {p.payout_date && ` · Paid ${p.payout_date}`}
            </p>
            {/* Mini fee line */}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0 text-[11px] text-gray-400">
              <span>Gross: <span className="text-gray-600">${fmt(gross)}</span></span>
              {platformFee > 0 && <span>Fee ({(appliedRate * 100).toFixed(0)}%): <span className="text-red-400">-${fmt(platformFee)}</span></span>}
              {stripeFee > 0 && <span>Stripe: <span className="text-red-400">-${fmt(stripeFee)}</span></span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900">${fmt(net)}</p>
              <p className="text-xs text-gray-400">net payout</p>
            </div>
            {onReceipt && (
              <button
                onClick={e => { e.stopPropagation(); onReceipt(p); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <Receipt className="h-3 w-3" />
              </button>
            )}
            {expanded
              ? <ChevronDown className="h-4 w-4 text-gray-400" />
              : <ChevronRight className="h-4 w-4 text-gray-400" />
            }
          </div>
        </div>
      </div>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="px-5 pb-4 bg-gray-50/50">
          <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Payout Breakdown</p>
            <LineItem label="Gross Rental" value={`$${fmt(gross)}`} className="font-semibold text-gray-800" />
            <LineItem
              label={`uRide Platform Fee (${(appliedRate * 100).toFixed(0)}%)`}
              value={`-$${fmt(platformFee)}`}
              className="text-red-500/80"
            />
            <LineItem
              label={`Stripe Processing Fee${effectiveRate ? ` (${effectiveRate.toFixed(2)}%)` : ""}`}
              value={`-$${fmt(stripeFee)}`}
              className="text-red-500/80"
            />
            {(p.hold_reason || p.status === "held") && (
              <LineItem
                label={`Hold / Reserve${p.hold_reason ? ` (${p.hold_reason})` : ""}`}
                value="Held"
                className="text-orange-500"
              />
            )}
            <div className="border-t border-gray-100 pt-2 mt-2">
              <LineItem label="Net Payout" value={`$${fmt(net)}`} className="font-black text-emerald-600 text-base" />
            </div>
            {p.stripe_transfer_id && (
              <p className="text-[10px] text-gray-400 pt-1 font-mono">Transfer: {p.stripe_transfer_id}</p>
            )}
            {p.booking_request_id && (
              <p className="text-[10px] text-gray-400 font-mono">Booking: {p.booking_request_id.slice(0, 16)}…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LineItem({ label, value, className }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm ${className || "text-gray-700"}`}>{value}</span>
    </div>
  );
}