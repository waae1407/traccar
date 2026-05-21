import React from "react";
import { Clock, Calendar, Car, ArrowRight } from "lucide-react";
import { format, addDays } from "date-fns";

function fmt(n) {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function UpcomingTransfers({ payouts = [], bookings = [], commissionRate = 0.08 }) {
  // Pending/processing payouts = upcoming transfers
  const upcoming = payouts
    .filter(p => p.status === "pending" || p.status === "processing")
    .sort((a, b) => {
      const da = a.payout_date || a.period_end || a.created_date;
      const db = b.payout_date || b.period_end || b.created_date;
      return new Date(da) - new Date(db);
    });

  // Also surface active bookings with upcoming billing dates (not yet a payout record)
  const upcomingBillingDates = bookings
    .filter(b => b.booking_status === "active" && b.next_billing_date)
    .filter(b => {
      const nd = new Date(b.next_billing_date);
      const now = new Date();
      return nd >= now && nd <= addDays(now, 14);
    })
    .sort((a, b) => new Date(a.next_billing_date) - new Date(b.next_billing_date))
    .slice(0, 5);

  const hasAnything = upcoming.length > 0 || upcomingBillingDates.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-pink-500" />
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Upcoming Transfers</h3>
          <p className="text-xs text-gray-400 mt-0.5">Expected payouts within the next 14 days</p>
        </div>
      </div>

      {!hasAnything ? (
        <div className="px-5 py-8 text-center">
          <Clock className="h-8 w-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Upcoming payouts will appear here after completed rentals or successful weekly billing.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {/* Pending payout records */}
          {upcoming.map(p => {
            const gross = p.gross_booking_amount || p.gross_collected || 0;
            const net = p.net_host_payout || p.net_payout || 0;
            const stripeFee = p.stripe_fee_amount || 0;
            const platformFee = p.uride_platform_fee_amount || p.platform_fee || 0;
            const expectedDate = p.payout_date || p.period_end;

            return (
              <div key={p.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Car className="h-3.5 w-3.5 text-pink-400 flex-shrink-0" />
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.vehicle_name || "Vehicle"}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-600 font-bold flex-shrink-0 border border-yellow-200">
                        {p.status === "processing" ? "Processing" : "Pending"}
                      </span>
                    </div>
                    {expectedDate && (
                      <p className="text-xs text-gray-400 mb-2">
                        Expected: <span className="text-gray-600 font-medium">
                          {format(new Date(expectedDate + "T12:00:00"), "MMM d, yyyy")} + 2 business days
                        </span>
                      </p>
                    )}
                    <FeeBreakdown gross={gross} platformFee={platformFee} stripeFee={stripeFee} net={net} commissionRate={p.uride_platform_fee_rate || commissionRate} />
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-black text-emerald-600">${fmt(net)}</p>
                    <p className="text-[10px] text-gray-400">net payout</p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Upcoming billing dates from active bookings */}
          {upcomingBillingDates.map(b => {
            const gross = b.weekly_rate || 0;
            const platformFee = Math.round(gross * commissionRate * 100) / 100;
            const stripeFee = Math.round(((gross + 0.30) / (1 - 0.029) - gross) * 100) / 100;
            const net = Math.max(0, gross - platformFee - stripeFee);

            return (
              <div key={b.id} className="px-5 py-4 bg-gray-50/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Car className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />
                      <p className="text-sm font-semibold text-gray-900 truncate">{b.vehicle_name || "Vehicle"}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-bold flex-shrink-0 border border-purple-200">
                        Scheduled
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">
                      Billing date: <span className="text-gray-600 font-medium">
                        {format(new Date(b.next_billing_date + "T12:00:00"), "MMM d, yyyy")}
                      </span>
                      {b.customer_full_name && <span className="ml-2">· {b.customer_full_name}</span>}
                    </p>
                    <FeeBreakdown gross={gross} platformFee={platformFee} stripeFee={stripeFee} net={net} commissionRate={commissionRate} />
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-black text-purple-600">~${fmt(net)}</p>
                    <p className="text-[10px] text-gray-400">est. net</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FeeBreakdown({ gross, platformFee, stripeFee, net, commissionRate }) {
  const rate = commissionRate || 0.08;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-400">
      <span>Gross: <span className="text-gray-700 font-medium">${(gross || 0).toFixed(2)}</span></span>
      <span>uRide Fee ({(rate * 100).toFixed(0)}%): <span className="text-red-500/80">-${(platformFee || 0).toFixed(2)}</span></span>
      <span>Stripe: <span className="text-red-500/80">-${(stripeFee || 0).toFixed(2)}</span></span>
      <span className="font-semibold text-emerald-600">Net: ${(net || 0).toFixed(2)}</span>
    </div>
  );
}