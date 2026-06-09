import React, { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInCalendarDays } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Bot, CalendarClock, Camera, Car, ChevronDown, CreditCard, FileText, MapPin, MessageSquare, Navigation, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import FindMyVehicleMap from "@/components/customer/mybookings/FindMyVehicleMap";
import PickupAddressCard from "@/components/customer/mybookings/PickupAddressCard";
import ContractModal from "@/components/customer/mybookings/ContractModal";
import VehicleInspectionSheet from "@/components/customer/VehicleInspectionSheet";
import CustomerQuickCommands from "@/components/customer/myvehicle/CustomerQuickCommands";

const ACTIVE_RENTAL_STATUSES = ["active", "approved", "confirmed", "payment_due", "grace_period", "return_pending_host_review", "under_review"];

function isOperationalRental(booking) {
  if (!booking || booking.rental_ended_at) return false;
  if (!ACTIVE_RENTAL_STATUSES.includes(booking.booking_status)) return false;
  if (booking.end_date && Date.now() > new Date(`${booking.end_date}T23:59:59`).getTime()) return false;
  return true;
}

function vehicleName(vehicle, booking) {
  return vehicle?.display_name || [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || booking?.vehicle_name || "My Vehicle";
}

function freshness(device) {
  const value = device?.last_seen_at || device?.location_updated_at;
  if (!value) return { label: "No recent GPS", time: "Not available", online: false };
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 2) return { label: "Live / Recent", time: format(new Date(value), "MMM d, h:mm a"), online: true };
  if (minutes < 30) return { label: `${minutes} min old`, time: format(new Date(value), "MMM d, h:mm a"), online: device?.online_status !== "offline" };
  return { label: "Location stale", time: format(new Date(value), "MMM d, h:mm a"), online: device?.online_status === "online" };
}

function money(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function eventTitle(event) {
  const labels = {
    contract_signed: "Contract Signed",
    payment_received: "Payment Received",
    booking_confirmed: "Rental Confirmed",
    booking_active: "Rental Active",
    "booking.approved": "Rental Approved",
    "booking.activated": "Rental Activated",
    "booking.completed": "Rental Completed",
    "payment.succeeded": "Payment Received",
    "gps.command_sent": "Vehicle Command Sent",
    "gps.command_failed": "Vehicle Command Failed",
  };
  return event.event_title || event.summary || labels[event.event_type] || event.event_type?.replaceAll("_", " ") || "Rental Update";
}

function commandTitle(command) {
  const labels = { locate: "Vehicle Located", lock: "Vehicle Locked", unlock: "Vehicle Unlocked", alarm_pulse: "Find Vehicle Triggered" };
  return labels[command.command_type] || command.command_type?.replaceAll("_", " ") || "Vehicle Action";
}

export default function MyVehicle() {
  const { user } = useOutletContext() || {};
  const queryClient = useQueryClient();
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [contractBooking, setContractBooking] = useState(null);
  const [inspectionTarget, setInspectionTarget] = useState(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["my-vehicle-bookings", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user.email }),
    enabled: !!user?.email,
    refetchInterval: 60_000,
  });

  const activeRentals = useMemo(() => bookings.filter(isOperationalRental).sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date)), [bookings]);

  useEffect(() => {
    if (!selectedBookingId && activeRentals[0]?.id) setSelectedBookingId(activeRentals[0].id);
  }, [activeRentals, selectedBookingId]);

  const booking = activeRentals.find((item) => item.id === selectedBookingId) || activeRentals[0];

  const { data: vehicleList = [] } = useQuery({
    queryKey: ["my-vehicle-record", booking?.vehicle_id],
    queryFn: () => base44.entities.Vehicle.filter({ id: booking.vehicle_id }),
    enabled: !!booking?.vehicle_id,
    staleTime: 60_000,
  });
  const vehicle = vehicleList[0];

  const { data: devices = [], refetch: refetchDevices } = useQuery({
    queryKey: ["my-vehicle-device", booking?.vehicle_id],
    queryFn: () => base44.entities.TelematicsDevice.filter({ vehicle_id: booking.vehicle_id }),
    enabled: !!booking?.vehicle_id,
    refetchInterval: 30_000,
  });
  const device = devices[0];
  const gps = freshness(device);

  const { data: events = [] } = useQuery({
    queryKey: ["my-vehicle-activity", user?.email],
    queryFn: () => base44.entities.ActivityEvent.filter({ user_email: user.email }, "-created_date", 80),
    enabled: !!user?.email,
  });

  const { data: commands = [] } = useQuery({
    queryKey: ["my-vehicle-commands", booking?.id],
    queryFn: () => base44.entities.TelematicsCommand.filter({ booking_id: booking.id }, "-created_date", 20),
    enabled: !!booking?.id,
    refetchInterval: 15_000,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["my-vehicle-notifications", user?.email],
    queryFn: () => base44.entities.Notification.filter({ user_email: user.email }, "-created_date", 20),
    enabled: !!user?.email,
  });

  const { data: communicationPreview = { threads: [] } } = useQuery({
    queryKey: ["my-vehicle-communication-preview", booking?.id, booking?.vehicle_id],
    queryFn: async () => {
      const res = await base44.functions.invoke("searchCommunicationThreads", {
        booking_request_id: booking.id,
        vehicle_id: booking.vehicle_id,
        limit: 3,
      });
      return res.data;
    },
    enabled: !!booking?.id,
  });
  const recentThread = communicationPreview.threads?.[0];

  const recentActivity = useMemo(() => {
    const rentalEvents = events.filter((event) => event.booking_request_id === booking?.id || event.booking_id === booking?.id || event.vehicle_id === booking?.vehicle_id)
      .map((event) => ({ id: event.id, type: "Activity", title: eventTitle(event), detail: event.event_description || event.event_status || "Rental timeline updated", date: event.created_date }));
    const commandEvents = commands.map((command) => ({ id: command.id, type: "Vehicle", title: commandTitle(command), detail: command.queue_status || command.status, date: command.created_date || command.created_at }));
    const notices = notifications.slice(0, 4).map((notice) => ({ id: notice.id, type: "Notice", title: notice.title || "Important Notice", detail: notice.body, date: notice.created_date }));
    return [...commandEvents, ...rentalEvents, ...notices].filter((item) => item.title).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 8);
  }, [events, commands, notifications, booking]);

  if (!user) return <EmptyState title="Sign in to view your vehicle" text="Your active rental command center appears here after login." action="Sign In" href="/account" />;
  if (isLoading) return <div className="p-5 space-y-4">{[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-[2rem] bg-gray-100" />)}</div>;
  if (!booking) return <EmptyState title="No active rental" text="Book a vehicle to unlock the connected rental experience." action="Book Now" href="/book-now" />;

  const name = vehicleName(vehicle, booking);
  const daysRemaining = booking.end_date ? Math.max(0, differenceInCalendarDays(new Date(`${booking.end_date}T23:59:59`), new Date())) : null;
  const paidThrough = booking.next_billing_date ? format(new Date(`${booking.next_billing_date}T00:00:00`), "MMMM d") : "current period";
  const nextBillingLabel = booking.next_billing_date ? format(new Date(`${booking.next_billing_date}T00:00:00`), "MMM d") : "Auto-Renew";
  const pickupDone = booking.pickup_photos?.length > 0;
  const returnDone = booking.return_exterior_photos?.length > 0;
  const needsPayment = booking.payment_status !== "paid" || booking.starter_disabled || booking.moovetrax_kill_active;

  return (
    <div className="min-h-screen bg-[#f5f5f7] pb-8">
      {contractBooking && <ContractModal booking={contractBooking} onClose={() => setContractBooking(null)} />}
      {inspectionTarget && <VehicleInspectionSheet booking={inspectionTarget.booking} type={inspectionTarget.type} onClose={() => setInspectionTarget(null)} onComplete={() => queryClient.invalidateQueries({ queryKey: ["my-vehicle-bookings", user?.email] })} />}

      <section className="relative overflow-hidden rounded-b-[2.5rem] bg-gray-950 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(236,72,153,0.38),transparent_35%),radial-gradient(circle_at_80%_65%,rgba(59,130,246,0.25),transparent_38%)]" />
        <div className="relative px-5 pb-6 pt-5">
          {activeRentals.length > 1 && (
            <div className="mb-4">
              <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Current Vehicle</label>
              <div className="relative">
                <select value={booking.id} onChange={(e) => setSelectedBookingId(e.target.value)} className="w-full appearance-none rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white outline-none">
                  {activeRentals.map((item) => <option key={item.id} value={item.id}>{item.vehicle_name || item.vehicle_id}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 shadow-2xl backdrop-blur-xl">
            <div className="relative h-56 bg-gray-900">
              {booking.vehicle_image || vehicle?.image_url ? <img src={booking.vehicle_image || vehicle.image_url} alt={name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Car className="h-20 w-20 text-white/20" /></div>}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-emerald-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-950">Rental Active</span>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${gps.online ? "bg-sky-400 text-sky-950" : "bg-white/20 text-white"}`}>{gps.online ? "Vehicle Online" : "Vehicle Status Unknown"}</span>
                </div>
                <h1 className="text-3xl font-black leading-tight" style={{ fontFamily: "var(--font-syne)" }}>{name}</h1>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 p-3">
              <HeroMetric icon={CalendarClock} label="Rental Time" value={daysRemaining !== null ? `${daysRemaining} Days Remaining` : "Auto-Renewing"} />
              <HeroMetric icon={CreditCard} label="Payment" value={booking.payment_status === "paid" ? `Paid Through ${paidThrough}` : "Payment Needed"} />
              <HeroMetric icon={CalendarClock} label="Next Billing" value={nextBillingLabel} />
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-5 pt-5">
        <CustomerQuickCommands booking={booking} vehicle={vehicle} device={device} onComplete={() => Promise.all([refetchDevices(), queryClient.invalidateQueries({ queryKey: ["my-vehicle-commands", booking.id] })])} />

        <Section title="Live Vehicle Map" eyebrow="GPS Location" icon={MapPin}>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Mini label="Freshness" value={gps.label} />
            <Mini label="Last Update" value={gps.time} />
            <Mini label="Location" value={device?.address || (device?.last_latitude ? `${Number(device.last_latitude).toFixed(3)}, ${Number(device.last_longitude).toFixed(3)}` : "Pending")} />
          </div>
          <FindMyVehicleMap booking={booking} />
        </Section>

        <Section title="Pickup & Return" eyebrow="Rental Logistics" icon={Navigation}>
          <PickupAddressCard vehicle={vehicle} booking={booking} />
          <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-sm font-black text-gray-900">Return instructions</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">When you are ready to return the vehicle, complete the drop-off inspection below. Billing stops only after return photos are submitted and reviewed.</p>
            <p className="mt-2 text-xs font-bold text-gray-700">Need help? Message your host or contact support from this page.</p>
          </div>
        </Section>

        <Section title="Rental Documents" eyebrow="Official Agreement" icon={FileText}>
          <div className="grid gap-2">
            <ActionButton disabled={!(booking.contract_status === "signed" && booking.contract_html)} onClick={() => setContractBooking(booking)} label="View Official Rental Agreement" sub="Open your signed agreement in uRide" />
            <ActionButton disabled={!booking.contract_html} onClick={() => downloadContract(booking)} label="Download Official Agreement" sub="Save a customer copy for your records" />
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold text-blue-700">This is your signed rental agreement. Terms remain exactly as accepted during checkout.</div>
          </div>
        </Section>

        <Section title="Billing Status" eyebrow="Payments" icon={CreditCard}>
          <div className="grid grid-cols-2 gap-2">
            <Mini label="Status" value={booking.payment_status || "unknown"} />
            <Mini label="Next Billing" value={booking.next_billing_date ? format(new Date(`${booking.next_billing_date}T00:00:00`), "MMM d, yyyy") : "—"} />
            <Mini label="Weekly Rate" value={money(booking.weekly_rate)} />
            <Mini label="Amount Due" value={needsPayment ? money(booking.total_due_now || booking.weekly_rate) : "$0"} />
          </div>
          {needsPayment && <Link to={`/checkout?request=${booking.id}&step=payment`} className="mt-3 flex w-full items-center justify-center rounded-2xl bg-red-500 px-4 py-3 text-sm font-black text-white">Pay Now to Restore Access</Link>}
        </Section>

        <Section title="Inspections" eyebrow="Pickup & Return Photos" icon={Camera}>
          <div className="grid gap-2">
            <ActionButton onClick={() => setInspectionTarget({ booking, type: "pickup" })} label={pickupDone ? "View Pickup Inspection" : "Complete Pickup Inspection"} sub={pickupDone ? "Pickup photos submitted" : "Required before driving"} success={pickupDone} />
            <ActionButton onClick={() => setInspectionTarget({ booking, type: "dropoff" })} label={returnDone ? "View Return Inspection" : "Complete Return Inspection"} sub={returnDone ? "Return photos submitted" : pickupDone ? "Use this when returning the vehicle" : "Complete pickup first"} success={returnDone} disabled={!pickupDone} />
          </div>
        </Section>

        <Section title="Rental Activity" eyebrow="Recent Events" icon={Sparkles}>
          <div className="space-y-2">
            {recentActivity.length === 0 ? <p className="rounded-2xl bg-gray-50 p-4 text-center text-sm text-gray-400">No recent rental activity yet.</p> : recentActivity.map((item) => <div key={`${item.type}-${item.id}`} className="rounded-2xl border border-gray-100 bg-gray-50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black capitalize text-gray-900">{item.title}</p><p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{item.detail}</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-gray-400">{item.type}</span></div></div>)}
          </div>
        </Section>

        <Section title="Support" eyebrow="Help & Communication" icon={MessageSquare}>
          <div className="grid gap-2">
            <MessagePreview thread={recentThread} />
            <SupportLink to="/messages" icon={MessageSquare} label="Message Host" sub="Open secure rental messages" />
            <SupportLink to="/support" icon={Wrench} label="Contact Support" sub="Get help inside uRide" />
            <SupportLink to="/support" icon={Bot} label="AI Assistant" sub="Ask about your rental instantly" />
          </div>
        </Section>
      </div>
    </div>
  );
}

function HeroMetric({ icon: Icon, label, value }) {
  return <div className="rounded-2xl bg-white/10 p-3"><Icon className="mb-2 h-4 w-4 text-pink-200" /><p className="text-[10px] font-black uppercase tracking-wider text-white/40">{label}</p><p className="mt-1 text-sm font-black text-white">{value}</p></div>;
}

function Section({ title, eyebrow, icon: Icon, children }) {
  return <section className="px-5"><div className="rounded-[2rem] border border-white bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-50"><Icon className="h-5 w-5 text-pink-600" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">{eyebrow}</p><h2 className="text-lg font-black text-gray-950" style={{ fontFamily: "var(--font-syne)" }}>{title}</h2></div></div>{children}</div></section>;
}

function Mini({ label, value }) {
  return <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p><p className="mt-1 truncate text-xs font-black capitalize text-gray-900">{value || "—"}</p></div>;
}

function ActionButton({ label, sub, onClick, disabled, success }) {
  return <button disabled={disabled} onClick={onClick} className="flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left transition active:scale-[0.98] disabled:opacity-45"><div><p className="text-sm font-black text-gray-950">{label}</p><p className="mt-0.5 text-xs font-semibold text-gray-400">{sub}</p></div>{success ? <ShieldCheck className="h-5 w-5 text-emerald-500" /> : <span className="text-xl text-gray-300">›</span>}</button>;
}

function MessagePreview({ thread }) {
  if (!thread) return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <p className="text-sm font-black text-gray-950">Need help?</p>
      <p className="mt-1 text-xs font-semibold text-gray-500">Start a secure conversation with your host or uRide support without leaving the app.</p>
    </div>
  );

  return (
    <div className="rounded-2xl border border-pink-100 bg-pink-50/70 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-pink-500">Recent Conversation</p>
      <p className="mt-1 text-sm font-black text-gray-950">{thread.subject || "Rental conversation"}</p>
      <p className="mt-1 text-xs font-semibold text-gray-500">{thread.host_name || thread.vehicle_label || "Secure uRide messaging"}</p>
      <Link to="/messages" className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-black text-pink-600 shadow-sm">Open Conversation</Link>
    </div>
  );
}

function SupportLink({ to, icon: Icon, label, sub }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 active:scale-[0.98] transition">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white"><Icon className="h-5 w-5 text-pink-600" /></div>
      <div><p className="text-sm font-black text-gray-950">{label}</p><p className="text-xs font-semibold text-gray-400">{sub}</p></div>
    </Link>
  );
}

function EmptyState({ title, text, action, href }) {
  return <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center"><div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-pink-50"><Car className="h-9 w-9 text-pink-500" /></div><h1 className="text-2xl font-black text-gray-950" style={{ fontFamily: "var(--font-syne)" }}>{title}</h1><p className="mt-2 max-w-xs text-sm text-gray-500">{text}</p><Link to={href} className="mt-6 rounded-2xl bg-pink-600 px-6 py-3 text-sm font-black text-white">{action}</Link></div>;
}

function downloadContract(booking) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>uRide Official Rental Agreement</title><style>body{font-family:Inter,Arial,sans-serif;margin:40px;color:#111827;line-height:1.6}.cover{border-bottom:2px solid #e5e7eb;margin-bottom:24px;padding-bottom:16px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#db2777}h1{margin:4px 0 8px;font-size:28px}.meta{font-size:13px;color:#6b7280}</style></head><body><div class="cover"><div class="eyebrow">uRide Official Rental Agreement</div><h1>${booking.vehicle_name || "Rental Vehicle"}</h1><div class="meta">Agreement ID: ${booking.id || ""} · Downloaded ${new Date().toLocaleString()}</div></div>${booking.contract_html || ""}</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `uRide-official-rental-agreement-${booking.id?.slice(-8) || "customer"}.html`;
  link.click();
  URL.revokeObjectURL(url);
}