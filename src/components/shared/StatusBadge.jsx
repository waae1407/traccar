import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles = {
  // Customer statuses
  Lead: "bg-blue-100 text-blue-700",
  Approved: "bg-green-100 text-green-700",
  Active: "bg-green-100 text-green-700",
  Completed: "bg-gray-100 text-gray-700",
  Blocked: "bg-red-100 text-red-700",
  // Vehicle statuses
  Available: "bg-green-100 text-green-700",
  Booked: "bg-blue-100 text-blue-700",
  Maintenance: "bg-yellow-100 text-yellow-700",
  Transferred: "bg-gray-100 text-gray-700",
  // Booking statuses
  Reserved: "bg-blue-100 text-blue-700",
  Cancelled: "bg-red-100 text-red-700",
  // Payment statuses
  Paid: "bg-green-100 text-green-700",
  Pending: "bg-yellow-100 text-yellow-700",
  Failed: "bg-red-100 text-red-700",
  Overdue: "bg-red-100 text-red-700",
  // RTO
  "At Risk": "bg-orange-100 text-orange-700",
};

export default function StatusBadge({ status }) {
  return (
    <Badge className={cn("font-medium border-0", statusStyles[status] || "bg-gray-100 text-gray-700")}>
      {status}
    </Badge>
  );
}