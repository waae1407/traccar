import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Car, CreditCard, FileText, User } from "lucide-react";
import { base44 } from "@/api/base44Client";

function first(records) {
  return Array.isArray(records) ? records[0] : null;
}

function vehicleLabel(vehicle, booking) {
  if (booking?.vehicle_name) return booking.vehicle_name;
  if (!vehicle) return "Vehicle details unavailable";
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.vin || vehicle.id;
}

function customerLabel(booking, alert) {
  return booking?.customer_full_name || booking?.user_email || alert.renter_email || alert.customer_id || "Customer unavailable";
}

function stripeUrl(alert) {
  if (alert.stripe_dispute_id) return `https://dashboard.stripe.com/disputes/${alert.stripe_dispute_id}`;
  if (alert.stripe_invoice_id) return `https://dashboard.stripe.com/invoices/${alert.stripe_invoice_id}`;
  if (alert.stripe_charge_id) return `https://dashboard.stripe.com/payments/${alert.stripe_charge_id}`;
  if (alert.stripe_payment_intent_id) return `https://dashboard.stripe.com/payments/${alert.stripe_payment_intent_id}`;
  return "";
}

function InsightItem({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide opacity-50">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="mt-1 truncate text-xs font-bold">{value}</p>
    </div>
  );
}

export default function PaymentAlertInsight({ alert, scope = "admin", compact = false }) {
  const bookingId = alert.booking_id || (alert.related_entity_type === "BookingRequest" ? alert.related_entity_id : "");

  const { data: bookingRows = [] } = useQuery({
    queryKey: ["payment-alert-booking", bookingId],
    queryFn: () => base44.entities.BookingRequest.filter({ id: bookingId }),
    enabled: !!bookingId,
  });
  const booking = first(bookingRows);
  const vehicleId = alert.vehicle_id || booking?.vehicle_id || "";
  const hostId = alert.host_id || booking?.host_id || "";

  const { data: vehicleRows = [] } = useQuery({
    queryKey: ["payment-alert-vehicle", vehicleId],
    queryFn: () => base44.entities.Vehicle.filter({ id: vehicleId }),
    enabled: !!vehicleId,
  });
  const { data: hostRows = [] } = useQuery({
    queryKey: ["payment-alert-host", hostId],
    queryFn: () => base44.entities.Host.filter({ id: hostId }),
    enabled: !!hostId && scope === "admin",
  });

  const vehicle = first(vehicleRows);
  const host = first(hostRows);
  const amount = Number(alert.financial_impact_amount || booking?.weekly_rate || booking?.total_due_now || 0);
  const stripeLink = stripeUrl(alert);

  return (
    <div className="mt-3 space-y-3">
      {!compact && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <InsightItem icon={User} label="Customer" value={customerLabel(booking, alert)} />
          <InsightItem icon={Car} label="Vehicle" value={vehicleLabel(vehicle, booking)} />
          <InsightItem icon={FileText} label="Booking" value={booking?.booking_status || alert.billing_context || "Review needed"} />
          <InsightItem icon={CreditCard} label="Amount" value={amount > 0 ? `$${amount.toFixed(2)}` : "Not specified"} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {bookingId && (
          <Link to={scope === "admin" ? `/bookings-admin?booking_id=${bookingId}` : "/my-bookings"} className="rounded-xl border border-black/10 bg-white/75 px-3 py-1.5 text-xs font-black hover:bg-white">
            View booking
          </Link>
        )}
        {bookingId && scope === "admin" && (
          <Link to={`/payments?booking_id=${bookingId}`} className="rounded-xl border border-black/10 bg-white/75 px-3 py-1.5 text-xs font-black hover:bg-white">
            Payment record
          </Link>
        )}
        {scope === "admin" && hostId && (
          <Link to={`/admin/hosts?host_id=${hostId}`} className="rounded-xl border border-black/10 bg-white/75 px-3 py-1.5 text-xs font-black hover:bg-white">
            {host?.business_name || host?.full_name ? "View host" : "Host profile"}
          </Link>
        )}
        {scope === "admin" && stripeLink && (
          <a href={stripeLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-black/10 bg-white/75 px-3 py-1.5 text-xs font-black hover:bg-white">
            Stripe details <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
        {scope === "admin" && (
          <Link to="/admin/payment-alerts" className="rounded-xl border border-black/10 bg-white/75 px-3 py-1.5 text-xs font-black hover:bg-white">
            Alert center
          </Link>
        )}
      </div>
    </div>
  );
}