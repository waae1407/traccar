import React from "react";
import { Search, X } from "lucide-react";

// Reusable filter bar for admin pages
// Props:
//   filters: { search, dateFrom, dateTo, bookingStatus, paymentStatus, customerStatus }
//   onChange(key, value)
//   options: { showSearch, showDate, showBookingStatus, showPaymentStatus, showCustomerStatus }
//   resultCount, totalCount

const BOOKING_STATUSES = [
  "pending_review", "approved", "active", "confirmed",
  "pending_payment", "pending_verification", "pending_contract",
  "cancellation_requested", "completed", "cancelled", "suspended", "rejected",
];

const PAYMENT_STATUSES = ["paid", "unpaid", "pending", "failed", "overdue", "due_soon", "refunded"];

const CUSTOMER_STATUSES = ["Lead", "Approved", "Active", "Completed", "Blocked"];

const inputCls = "h-9 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white text-xs placeholder:text-white/25 focus:outline-none focus:border-primary/50 transition-all";
const selectCls = `${inputCls} cursor-pointer`;

export default function AdminFilters({ filters, onChange, options = {}, resultCount, totalCount }) {
  const {
    showSearch = true,
    showDate = true,
    showBookingStatus = false,
    showPaymentStatus = false,
    showCustomerStatus = false,
  } = options;

  const hasActiveFilter =
    filters.search ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.bookingStatus ||
    filters.paymentStatus ||
    filters.customerStatus;

  const clearAll = () => {
    ["search", "dateFrom", "dateTo", "bookingStatus", "paymentStatus", "customerStatus"].forEach((k) => onChange(k, ""));
  };

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        {showSearch && (
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={filters.search || ""}
              onChange={(e) => onChange("search", e.target.value)}
              placeholder="Search name, email, vehicle…"
              className={`${inputCls} w-full pl-9`}
            />
          </div>
        )}

        {/* Date From */}
        {showDate && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-white/30">From</span>
              <input
                type="date"
                value={filters.dateFrom || ""}
                onChange={(e) => onChange("dateFrom", e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-white/30">To</span>
              <input
                type="date"
                value={filters.dateTo || ""}
                onChange={(e) => onChange("dateTo", e.target.value)}
                className={inputCls}
              />
            </div>
          </>
        )}

        {/* Booking Status */}
        {showBookingStatus && (
          <select
            value={filters.bookingStatus || ""}
            onChange={(e) => onChange("bookingStatus", e.target.value)}
            className={selectCls}
          >
            <option value="">All Booking States</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        )}

        {/* Payment Status */}
        {showPaymentStatus && (
          <select
            value={filters.paymentStatus || ""}
            onChange={(e) => onChange("paymentStatus", e.target.value)}
            className={selectCls}
          >
            <option value="">All Payment States</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        )}

        {/* Customer Status */}
        {showCustomerStatus && (
          <select
            value={filters.customerStatus || ""}
            onChange={(e) => onChange("customerStatus", e.target.value)}
            className={selectCls}
          >
            <option value="">All Customer States</option>
            {CUSTOMER_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {/* Clear */}
        {hasActiveFilter && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 px-3 h-9 rounded-xl text-xs font-semibold text-white/50 border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] transition-all"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Result count */}
      {(resultCount !== undefined && totalCount !== undefined) && (
        <p className="text-xs text-white/30">
          Showing <span className="text-white/60 font-semibold">{resultCount}</span> of {totalCount} records
          {hasActiveFilter && " (filtered)"}
        </p>
      )}
    </div>
  );
}