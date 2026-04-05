import React from "react";
import { X, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import StatusBadge from "@/components/shared/StatusBadge";
import { format } from "date-fns";

export default function StatCardDrawer({ open, onClose, title, children, linkTo, linkLabel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative ml-auto h-full w-full max-w-md flex flex-col overflow-hidden"
        style={{ background: "hsl(222 24% 10%)", borderLeft: "1px solid hsl(222 18% 18%)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.07] flex-shrink-0">
          <h2 className="font-syne font-bold text-white text-lg">{title}</h2>
          <div className="flex items-center gap-3">
            {linkTo && (
              <Link
                to={linkTo}
                onClick={onClose}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                {linkLabel || "View all"} <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4 text-white/60" />
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Reusable row types ────────────────────────────────────────────────────────

export function DrawerRow({ label, value, sub, highlight }) {
  const highlightCls = highlight === "green" ? "text-green-400" : highlight === "red" ? "text-red-400" : highlight === "yellow" ? "text-yellow-400" : "text-white/70";
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-white/[0.05] last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate">{label}</p>
        {sub && <p className="text-xs text-white/35 mt-0.5 truncate">{sub}</p>}
      </div>
      <span className={`text-sm font-semibold flex-shrink-0 ${highlightCls}`}>{value}</span>
    </div>
  );
}

export function DrawerBookingRow({ booking }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] transition-colors border border-white/[0.04] mb-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-white text-sm truncate">{booking.customer_full_name || "Customer"}</p>
        <p className="text-xs text-white/35 mt-0.5 truncate">{booking.vehicle_name} · {booking.booking_type}</p>
        {booking.start_date && (
          <p className="text-xs text-white/25 mt-0.5">
            {format(new Date(booking.start_date), "MMM d, yyyy")}
          </p>
        )}
      </div>
      <StatusBadge status={booking.booking_status} />
    </div>
  );
}