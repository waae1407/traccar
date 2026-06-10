import React from "react";
import { base44 } from "@/api/base44Client";
import { sanitizeInternalText } from "@/lib/displayFormatters";
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
  const { user, brand } = useOutletContext() || {};
  const brandColor = brand?.brand_color || "#e91e8c";
  const secondaryColor = brand?.secondary_color || "#7c3aed";
  const heroGradient = `linear-gradient(135deg, ${brandColor}, ${secondaryColor})`;

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
          style={{ background: heroGradient }}>
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
    <div className="pb-6">
      {/* Hero banner */}
      <div className="relative overflow-hidden mb-5" style={{ background: heroGradient }}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 60%)" }} />
        <div className="relative z-10 px-5 pt-7 pb-7">
          <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-1">Your Journey</p>
          <h1 className="text-2xl font-black text-white" style={{ fontFamily: "var(--font-syne)" }}>Activity</h1>
          {/* Stats row */}
          <div className="flex gap-5 mt-4">
            <div>
              <p className="text-2xl font-black text-white" style={{ fontFamily: "var(--font-syne)" }}>${totalPaid.toLocaleString()}</p>
              <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">Total Paid</p>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <p className="text-2xl font-black text-white" style={{ fontFamily: "var(--font-syne)" }}>{dedupedBookings.length}</p>
              <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">Rentals</p>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <p className="text-2xl font-black text-white" style={{ fontFamily: "var(--font-syne)" }}>{events.length}</p>
              <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">Events</p>
            </div>
          </div>
        </div>
        <div className="h-5"><svg viewBox="0 0 375 20" fill="#f8f8fa" className="w-full" preserveAspectRatio="none"><path d="M0 20L375 20L375 5C300 18 180 1 0 12L0 20Z"/></svg></div>
      </div>

      <div className="px-5">
        {/* Active booking status */}
        {activeBooking && (
          <div className="rounded-3xl overflow-hidden mb-5 shadow-sm" style={{ background: heroGradient }}>
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider mb-1">Active Rental</p>
              <p className="font-black text-white text-base" style={{ fontFamily: "var(--font-syne)" }}>{activeBooking.vehicle_name}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/20 text-white capitalize">
                  {activeBooking.booking_status?.replace(/_/g, " ")}
                </span>
                {activeBooking.booking_type === "Rent-to-Own" && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/20 text-white">Rent-to-Own</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Activity timeline */}
        <h2 className="font-black text-gray-900 text-base mb-4" style={{ fontFamily: "var(--font-syne)" }}>Timeline</h2>
        {loadingEvents ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-3xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-gray-100 shadow-sm">
            <Activity className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No activity yet. Start by booking a vehicle.</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[22px] top-4 bottom-4 w-0.5 bg-gray-100 rounded-full" />
            <div className="space-y-3">
              {[...events].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).map((ev) => {
                const cfg = eventIcons[ev.event_type] || { icon: Activity, bg: "bg-gray-50", color: "text-gray-500" };
                const Icon = cfg.icon;
                return (
                  <div key={ev.id} className="flex gap-3">
                    <div className={`h-11 w-11 rounded-2xl flex items-center justify-center flex-shrink-0 z-10 shadow-sm ${cfg.bg}`}>
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 bg-white rounded-3xl border border-gray-100 shadow-sm px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-gray-900 text-sm">{sanitizeInternalText(ev.event_title)}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                          ev.event_status === "success" ? "bg-green-100 text-green-700" :
                          ev.event_status === "warning" ? "bg-amber-100 text-amber-700" :
                          ev.event_status === "error" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
                        }`}>{ev.event_status === 'success' ? 'Completed' : ev.event_status === 'warning' ? 'Attention' : ev.event_status === 'error' ? 'Issue' : ev.event_status || 'Update'}</span>
                      </div>
                      {ev.event_description && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{sanitizeInternalText(ev.event_description)}</p>}
                      {ev.amount && <p className="text-sm font-black text-emerald-600 mt-1">${ev.amount.toLocaleString()}</p>}
                      <p className="text-[10px] text-gray-300 mt-1.5">{ev.created_date ? format(new Date(ev.created_date), "MMM d, yyyy · h:mm a") : ""}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}