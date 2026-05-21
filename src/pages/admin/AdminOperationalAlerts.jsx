import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Clock, CheckCircle2, DollarSign, Car, RefreshCw, Shield, ChevronRight } from "lucide-react";
import { format, differenceInHours, isPast } from "date-fns";

const STATUS_CONFIG = {
  payment_due: {
    label: "Payment Due",
    color: "text-yellow-400",
    bg: "bg-yellow-500/20 border-yellow-500/30",
    icon: Clock,
    priority: 2,
  },
  grace_period: {
    label: "Grace Period",
    color: "text-orange-400",
    bg: "bg-orange-500/20 border-orange-500/30",
    icon: AlertTriangle,
    priority: 1,
  },
  suspended: {
    label: "Suspended",
    color: "text-red-400",
    bg: "bg-red-500/20 border-red-500/30",
    icon: Shield,
    priority: 0,
  },
};

function GraceCountdown({ endsAt }) {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  const hoursLeft = differenceInHours(end, new Date());
  const expired = isPast(end);

  if (expired) return <span className="text-[10px] font-bold text-red-400">⏰ EXPIRED</span>;
  if (hoursLeft <= 12) return <span className="text-[10px] font-bold text-red-400">⏰ {hoursLeft}h left</span>;
  if (hoursLeft <= 24) return <span className="text-[10px] font-bold text-orange-400">⏰ {hoursLeft}h left</span>;
  return <span className="text-[10px] font-semibold text-yellow-400">⏰ {hoursLeft}h left</span>;
}

function BookingAlertCard({ booking }) {
  const st = STATUS_CONFIG[booking.booking_status] || STATUS_CONFIG.payment_due;
  const Icon = st.icon;
  const maxAttempts = 3;
  const attempts = booking.payment_failure_attempts || 0;

  return (
    <div className={`rounded-xl border p-4 transition-all ${st.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${st.bg} border ${st.bg.split(' ')[1]}`}>
            <Icon className={`h-4 w-4 ${st.color}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${st.bg} ${st.color}`}>
                {st.label}
              </span>
              <GraceCountdown endsAt={booking.grace_period_ends_at} />
            </div>
            <p className="text-xs font-bold text-foreground leading-tight">
              {booking.customer_full_name || booking.user_email}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {booking.vehicle_name} · ${booking.weekly_rate}/wk
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs font-bold text-foreground">{attempts}/{maxAttempts} retries</p>
          {booking.last_retry_at && (
            <p className="text-[10px] text-muted-foreground">
              Last: {format(new Date(booking.last_retry_at), "MMM d h:mma")}
            </p>
          )}
          {booking.grace_period_ends_at && (
            <p className="text-[10px] text-muted-foreground">
              Ends: {format(new Date(booking.grace_period_ends_at), "MMM d h:mma")}
            </p>
          )}
        </div>
      </div>

      {booking.payment_failure_reason && (
        <p className="text-[10px] text-muted-foreground mt-2 pl-11 italic">
          "{booking.payment_failure_reason}"
        </p>
      )}

      <div className="flex gap-2 mt-3 pl-11">
        <a
          href={`/bookings-admin?search=${booking.id}`}
          className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
        >
          View Booking <ChevronRight className="h-3 w-3" />
        </a>
        {booking.suspension_triggered_at && (
          <span className="text-[10px] text-red-400 font-bold">
            Suspended: {format(new Date(booking.suspension_triggered_at), "MMM d")}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AdminOperationalAlerts() {
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: allBookings = [], isLoading, refetch } = useQuery({
    queryKey: ["grace-period-bookings"],
    queryFn: async () => {
      const allFailed = await base44.entities.BookingRequest.filter({ payment_status: "failed" });
      const suspended = await base44.entities.BookingRequest.filter({ booking_status: "suspended" });
      const combined = [...allFailed, ...suspended];
      // Deduplicate by ID
      const seen = new Set();
      return combined.filter(b => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const gracePeriod = allBookings.filter(b => ["payment_due", "grace_period"].includes(b.booking_status));
  const suspended = allBookings.filter(b => b.booking_status === "suspended" && !b.rental_ended_at);

  const filteredBookings = allBookings
    .filter(b => {
      if (statusFilter === "all") return ["payment_due", "grace_period", "suspended"].includes(b.booking_status);
      return b.booking_status === statusFilter;
    })
    .sort((a, b) => {
      const pa = STATUS_CONFIG[a.booking_status]?.priority ?? 99;
      const pb = STATUS_CONFIG[b.booking_status]?.priority ?? 99;
      return pa - pb;
    });

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Admin Operations</p>
          <h1 className="text-xl font-black text-foreground" style={{ fontFamily: "var(--font-syne)" }}>Operational Alerts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Grace periods, payment failures, suspensions.</p>
        </div>
        <button
          onClick={() => refetch()}
          className="h-9 w-9 rounded-xl bg-muted/40 border border-border flex items-center justify-center hover:bg-muted/60"
        >
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-xl p-4 text-center border border-yellow-500/20">
          <p className="text-2xl font-black text-yellow-400">{allBookings.filter(b => b.booking_status === "payment_due").length}</p>
          <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-wide">Payment Due</p>
          <p className="text-[9px] text-muted-foreground/60">&lt; 24h window</p>
        </div>
        <div className="glass rounded-xl p-4 text-center border border-orange-500/20">
          <p className="text-2xl font-black text-orange-400">{allBookings.filter(b => b.booking_status === "grace_period").length}</p>
          <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-wide">Grace Period</p>
          <p className="text-[9px] text-muted-foreground/60">Retrying 24-72h</p>
        </div>
        <div className="glass rounded-xl p-4 text-center border border-red-500/20">
          <p className="text-2xl font-black text-red-400">{suspended.length}</p>
          <p className="text-[10px] font-bold text-muted-foreground mt-1 uppercase tracking-wide">Suspended</p>
          <p className="text-[9px] text-muted-foreground/60">GPS killed</p>
        </div>
      </div>

      {/* Grace period explanation */}
      <div className="glass rounded-xl p-4 border border-border/50">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Grace Period Flow</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
          <span className="text-yellow-400 font-semibold">T+0: Payment fails</span>
          <span>→</span>
          <span>24h warning window (no kill)</span>
          <span>→</span>
          <span className="text-orange-400 font-semibold">T+24h: Retry 1</span>
          <span>→</span>
          <span className="text-orange-400 font-semibold">T+48h: Retry 2</span>
          <span>→</span>
          <span className="text-orange-400 font-semibold">T+72h: Retry 3</span>
          <span>→</span>
          <span className="text-red-400 font-semibold">Suspended + GPS kill</span>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { value: "all", label: "All" },
          { value: "payment_due", label: "Payment Due" },
          { value: "grace_period", label: "Grace Period" },
          { value: "suspended", label: "Suspended" },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === f.value
                ? "text-white"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
            }`}
            style={statusFilter === f.value ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Booking list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="text-center py-16 glass rounded-2xl">
          <CheckCircle2 className="h-10 w-10 text-emerald-400/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No accounts in grace period</p>
          <p className="text-xs text-muted-foreground/60 mt-1">All payments are current</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBookings.map(b => (
            <BookingAlertCard key={b.id} booking={b} />
          ))}
        </div>
      )}
    </div>
  );
}