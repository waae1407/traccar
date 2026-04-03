import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { DollarSign, FileText, ShieldCheck, Activity, CheckCircle2, AlertCircle, Clock, Car, PenLine } from "lucide-react";
import { format } from "date-fns";

const eventIcons = {
  account_created: { icon: CheckCircle2, bg: "bg-green-50", color: "text-green-600" },
  booking_started: { icon: Car, bg: "bg-blue-50", color: "text-blue-600" },
  id_uploaded: { icon: ShieldCheck, bg: "bg-purple-50", color: "text-purple-600" },
  verification_submitted: { icon: ShieldCheck, bg: "bg-purple-50", color: "text-purple-600" },
  verification_verified: { icon: CheckCircle2, bg: "bg-green-50", color: "text-green-600" },
  contract_generated: { icon: FileText, bg: "bg-indigo-50", color: "text-indigo-600" },
  contract_signed: { icon: PenLine, bg: "bg-indigo-50", color: "text-indigo-600" },
  payment_submitted: { icon: DollarSign, bg: "bg-yellow-50", color: "text-yellow-600" },
  payment_received: { icon: DollarSign, bg: "bg-green-50", color: "text-green-600" },
  booking_confirmed: { icon: CheckCircle2, bg: "bg-green-50", color: "text-green-600" },
  booking_active: { icon: Car, bg: "bg-green-50", color: "text-green-600" },
  payment_due_soon: { icon: Clock, bg: "bg-amber-50", color: "text-amber-600" },
  payment_overdue: { icon: AlertCircle, bg: "bg-red-50", color: "text-red-600" },
  under_review: { icon: AlertCircle, bg: "bg-yellow-50", color: "text-yellow-600" },
  booking_completed: { icon: CheckCircle2, bg: "bg-gray-50", color: "text-gray-600" },
  profile_updated: { icon: CheckCircle2, bg: "bg-blue-50", color: "text-blue-600" },
};

export default function ActivityPage() {
  const { user } = useOutletContext() || {};

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["activity-events", user?.email],
    queryFn: () => base44.entities.ActivityEvent.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: payments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ["my-payments", user?.email],
    queryFn: () => base44.entities.Payment.filter({ created_by: user?.email }),
    enabled: !!user?.email,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["my-booking-requests", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
        <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Activity className="h-7 w-7 text-gray-400" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg">Sign in to view activity</h3>
        <p className="text-gray-400 text-sm mt-2">Payments, documents, and contract updates will show here.</p>
        <button onClick={() => base44.auth.redirectToLogin(window.location.href)}
          className="mt-5 px-6 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Sign In
        </button>
      </div>
    );
  }

  // Sum payment_received events for accurate total paid
  const totalPaid = events
    .filter((e) => e.event_type === "payment_received")
    .reduce((s, e) => s + (e.amount || 0), 0);

  // Deduplicate bookings by vehicle (same logic as MyBookings)
  const STATUS_PRIORITY = {
    active: 7, confirmed: 6, pending_review: 5, pending_payment: 4,
    pending_contract: 3, pending_verification: 2, draft: 1,
    completed: 0, cancelled: 0,
  };
  const dedupedBookings = Object.values(
    bookings.reduce((acc, b) => {
      const key = b.vehicle_id || b.id;
      const existing = acc[key];
      const bP = STATUS_PRIORITY[b.booking_status] ?? 0;
      const eP = existing ? (STATUS_PRIORITY[existing.booking_status] ?? 0) : -1;
      if (!existing || bP > eP || (bP === eP && new Date(b.updated_date) > new Date(existing.updated_date))) {
        acc[key] = b;
      }
      return acc;
    }, {})
  ).filter((b) => ["active", "confirmed"].includes(b.booking_status));

  const activeBooking = dedupedBookings.find((b) => ["active", "confirmed", "pending_review"].includes(b.booking_status));

  return (
    <div className="px-4 py-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="h-8 w-8 rounded-xl bg-green-50 flex items-center justify-center mb-2">
            <DollarSign className="h-4 w-4 text-green-600" />
          </div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Total Paid</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">${totalPaid.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center mb-2">
            <Car className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Bookings</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{dedupedBookings.length}</p>
        </div>
      </div>

      {/* Active booking status */}
      {activeBooking && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Active Rental</p>
          <p className="font-bold text-gray-900">{activeBooking.vehicle_name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeBooking.payment_status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
              {activeBooking.booking_status?.replace(/_/g, " ")}
            </span>
            {activeBooking.booking_type === "Rent-to-Own" && (
              <span className="text-xs font-semibold text-pink-600">Rent-to-Own</span>
            )}
          </div>
        </div>
      )}

      {/* Activity timeline */}
      <h2 className="font-bold text-gray-900 text-base mb-3">Activity Timeline</h2>
      {loadingEvents ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
          <p className="text-gray-400 text-sm">No activity yet. Start by booking a vehicle.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-100" />
          <div className="space-y-4">
            {[...events].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).map((ev) => {
              const cfg = eventIcons[ev.event_type] || { icon: Activity, bg: "bg-gray-50", color: "text-gray-500" };
              const Icon = cfg.icon;
              return (
                <div key={ev.id} className="flex gap-3 pl-1">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 z-10 ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 bg-white rounded-2xl border border-gray-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-gray-900 text-sm">{ev.event_title}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        ev.event_status === "success" ? "bg-green-100 text-green-700" :
                        ev.event_status === "warning" ? "bg-yellow-100 text-yellow-700" :
                        ev.event_status === "error" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                      }`}>{ev.event_status}</span>
                    </div>
                    {ev.event_description && <p className="text-xs text-gray-400 mt-0.5">{ev.event_description}</p>}
                    {ev.amount && <p className="text-sm font-bold text-green-600 mt-1">${ev.amount.toLocaleString()}</p>}
                    <p className="text-[10px] text-gray-300 mt-1">{ev.created_date ? format(new Date(ev.created_date), "MMM d, yyyy · h:mm a") : ""}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}