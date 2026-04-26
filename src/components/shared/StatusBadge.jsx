import React from "react";
import { cn } from "@/lib/utils";

const statusMap = {
  // Customer
  Lead:       { dot: "bg-blue-400",   cls: "bg-blue-500/15 text-blue-300 border-blue-500/25" },
  Approved:   { dot: "bg-green-400",  cls: "bg-green-500/15 text-green-300 border-green-500/25" },
  Active:     { dot: "bg-green-400",  cls: "bg-green-500/15 text-green-300 border-green-500/25" },
  Completed:  { dot: "bg-white/30",   cls: "bg-white/5 text-white/50 border-white/10" },
  Blocked:    { dot: "bg-red-400",    cls: "bg-red-500/15 text-red-300 border-red-500/25" },
  // Vehicle
  Available:  { dot: "bg-green-400",  cls: "bg-green-500/15 text-green-300 border-green-500/25" },
  Booked:     { dot: "bg-blue-400",   cls: "bg-blue-500/15 text-blue-300 border-blue-500/25" },
  Maintenance:{ dot: "bg-yellow-400", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/25" },
  Transferred:{ dot: "bg-white/30",   cls: "bg-white/5 text-white/50 border-white/10" },
  "Out of Service": { dot: "bg-red-500", cls: "bg-red-500/15 text-red-300 border-red-500/25" },
  // Booking
  Reserved:   { dot: "bg-blue-400",   cls: "bg-blue-500/15 text-blue-300 border-blue-500/25" },
  Cancelled:  { dot: "bg-red-400",    cls: "bg-red-500/15 text-red-300 border-red-500/25" },
  // Payment
  Paid:       { dot: "bg-green-400",  cls: "bg-green-500/15 text-green-300 border-green-500/25" },
  Pending:    { dot: "bg-yellow-400", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/25" },
  Failed:     { dot: "bg-red-400",    cls: "bg-red-500/15 text-red-300 border-red-500/25" },
  Overdue:    { dot: "bg-red-400",    cls: "bg-red-500/15 text-red-300 border-red-500/25" },
  // RTO
  "At Risk":  { dot: "bg-orange-400", cls: "bg-orange-500/15 text-orange-300 border-orange-500/25" },
};

export default function StatusBadge({ status }) {
  const s = statusMap[status] || { dot: "bg-white/30", cls: "bg-white/5 text-white/50 border-white/10" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border", s.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", s.dot)} />
      {status}
    </span>
  );
}