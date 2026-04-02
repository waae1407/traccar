import React from "react";
import { AlertTriangle, Clock, X, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export default function PendingReviewAlerts({ bookings, onReview }) {
  const queryClient = useQueryClient();

  const dismissMutation = useMutation({
    mutationFn: (id) => base44.entities.BookingRequest.update(id, { pending_review_alert_active: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["booking-requests-admin"] }),
  });

  if (!bookings || bookings.length === 0) return null;

  const latest = bookings[0];
  const timeAgo = latest.submitted_at
    ? formatDistanceToNow(new Date(latest.submitted_at), { addSuffix: true })
    : formatDistanceToNow(new Date(latest.created_date), { addSuffix: true });

  return (
    <div className="mb-6 space-y-3">
      {/* Main alert banner */}
      <div
        className="relative rounded-2xl overflow-hidden border-2 border-yellow-400/60"
        style={{
          background: "linear-gradient(135deg, hsl(45 95% 60% / 0.18) 0%, hsl(38 95% 54% / 0.12) 100%)",
          boxShadow: "0 0 30px hsl(45 95% 60% / 0.2), 0 4px 20px hsl(222 28% 5% / 0.5)",
        }}
      >
        {/* Top tape strip */}
        <div className="h-2 w-full" style={{ background: "linear-gradient(90deg, hsl(45 95% 55%), hsl(38 95% 50%))" }} />

        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-yellow-300 text-sm uppercase tracking-wider mb-0.5">
                  {bookings.length === 1 ? "1 New Booking Needs Approval" : `${bookings.length} New Bookings Awaiting Review`}
                </p>
                <p className="text-white/80 text-sm font-medium truncate">
                  {latest.customer_full_name || "Customer"} requested {latest.vehicle_name || "a vehicle"}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Clock className="h-3.5 w-3.5 text-white/40" />
                  <span className="text-xs text-white/40">{timeAgo}</span>
                  {latest.admin_attention_priority === "urgent" && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/30 ml-1">URGENT</span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => onReview(latest)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-black whitespace-nowrap flex-shrink-0 transition-all hover:opacity-90 active:scale-95"
              style={{ background: "linear-gradient(135deg, hsl(45 95% 60%), hsl(38 95% 54%))" }}
            >
              Review Now <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Additional bookings list */}
          {bookings.length > 1 && (
            <div className="mt-4 pt-4 border-t border-yellow-400/15 space-y-2">
              {bookings.slice(0, 4).map((b, i) => (
                <button
                  key={b.id}
                  onClick={() => onReview(b)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                      {(b.customer_full_name || "?").charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-white truncate block">{b.customer_full_name || "Customer"}</span>
                      <span className="text-xs text-white/40 truncate block">{b.vehicle_name} · {b.booking_type}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!b.viewed_by_admin && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/30">NEW</span>
                    )}
                    <ChevronRight className="h-3.5 w-3.5 text-white/30" />
                  </div>
                </button>
              ))}
              {bookings.length > 4 && (
                <p className="text-xs text-white/30 text-center pt-1">+{bookings.length - 4} more pending bookings</p>
              )}
            </div>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={() => bookings.forEach((b) => dismissMutation.mutate(b.id))}
          className="absolute top-3 right-3 h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          title="Dismiss alerts"
        >
          <X className="h-3 w-3 text-white/50" />
        </button>
      </div>
    </div>
  );
}