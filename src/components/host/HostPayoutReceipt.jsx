import React from "react";
import { X } from "lucide-react";

function fmt(num) {
  return (num || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function HostPayoutReceipt({ payout, onClose }) {
  if (!payout) return null;

  // Support both new detailed fields and legacy fields
  const gross = payout.gross_booking_amount || payout.gross_collected || 0;
  const stripeFee = payout.stripe_fee_amount || 0;
  const stripeRate = payout.stripe_effective_rate
    ? payout.stripe_effective_rate.toFixed(2)
    : gross > 0 && stripeFee > 0
    ? ((stripeFee / gross) * 100).toFixed(2)
    : null;
  const platformFee = payout.uride_platform_fee_amount || payout.platform_fee || 0;
  const platformRate = payout.uride_platform_fee_rate
    ? (payout.uride_platform_fee_rate * 100).toFixed(2)
    : gross > 0 && platformFee > 0
    ? ((platformFee / gross) * 100).toFixed(2)
    : "8.00";
  const netPayout = payout.net_host_payout || payout.net_payout || 0;

  const payoutId = `PO-${payout.id?.slice(-6)?.toUpperCase() || "000000"}`;
  const bookingRef = payout.booking_request_id
    ? `UR-${payout.booking_request_id.slice(-6).toUpperCase()}`
    : "—";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-base">Payout Statement</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Receipt body — monospace style */}
        <div className="p-6 font-mono text-sm text-gray-800 bg-gray-50">
          <div className="mb-5">
            <p className="font-bold text-base text-gray-900 mb-3">UrideHub — Host Payout Statement</p>
            <p><span className="text-gray-500">Payout ID:</span> {payoutId}</p>
            <p><span className="text-gray-500">Date:</span> {fmtDate(payout.payout_date || payout.created_date)}</p>
            {payout.period_start && payout.period_end && (
              <p><span className="text-gray-500">Period:</span> {fmtDate(payout.period_start)}–{fmtDate(payout.period_end)}</p>
            )}
          </div>

          <div className="mb-5">
            <p><span className="text-gray-500">Host:</span> {payout.host_name || "—"}</p>
            {bookingRef !== "—" && <p><span className="text-gray-500">Booking:</span> {bookingRef}</p>}
            {payout.vehicle_name && <p><span className="text-gray-500">Vehicle:</span> {payout.vehicle_name}</p>}
            {payout.period_start && payout.period_end && (
              <p><span className="text-gray-500">Rental Period:</span> {fmtDate(payout.period_start)} → {fmtDate(payout.period_end)}</p>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-gray-300 my-4" />

          {/* Line items */}
          <div className="space-y-2 mb-2">
            <div className="flex justify-between">
              <span>Booking amount:</span>
              <span className="font-semibold">${fmt(gross)}</span>
            </div>

            {stripeFee > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Payment processing — Stripe{stripeRate ? ` (${stripeRate}%)` : ""}:</span>
                <span>-${fmt(stripeFee)}</span>
              </div>
            )}

            <div className="flex justify-between text-gray-600">
              <span>Uride Platform Fee ({platformRate}%):</span>
              <span>-${fmt(platformFee)}</span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-gray-300 my-4" />

          {/* Net payout */}
          <div className="flex justify-between font-bold text-gray-900 text-base mb-1">
            <span>Net payout to host:</span>
            <span>${fmt(netPayout)}</span>
          </div>

          {/* Divider */}
          <div className="border-t border-dashed border-gray-300 my-4" />

          {/* Transfer info */}
          <div className="space-y-1 mb-5 text-gray-600">
            {payout.stripe_transfer_id && (
              <p><span className="text-gray-500">Stripe transfer ID:</span> {payout.stripe_transfer_id}</p>
            )}
            <p><span className="text-gray-500">Status:</span> <span className="capitalize font-semibold text-gray-800">{payout.status || "—"}</span></p>
          </div>

          {/* Note */}
          <div className="text-xs text-gray-500 leading-relaxed border-t border-gray-200 pt-4">
            <p className="font-semibold text-gray-600 mb-1">Note:</p>
            <p>Stripe processing fees are collected by Stripe. UrideHub does not treat Stripe processing fees as platform revenue.</p>
            <p className="mt-2">Questions? Contact <span className="text-gray-700">support@uridehub.com</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}