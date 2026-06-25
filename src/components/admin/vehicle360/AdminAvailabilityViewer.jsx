import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar, Lock, Repeat, AlertTriangle, Ban, Wrench, User, Clock, Search, TrendingUp } from "lucide-react";
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isBefore } from "date-fns";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const STATUS_CONFIG = {
  available: { icon: null, color: "bg-green-500/20 text-green-400", label: "Available" },
  booked: { icon: Ban, color: "bg-red-500/20 text-red-400", label: "Booked" },
  unavailable: { icon: Ban, color: "bg-gray-500/20 text-gray-400", label: "Host Blocked" },
  maintenance: { icon: Wrench, color: "bg-orange-500/20 text-orange-400", label: "Maintenance" },
  personal_use: { icon: User, color: "bg-purple-500/20 text-purple-400", label: "Personal Use" },
  return_required: { icon: Clock, color: "bg-amber-500/20 text-amber-400", label: "Return Pending" },
  host_review: { icon: Clock, color: "bg-amber-500/20 text-amber-400", label: "Host Review" },
  checkout_in_progress: { icon: Lock, color: "bg-yellow-400/20 text-yellow-400", label: "Checkout in Progress" },
};

export default function AdminAvailabilityViewer({ vehicleId }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");

  const startMonth = format(currentMonth, "yyyy-MM");
  const endMonth = format(addMonths(currentMonth, 1), "yyyy-MM");

  const { data: calendarData, isLoading } = useQuery({
    queryKey: ["admin-availability", vehicleId, startMonth, endMonth],
    queryFn: () =>
      base44.functions
        .invoke("getVehicleAvailabilityCalendar", {
          vehicle_id: vehicleId,
          start_month: startMonth,
          end_month: endMonth,
        })
        .then((r) => r.data),
    enabled: !!vehicleId,
  });

  const { data: recurringRules = [] } = useQuery({
    queryKey: ["admin-recurring-rules", vehicleId],
    queryFn: () =>
      base44.asServiceRole.entities.VehicleRecurringAvailability.filter({
        vehicle_id: vehicleId,
        is_active: true,
      }),
    enabled: !!vehicleId,
  });

  const { data: availabilityRules = [] } = useQuery({
    queryKey: ["admin-availability-rules", vehicleId],
    queryFn: () =>
      base44.asServiceRole.entities.VehicleAvailabilityRule.filter({
        vehicle_id: vehicleId,
        is_active: true,
      }),
    enabled: !!vehicleId,
  });

  const { data: activeLocks = [] } = useQuery({
    queryKey: ["admin-active-locks", vehicleId],
    queryFn: () =>
      base44.asServiceRole.entities.BookingHold.filter({
        vehicle_id: vehicleId,
        status: "active",
      }),
    enabled: !!vehicleId,
  });

  const { data: conflictingBookings = [] } = useQuery({
    queryKey: ["admin-conflicting-bookings", vehicleId],
    queryFn: async () => {
      const BLOCKING_STATUSES = [
        "pending_payment", "pending_review", "approved", "confirmed", "checked_out",
        "active", "return_required", "post_inspection_required", "overdue_return",
        "return_pending_host_review", "grace_period", "payment_due", "suspended", "under_review",
      ];
      const raw = await base44.asServiceRole.entities.BookingRequest.filter({
        vehicle_id: vehicleId,
        booking_status: { $in: BLOCKING_STATUSES },
      });
      return raw.filter((b) => !b.is_superseded);
    },
    enabled: !!vehicleId,
  });

  // Categorize bookings by lifecycle phase for admin clarity
  const returningSoonBookings = conflictingBookings.filter(b =>
    b.rental_lifecycle_phase === 'return_required' ||
    b.rental_lifecycle_phase === 'return_in_progress' ||
    b.rental_lifecycle_phase === 'host_review' ||
    ['return_required', 'post_inspection_required', 'overdue_return', 'return_pending_host_review'].includes(b.booking_status)
  );

  const checkoutInProgressLocks = activeLocks.filter(lock => {
    const ageSec = Math.floor((Date.now() - new Date(lock.hold_start).getTime()) / 1000);
    return ageSec < 120;
  });

  // Search filter for bookings/conflicts
  const searchLower = searchQuery.toLowerCase().trim();
  const filteredBookings = searchLower
    ? conflictingBookings.filter(b =>
        (b.customer_full_name?.toLowerCase().includes(searchLower)) ||
        (b.user_email?.toLowerCase().includes(searchLower)) ||
        (b.id?.toLowerCase().includes(searchLower)) ||
        (b.vehicle_name?.toLowerCase().includes(searchLower))
      )
    : conflictingBookings;

  if (!vehicleId) return null;

  const rules = calendarData?.rules || {};
  const calendar = calendarData?.calendar || [];
  const blockedDays = calendar.filter((d) => d.status !== "available" && d.status !== "unavailable" || (d.status === "unavailable" && d.reason_code !== "past_date" && d.reason_code !== "host_blocked_by_default"));
  const unavailableReasons = calendar.filter((d) => d.can_book === false && d.reason_code);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = Array.from({ length: monthStart.getDay() }, () => null);

  const getDayData = (date) => calendar.find((d) => d.date === format(date, "yyyy-MM-dd"));

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by VIN, vehicle, host, booking ID, or customer email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Vehicle Availability Settings Summary */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" /> Availability Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Min Rental Days</p>
              <p className="font-bold">{rules.minimum_rental_days ?? 7}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Advance Notice</p>
              <p className="font-bold">{rules.advance_notice_hours ?? 0}h</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Instant Booking</p>
              <Badge className={rules.instant_booking_enabled ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>
                {rules.instant_booking_enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contactless</p>
              <Badge className={rules.contactless_pickup ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}>
                {rules.contactless_pickup ? "Yes" : "No"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pickup Window</p>
              <p className="font-bold text-xs">
                {rules.pickup_window_start ? `${rules.pickup_window_start}–${rules.pickup_window_end}` : "Anytime"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Return Window</p>
              <p className="font-bold text-xs">
                {rules.return_window_start ? `${rules.return_window_start}–${rules.return_window_end}` : "Anytime"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Delivery</p>
              <Badge className={rules.delivery_available ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}>
                {rules.delivery_available ? "Available" : "Not offered"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rental Types</p>
              <div className="flex flex-wrap gap-1">
                {rules.rental_types?.daily && <Badge variant="outline" className="text-xs">Daily</Badge>}
                {rules.rental_types?.weekly && <Badge variant="outline" className="text-xs">Weekly</Badge>}
                {rules.rental_types?.monthly && <Badge variant="outline" className="text-xs">Monthly</Badge>}
                {rules.rental_types?.rent_to_own && <Badge variant="outline" className="text-xs">RTO</Badge>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Availability Calendar
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const prev = addMonths(currentMonth, -1);
                  if (!isBefore(prev, new Date()) || isSameMonth(prev, new Date()))
                    setCurrentMonth(prev);
                }}
                className="p-1 rounded hover:bg-muted"
              >
                <span className="text-muted-foreground">←</span>
              </button>
              <span className="text-sm font-bold">{format(currentMonth, "MMMM yyyy")}</span>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 rounded hover:bg-muted">
                <span className="text-muted-foreground">→</span>
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {leadingBlanks.map((_, i) => <div key={`b-${i}`} className="aspect-square" />)}
                {daysInMonth.map((date) => {
                  const dayData = getDayData(date);
                  const config = STATUS_CONFIG[dayData?.status] || STATUS_CONFIG.available;
                  return (
                    <div
                      key={date.toISOString()}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs ${config.color}`}
                      title={dayData ? `${format(date, "MMM d")}: ${dayData.host_label || dayData.customer_label || dayData.status}` : format(date, "MMM d")}
                    >
                      <span className="font-medium">{format(date, "d")}</span>
                      {dayData?.can_book === false && dayData.reason_code && dayData.reason_code !== "available" && (
                        <span className="text-[8px] truncate max-w-full opacity-70">
                          {dayData.customer_label?.slice(0, 6)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border/50">
                {Object.entries(STATUS_CONFIG).filter(([k]) => k !== "available").map(([key, c]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div className={`h-2.5 w-2.5 rounded ${c.color}`} />
                    <span className="text-[10px] text-muted-foreground">{c.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Returning Soon — vehicles in return/host_review phase */}
      {returningSoonBookings.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-500" /> Returning Soon ({returningSoonBookings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {returningSoonBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{b.customer_full_name || b.user_email || "—"}</p>
                  <p className="text-xs text-muted-foreground">{b.start_date} → {b.end_date}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">Returning Soon</Badge>
                  {b.rental_lifecycle_phase && <Badge variant="outline" className="text-xs">{b.rental_lifecycle_phase}</Badge>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Active Booking Conflicts */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Active Booking Conflicts ({filteredBookings.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredBookings.length === 0 && <p className="text-muted-foreground text-sm">No active bookings blocking this vehicle.</p>}
          {filteredBookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{b.customer_full_name || b.user_email || "—"}</p>
                <p className="text-xs text-muted-foreground">{b.start_date} → {b.end_date}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{b.booking_status}</Badge>
                {b.rental_lifecycle_phase && <Badge variant="outline" className="text-xs">{b.rental_lifecycle_phase}</Badge>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Checkout In Progress — Fast-Commit Locks */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="h-4 w-4 text-yellow-500" /> Checkout in Progress ({checkoutInProgressLocks.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {checkoutInProgressLocks.length === 0 && <p className="text-muted-foreground text-sm">No active checkout locks.</p>}
          {checkoutInProgressLocks.map((lock) => {
            const ageSec = Math.floor((Date.now() - new Date(lock.hold_start).getTime()) / 1000);
            return (
              <div key={lock.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{lock.customer_email || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">Lock age: {ageSec}s · Expires: {format(new Date(lock.hold_expires_at), "MMM d, h:mm a")}</p>
                </div>
                <Badge className={ageSec < 120 ? "bg-yellow-500/20 text-yellow-400" : "bg-muted text-muted-foreground"}>
                  {ageSec < 120 ? "Fast-Commit" : "Stale"}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Availability Rules */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Ban className="h-4 w-4 text-gray-400" /> Date-Specific Rules ({availabilityRules.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {availabilityRules.length === 0 && <p className="text-muted-foreground text-sm">No date-specific rules.</p>}
          {availabilityRules.slice(0, 20).map((rule) => (
            <div key={rule.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div>
                <p className="font-medium capitalize">{rule.rule_type}</p>
                <p className="text-xs text-muted-foreground">{rule.start_date}{rule.end_date ? ` → ${rule.end_date}` : ""}</p>
                {rule.customer_reason && <p className="text-xs text-muted-foreground">{rule.customer_reason}</p>}
              </div>
              <Badge variant="outline" className="text-xs">{rule.is_active ? "Active" : "Inactive"}</Badge>
            </div>
          ))}
          {availabilityRules.length > 20 && <p className="text-xs text-muted-foreground">Showing 20 of {availabilityRules.length} rules…</p>}
        </CardContent>
      </Card>

      {/* Recurring Rules */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Repeat className="h-4 w-4 text-purple-400" /> Recurring Rules ({recurringRules.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recurringRules.length === 0 && <p className="text-muted-foreground text-sm">No recurring rules configured.</p>}
          {recurringRules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div>
                <p className="font-medium capitalize">{rule.recurrence_pattern} · {rule.availability_type}</p>
                <p className="text-xs text-muted-foreground">
                  {rule.start_date}{rule.end_date ? ` → ${rule.end_date}` : " (ongoing)"}
                  {rule.weekly_days?.length > 0 && ` · Days: ${rule.weekly_days.join(",")}`}
                  {rule.monthly_day && ` · Day ${rule.monthly_day}`}
                </p>
              </div>
              <Badge variant="outline" className="text-xs">{rule.blocked_reason?.replace(/_/g, " ")}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}