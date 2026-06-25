import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, CheckCircle2, XCircle, Ban, Clock, Gavel, RefreshCw, DollarSign, Calendar, Heart } from "lucide-react";
import { differenceInDays, format, isValid } from "date-fns";

function safeDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isValid(d) ? d : null;
}

function Metric({ icon: Icon, label, value, color }) {
  return (
    <div className="flex flex-col items-center text-center p-3 rounded-lg bg-secondary/30">
      <Icon className={`h-4 w-4 mb-1 ${color || "text-muted-foreground"}`} />
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

/**
 * CustomerRentalHistoryMetrics — permanent rental history summary
 * for Customer360. Computes all metrics from the bookings array,
 * keyed by booking_id (no vehicle_id dedup).
 */
export default function CustomerRentalHistoryMetrics({ bookings = [], paymentLogs = [], disputes = [] }) {
  const allBookings = bookings;
  const completed = allBookings.filter((b) => b.booking_status === "completed" && !b.is_superseded);
  const cancelled = allBookings.filter((b) => b.booking_status === "cancelled" && !b.is_superseded);
  const voided = allBookings.filter((b) => b.is_superseded || b.booking_status === "superseded_invalid");
  const active = allBookings.filter((b) =>
    ["active", "confirmed", "approved", "checked_out", "return_required", "post_inspection_required",
     "overdue_return", "return_pending_host_review", "payment_due", "grace_period"].includes(b.booking_status)
  );

  // Late returns: completed bookings with return_completed_at > scheduled_end_at
  const lateReturns = completed.filter((b) => {
    const ret = safeDate(b.return_completed_at);
    const sched = safeDate(b.scheduled_end_at);
    return ret && sched && ret.getTime() > sched.getTime();
  });

  // Damage claims
  const damageClaims = allBookings.filter((b) =>
    b.damage_dispute_status && b.damage_dispute_status !== "none"
  );

  // Refunds
  const refunds = allBookings.filter((b) => b.payment_status === "refunded");

  // Lifetime spend from payment logs
  const lifetimeSpend = paymentLogs
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  // Lifetime rental days
  const lifetimeRentalDays = completed.reduce((sum, b) => {
    const start = safeDate(b.start_date);
    const end = safeDate(b.rental_ended_at) || safeDate(b.end_date);
    if (!start || !end) return sum;
    return sum + Math.max(0, differenceInDays(end, start));
  }, 0);

  // Favorite vehicle class (by make of completed rentals)
  const vehicleClassCounts = {};
  completed.forEach((b) => {
    const make = b.vehicle_name?.split(" ")?.find((w, i) => i === 1) || b.vehicle_name;
    if (make) vehicleClassCounts[make] = (vehicleClassCounts[make] || 0) + 1;
  });
  const favoriteClass = Object.entries(vehicleClassCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  // Last rental
  const lastRental = [...completed].sort((a, b) =>
    safeDate(b.rental_ended_at || b.updated_date)?.getTime() - safeDate(a.rental_ended_at || a.updated_date)?.getTime()
  )[0];

  // Next booking
  const nextBooking = active.sort((a, b) =>
    safeDate(a.start_date)?.getTime() - safeDate(b.start_date)?.getTime()
  )[0];

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Car className="h-4 w-4 text-primary" /> Rental History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Core metrics grid */}
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <Metric icon={Car} label="Lifetime Rentals" value={allBookings.length} color="text-blue-400" />
          <Metric icon={CheckCircle2} label="Completed" value={completed.length} color="text-green-400" />
          <Metric icon={XCircle} label="Cancelled" value={cancelled.length} color="text-gray-400" />
          <Metric icon={Ban} label="Voided" value={voided.length} color="text-gray-400" />
          <Metric icon={Clock} label="Late Returns" value={lateReturns.length} color="text-orange-400" />
          <Metric icon={Gavel} label="Disputes" value={damageClaims.length} color="text-red-400" />
          <Metric icon={RefreshCw} label="Refunds" value={refunds.length} color="text-purple-400" />
          <Metric icon={DollarSign} label="Lifetime Spend" value={`$${lifetimeSpend.toLocaleString()}`} color="text-green-400" />
          <Metric icon={Calendar} label="Rental Days" value={lifetimeRentalDays} color="text-blue-400" />
          <Metric icon={Heart} label="Fav Class" value={favoriteClass} color="text-pink-400" />
        </div>

        {/* Last rental + Next booking */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {lastRental && (
            <div className="rounded-lg bg-secondary/20 px-3 py-2 text-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Last Rental</p>
              <p className="font-medium text-foreground">{lastRental.vehicle_name || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {lastRental.start_date ? format(safeDate(lastRental.start_date), "MMM d, yyyy") : "—"}
                {lastRental.rental_ended_at ? ` → ${format(safeDate(lastRental.rental_ended_at), "MMM d, yyyy")}` : ""}
              </p>
            </div>
          )}
          {nextBooking && (
            <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Next Booking</p>
              <p className="font-medium text-foreground">{nextBooking.vehicle_name || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {nextBooking.start_date ? `Starts ${format(safeDate(nextBooking.start_date), "MMM d, yyyy")}` : "—"}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}