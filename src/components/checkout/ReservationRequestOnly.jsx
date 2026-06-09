import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle2, CreditCard } from "lucide-react";

export default function ReservationRequestOnly({ booking, user, onSubmitBooking }) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setSaving(true);
    await base44.entities.StorefrontLead.create({
      host_id: booking?.host_id || "",
      business_slug: booking?.storefront_slug || "checkout",
      email: user?.email || booking?.user_email || "",
      name: booking?.customer_full_name || user?.full_name || "",
      phone: booking?.customer_phone || "",
      interest_note: `Reservation request for ${booking?.vehicle_name || "vehicle"} (${booking?.booking_type || "Rental"}). Booking request: ${booking?.id}`,
      source: "reservation_request",
      status: "new"
    });
    await base44.entities.Notification.create({
      recipient_role: "host",
      type: "booking",
      domain: "fleet",
      severity: "info",
      title: "New Reservation Request",
      body: `${user?.full_name || booking?.customer_full_name || "A customer"} requested ${booking?.vehicle_name || "a vehicle"}. Connect Stripe to enable instant online booking.`,
      message: "New reservation request submitted from storefront checkout.",
      source_entity_type: "BookingRequest",
      source_entity_id: booking?.id,
      host_id: booking?.host_id,
      booking_request_id: booking?.id,
      delivery_channels: ["in_app"],
      delivery_status: "pending"
    });
    await onSubmitBooking({
      payment_status: "pending",
      booking_status: "under_review",
      submitted_at: new Date().toISOString(),
      viewed_by_admin: false,
      pending_review_alert_active: true,
      admin_attention_priority: "normal",
      admin_notes: "Reservation request submitted because online payments are not enabled for this host."
    });
    setDone(true);
    setSaving(false);
  };

  if (done) {
    return (
      <div className="text-center py-10">
        <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h2 className="font-bold text-gray-900 text-xl">Reservation Request Sent</h2>
        <p className="text-sm text-gray-500 mt-1">The host will contact you to complete payment and confirm pickup.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center">
          <Bell className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-xl">Submit Reservation Request</h2>
          <p className="text-gray-400 text-sm">This host has not enabled instant online booking yet.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
        <CreditCard className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-900">Connect Stripe to enable instant online booking.</p>
          <p className="text-xs text-amber-700 mt-1">Until Stripe is connected, customers can still send reservation requests and the host can collect payment externally.</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 p-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Requested vehicle</p>
        <p className="text-lg font-black text-gray-900">{booking?.vehicle_name}</p>
        <p className="text-sm text-gray-500 mt-1">Estimated due now: ${Number(booking?.total_due_now || booking?.weekly_rate || 0).toLocaleString()}</p>
      </div>

      <Button onClick={submit} disabled={saving} className="w-full py-4 rounded-xl font-bold text-sm text-white bg-gray-900 hover:bg-gray-800">
        {saving ? "Sending…" : "Submit Reservation Request"}
      </Button>
    </div>
  );
}