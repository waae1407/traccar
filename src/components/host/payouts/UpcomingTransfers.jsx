import React from "react";
import { Clock, Calendar, Car, User } from "lucide-react";
import { format, addDays } from "date-fns";

function fmt(n) {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_CFG = {
  pending:    { label: "Pending",    bg: "bg-yellow-50 border-yellow-200", color: "text-yellow-600" },
  processing: { label: "Processing", bg: "bg-blue-50 border-blue-200",     color: "text-blue-600" },
  scheduled:  { label: "Scheduled",  bg: "bg-purple-50 border-purple-200", color: "text-purple-600" },
  held:       { label: "Held",       bg: "bg-orange-50 border-orange-200", color: "text-orange-600" },
};

export default function UpcomingTransfers({ payouts = [], bookingMap = {}, onSelect }) {
  const upcoming = payouts
    .filter(p => ["pending", "processing", "scheduled", "held"].includes(p.status))
    .sort((a, b) => {
      const da = a.payout_date || a.period_end || a.created_date;
      const db = b.payout_date || b.period_end || b.created_date;
      return new Date(da) - new Date(db);
    })
    .slice(0, 10);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-pink-500" />
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Upcoming Transfers</h3>
          <p className="text-xs text-gray-400 mt-0.5">Pending, processing, and scheduled payouts</p>
        </div>
        {upcoming.length > 0 && (
          <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">
            {upcoming.length}
          </span>
        )}
      </div>

      {upcoming.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <Clock className="h-8 w-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Upcoming payouts will appear here after completed rentals or successful weekly billing.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {upcoming.map(p => {
            const booking = p.booking_request_id ? bookingMap[p.booking_request_id] : null;
            const gross = p.gross_booking_amount || p.gross_collected || 0;
            const net = p.net_host_payout || p.net_payout || 0;
            const stripeFee = p.stripe_fee_amount || 0;
            const platformFee = p.uride_platform_fee_amount || p.platform_fee || 0;
            const appliedRate = p.uride_platform_fee_rate || 0.08;
            const expectedDate = p.payout_date || p.period_end;
            const cfg = STATUS_CFG[p.status] || STATUS_CFG.pending;

            return (
              <button key={p.id} onClick={() => onSelect?.(p)}
                className="w-full text-left px-5 py-4 hover:bg-gray-50/60 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Car className="h-3.5 w-3.5 text-pink-400 flex-shrink-0" />
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.vehicle_name || "Vehicle"}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    {booking && (
                      <p className="text-[11px] text-gray-400 flex items-center gap-1 mb-1">
                        <User className="h-3 w-3" />
                        {booking.customer_full_name || booking.user_email || "—"}
                      </p>
                    )}
                    {expectedDate ? (
                      <p className="text-xs text-gray-400">
                        Expected: <span className="text-gray-600 font-medium">
                          {format(new Date(expectedDate + "T12:00:00"), "MMM d, yyyy")} + 2 business days
                        </span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 italic">Expected date: per payout policy after transfer initiates</p>
                    )}
                    {/* Fee breakdown */}
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0 text-[11px] text-gray-400">
                      <span>Gross: <span className="text-gray-600">${fmt(gross)}</span></span>
                      <span>Fee ({(appliedRate * 100).toFixed(0)}%): <span className="text-red-400/80">-${fmt(platformFee)}</span></span>
                      <span>Stripe: <span className="text-red-400/80">-${fmt(stripeFee)}</span></span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-black text-emerald-600">${fmt(net)}</p>
                    <p className="text-[10px] text-gray-400">net payout</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}