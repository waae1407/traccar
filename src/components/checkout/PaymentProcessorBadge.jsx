import React from "react";
import { Badge } from "@/components/ui/badge";

const labels = {
  uride_stripe: "uRide Stripe",
  host_stripe: "Host Stripe",
  manual_invoice: "Manual Reservation",
};

export default function PaymentProcessorBadge({ processor }) {
  if (!processor) return null;
  return <Badge variant="outline" className="capitalize">{labels[processor] || processor.replace("_", " ")}</Badge>;
}