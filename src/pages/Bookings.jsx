import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/useTenant";
import { CalendarDays, Clock } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import PendingReviewAlerts from "@/components/bookings/PendingReviewAlerts";
import BookingReviewPanel from "@/components/bookings/BookingReviewPanel";
import { formatDistanceToNow } from "date-fns";

const TABS = [
  { key: "pending_review", label: "Pending Review", color: "text-yellow-400" },
  { key: "cancellation_requested", label: "Cancel Requests", color: "text-red-400" },
  { key: "approved", label: "Approved", color: "text-green-400" },
  { key: "active", label: "Active", color: "text-blue-400" },
  { key: "completed", label: "Completed", color: "text-white/40" },
  { key: "rejected", label: "Rejected", color: "text-red-400" },
  { key: "more_info_requested", label: "More Info", color: "text-orange-400" },
  { key: "all", label: "All", color: "text-white/60" },
];

export default function Bookings() {
  const [activeTab, setActiveTab] = useState("pending_review");
  const [reviewBooking, setReviewBooking] = useState(null);
  const queryClient = useQueryClient();
  const { tenantFilter, companyId } = useTenant();
  const scopeKey = companyId || "all";

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["booking-requests-admin", scopeKey],
    queryFn: () => base44.entities.BookingRequest.filter(tenantFilter(), "-created_date", 200),
    refetchInterval: 30_000,
  });

  const markViewedMutation = useMutation({
    mutationFn: ({ id }) => base44.entities.BookingRequest.update(id, {
      viewed_by_admin: true,
      first_viewed_by_admin_at: new Date().toISOString(),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["booking-requests-admin"] }),
  });

  const handleReview = (booking) => {
    setReviewBooking(booking);
    if (!booking.viewed_by_admin) {
      markViewedMutation.mutate({ id: booking.id });
    }
  };

  // Alert bookings = pending_review OR cancellation_requested + alert active
  const alertBookings = bookings.filter(
    (b) => ["pending_review", "cancellation_requested"].includes(b.booking_status) && b.pending_review_alert_active !== false
  ).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  // Tab counts
  const countByTab = (tab) => {
    if (tab === "all") return bookings.length;
    return bookings.filter((b) => b.booking_status === tab).length;
  };

  // Filtered bookings for table
  const filtered = activeTab === "all"
    ? bookings
    : bookings.filter((b) => b.booking_status === activeTab);

  if (!isLoading && bookings.length === 0) {
    return <EmptyState icon={CalendarDays} title="No bookings yet" description="Customer bookings submitted through the app will appear here." />;
  }

  return (
    <div className="animate-fade-in-up">
      {/* Post-it alerts */}
      <PendingReviewAlerts bookings={alertBookings} onReview={handleReview} />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto no-scrollbar pb-1">
        {TABS.map((tab) => {
          const count = countByTab(tab.key);
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? "bg-primary/20 border border-primary/40 text-white"
                  : "bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.07]"
              }`}
            >
              <span className={isActive ? "text-white" : tab.color}>{tab.label}</span>
              {count > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  tab.key === "pending_review" && count > 0
                    ? "bg-yellow-400/20 text-yellow-300"
                    : "bg-white/10 text-white/50"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] p-12 text-center" style={{ background: "hsl(222 24% 11% / 0.8)" }}>
          <p className="text-white/30 text-sm">No bookings in this category</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden" style={{ background: "hsl(222 24% 10% / 0.9)", boxShadow: "0 4px 32px hsl(222 28% 5% / 0.5)" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]" style={{ background: "hsl(222 28% 8% / 0.8)" }}>
                  {["Customer", "Vehicle", "Type", "Status", "Payment", "Submitted", ""].map((h) => (
                    <th key={h} className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-white/35">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const isNew = ["pending_review", "cancellation_requested"].includes(row.booking_status) && !row.viewed_by_admin;
                  const timeAgo = row.submitted_at || row.created_date
                    ? formatDistanceToNow(new Date(row.submitted_at || row.created_date), { addSuffix: true })
                    : "—";

                  return (
                    <tr
                      key={row.id}
                      onClick={() => handleReview(row)}
                      className="border-b border-white/[0.04] last:border-0 cursor-pointer transition-all duration-150 hover:bg-primary/[0.05]"
                      style={isNew ? {
                        background: "hsl(45 95% 60% / 0.06)",
                        borderLeft: "3px solid hsl(45 95% 55%)",
                        boxShadow: "inset 0 0 20px hsl(45 95% 60% / 0.04)",
                      } : {}}
                    >
                      {/* Customer */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg, hsl(265 80% 62%), hsl(338 90% 56%))" }}>
                            {(row.customer_full_name || "?").charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium text-white block truncate">{row.customer_full_name || "—"}</span>
                            <span className="text-xs text-white/35 truncate block">{row.user_email || ""}</span>
                          </div>
                        </div>
                      </td>
                      {/* Vehicle */}
                      <td className="px-4 py-3.5">
                        <span className="text-white/60 text-sm">{row.vehicle_name || "—"}</span>
                      </td>
                      {/* Type */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg border text-purple-400 bg-purple-500/10 border-purple-500/20">
                          {row.booking_type || "—"}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <BookingStatusBadge status={row.booking_status} />
                      </td>
                      {/* Payment */}
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${
                          row.payment_status === "paid"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-white/5 text-white/35"
                        }`}>
                          {row.payment_status || "—"}
                        </span>
                      </td>
                      {/* Time */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-white/25" />
                          <span className="text-xs text-white/40">{timeAgo}</span>
                        </div>
                      </td>
                      {/* NEW badge */}
                      <td className="px-4 py-3.5">
                        {isNew && (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/30">
                            NEW
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review side panel */}
      {reviewBooking && (
        <BookingReviewPanel
          booking={reviewBooking}
          onClose={() => setReviewBooking(null)}
        />
      )}
    </div>
  );
}

function BookingStatusBadge({ status }) {
  const map = {
    pending_review:      "bg-yellow-500/15 text-yellow-300 border-yellow-500/25",
    approved:            "bg-green-500/15 text-green-300 border-green-500/25",
    active:              "bg-blue-500/15 text-blue-300 border-blue-500/25",
    completed:           "bg-white/5 text-white/40 border-white/10",
    rejected:            "bg-red-500/15 text-red-300 border-red-500/25",
    more_info_requested:    "bg-orange-500/15 text-orange-300 border-orange-500/25",
    draft:                  "bg-white/5 text-white/30 border-white/10",
    confirmed:              "bg-green-500/15 text-green-300 border-green-500/25",
    cancellation_requested: "bg-red-500/15 text-red-300 border-red-500/25",
  };
  const cls = map[status] || "bg-white/5 text-white/30 border-white/10";
  const label = (status || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}