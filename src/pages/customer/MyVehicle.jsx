import React, { useEffect, useMemo, useState } from "react";
import { sanitizeInternalText, formatCommandStatus } from "@/lib/displayFormatters";
import { Link, useOutletContext } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInCalendarDays } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Bot, CalendarClock, Camera, Car, ChevronDown, CreditCard, FileText, MapPin, MessageSquare, Navigation, ShieldCheck, Sparkles, Wrench, Signal, Battery, Lock, Unlock, BellRing, Volume2, RotateCcw, Zap, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
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
  if (minutes < 2) return { label: "Live", time: format(new Date(value), "h:mm a"), online: true };
  if (minutes < 30) return { label: `${minutes}m ago`, time: format(new Date(value), "h:mm a"), online: device?.online_status !== "offline" };
  return { label: "Stale", time: format(new Date(value), "h:mm a"), online: device?.online_status === "online" };
}

function money(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

export default function MyVehicle() {
  const { user } = useOutletContext() || {};
  const queryClient = useQueryClient();
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [contractBooking, setContractBooking] = useState(null);
  const [inspectionTarget, setInspectionTarget] = useState(null);
  const [showFullMap, setShowFullMap] = useState(false);
  const [activeCommand, setActiveCommand] = useState(null);

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

  if (!user) return <EmptyState title="Sign in to view your vehicle" text="Your Contactless360 remote appears here after login." action="Sign In" href="/account" />;
  if (isLoading) return <LoadingState />;
  if (!booking) return <EmptyState title="No active rental" text="Book a vehicle to unlock the Contactless360 remote experience." action="Book Now" href="/book-now" />;

  const name = vehicleName(vehicle, booking);
  const daysRemaining = booking.end_date ? Math.max(0, differenceInCalendarDays(new Date(`${booking.end_date}T23:59:59`), new Date())) : null;
  const paidThrough = booking.next_billing_date ? format(new Date(`${booking.next_billing_date}T00:00:00`), "MMMM d") : "current period";
  const needsPayment = booking.payment_status !== "paid" || booking.starter_disabled || booking.moovetrax_kill_active;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-8">
      {contractBooking && <ContractModal booking={contractBooking} onClose={() => setContractBooking(null)} />}
      {inspectionTarget && <VehicleInspectionSheet booking={inspectionTarget.booking} type={inspectionTarget.type} onClose={() => setInspectionTarget(null)} onComplete={() => queryClient.invalidateQueries({ queryKey: ["my-vehicle-bookings", user?.email] })} />}

      {/* Full Screen Map Modal */}
      {showFullMap && (
        <motion.div
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          className="fixed inset-0 z-50 bg-slate-950"
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/80 backdrop-blur-xl p-4">
              <div className="flex items-center gap-3">
                <ContactlessLogo size="small" />
                <span className="text-sm font-bold text-white">Live Vehicle Map</span>
              </div>
              <button onClick={() => setShowFullMap(false)} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1">
              <FindMyVehicleMap booking={booking} />
            </div>
          </div>
        </motion.div>
      )}

      {/* Header - Contactless360 Branding */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <ContactlessLogo />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Powered by</p>
              <p className="text-xs font-black text-white">Vehicle Remote</p>
            </div>
          </div>
          {activeRentals.length > 1 && (
            <div className="relative">
              <select
                value={booking.id}
                onChange={(e) => setSelectedBookingId(e.target.value)}
                className="appearance-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white outline-none"
              >
                {activeRentals.map((item) => (
                  <option key={item.id} value={item.id} className="bg-slate-900">
                    {item.vehicle_name || item.vehicle_id}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/50" />
            </div>
          )}
        </div>
      </header>

      {/* Map Section - Top Half */}
      <section className="relative h-[45vh] min-h-[320px] w-full overflow-hidden">
        <FindMyVehicleMap booking={booking} compact />
        
        {/* Floating Vehicle Status Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-4 left-4 right-4"
        >
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${gps.online ? "bg-emerald-500/20" : "bg-gray-500/20"}`}>
                  {gps.online ? <Signal className="h-5 w-5 text-emerald-400" /> : <Signal className="h-5 w-5 text-gray-400" />}
                </div>
                <div>
                  <p className="text-sm font-black text-white">{name}</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold ${gps.online ? "text-emerald-400" : "text-gray-400"}`}>
                      {gps.online ? "● Online" : "○ Offline"}
                    </span>
                    <span className="text-[10px] text-white/40">·</span>
                    <span className="text-[10px] text-white/60">{gps.label}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowFullMap(true)}
                className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/20"
              >
                <MapPin className="h-3.5 w-3.5" />
                Full Map
              </button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Controls Section - Bottom Half */}
      <div className="px-4 pt-5">
        {/* Primary Actions */}
        <div className="mb-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/40">Remote Controls</h2>
          <div className="grid grid-cols-3 gap-3">
            <ActionButton
              icon={Lock}
              label="Lock"
              sub="Secure vehicle"
              onClick={async () => {
                setActiveCommand("lock");
                try {
                  const res = await base44.functions.invoke("sendTelematicsCommand", {
                    telematics_device_id: device?.id,
                    vehicle_id: vehicle?.id,
                    booking_id: booking?.id,
                    command_type: "lock",
                    source: "contactless360_remote"
                  });
                  toast.success("Vehicle locked successfully");
                  setTimeout(() => setActiveCommand(null), 2000);
                  refetchDevices();
                } catch (err) {
                  console.error("Lock failed:", err);
                  toast.error(err?.response?.data?.error || "Failed to lock vehicle");
                  setActiveCommand(null);
                }
              }}
              gradient="from-cyan-500 to-blue-500"
              disabled={!!activeCommand}
            />
            <ActionButton
              icon={Unlock}
              label="Unlock"
              sub="Unlock vehicle"
              onClick={async () => {
                setActiveCommand("unlock");
                try {
                  const res = await base44.functions.invoke("sendTelematicsCommand", {
                    telematics_device_id: device?.id,
                    vehicle_id: vehicle?.id,
                    booking_id: booking?.id,
                    command_type: "unlock",
                    source: "contactless360_remote"
                  });
                  toast.success("Vehicle unlocked successfully");
                  setTimeout(() => setActiveCommand(null), 2000);
                  refetchDevices();
                } catch (err) {
                  console.error("Unlock failed:", err);
                  toast.error(err?.response?.data?.error || "Failed to unlock vehicle");
                  setActiveCommand(null);
                }
              }}
              gradient="from-emerald-500 to-teal-500"
              disabled={!!activeCommand}
            />
            <ActionButton
              icon={BellRing}
              label="Find"
              sub="Locate vehicle"
              onClick={async () => {
                setActiveCommand("find");
                try {
                  const res = await base44.functions.invoke("startTelematicsAlarm", {
                    vehicle_id: vehicle?.id,
                    telematics_device_id: device?.id
                  });
                  toast.success("Vehicle alarm activated!");
                  if (vehicle?.vehicle_lat && vehicle?.vehicle_lon) {
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${vehicle.vehicle_lat},${vehicle.vehicle_lon}`, "_blank");
                  }
                  setTimeout(() => setActiveCommand(null), 2000);
                  refetchDevices();
                } catch (err) {
                  console.error("Find failed:", err);
                  toast.error(err?.response?.data?.error || "Failed to activate alarm");
                  setActiveCommand(null);
                }
              }}
              gradient="from-pink-500 to-rose-500"
              disabled={!!activeCommand}
            />
          </div>
        </div>

        {/* Secondary Actions */}
        <div className="mb-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/40">Vehicle Status</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatusCard
              icon={Battery}
              label="GPS Signal"
              value={gps.label}
              status={gps.online ? "good" : "poor"}
            />
            <StatusCard
              icon={CalendarClock}
              label="Rental Days"
              value={daysRemaining !== null ? `${daysRemaining} left` : "Auto-renew"}
              status="neutral"
            />
          </div>
        </div>

        {/* Quick Links */}
        <div className="mb-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/40">Rental Tools</h2>
          <div className="space-y-2">
            <LinkCard
              to="/messages"
              icon={MessageSquare}
              label="Message Host"
              sub={recentThread ? recentThread.subject : "Start a conversation"}
              badge={recentThread ? "Recent" : null}
            />
            <LinkCard
              to="/support"
              icon={Wrench}
              label="Support"
              sub="Get help with your rental"
            />
            <LinkCard
              to="/account"
              icon={FileText}
              label="Documents"
              sub="View rental agreement"
              disabled={!(booking.contract_status === "signed" && booking.contract_html)}
            />
          </div>
        </div>

        {/* Payment Alert */}
        {needsPayment && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-500/5 p-4"
          >
            <p className="text-sm font-bold text-red-400">⚠️ Payment Required</p>
            <p className="mt-1 text-xs text-red-300/80">Resolve payment to maintain vehicle access</p>
            <Link
              to={`/checkout?request=${booking.id}&step=payment`}
              className="mt-3 flex w-full items-center justify-center rounded-xl bg-red-500 py-2.5 text-xs font-bold text-white hover:bg-red-600"
            >
              Pay Now
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ContactlessLogo({ size = "default" }) {
  const sizeClasses = size === "small" ? "h-6 w-6" : "h-8 w-8";
  return (
    <div className={`flex items-center gap-2 ${sizeClasses}`}>
      <div className="relative flex h-full w-full items-center justify-center">
        <div className="absolute inset-0 animate-pulse rounded-lg bg-gradient-to-br from-cyan-500/30 to-blue-500/30 blur-md" />
        <div className="relative flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
          <Signal className="h-3/5 w-3/5 text-white" />
        </div>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, sub, onClick, gradient }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-4 shadow-lg transition-all active:scale-95`}
    >
      <div className="absolute inset-0 bg-white/0 transition-all group-hover:bg-white/10" />
      <div className="relative flex flex-col items-center">
        <Icon className="mb-2 h-6 w-6 text-white" />
        <span className="text-sm font-black text-white">{label}</span>
        <span className="text-[10px] font-semibold text-white/70">{sub}</span>
      </div>
    </motion.button>
  );
}

function StatusCard({ icon: Icon, label, value, status }) {
  const statusColors = {
    good: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400",
    poor: "from-red-500/20 to-red-500/5 border-red-500/30 text-red-400",
    neutral: "from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-400",
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${statusColors[status]} p-4 backdrop-blur-xl`}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">{label}</span>
      </div>
      <p className="text-sm font-black text-white">{value}</p>
    </div>
  );
}

function LinkCard({ to, icon: Icon, label, sub, badge, disabled }) {
  return (
    <Link
      to={disabled ? "#" : to}
      className={`group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition-all ${
        disabled ? "opacity-40" : "active:scale-[0.98] hover:bg-white/10"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
          <Icon className="h-5 w-5 text-cyan-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">{label}</p>
          <p className="text-xs text-white/50">{sub}</p>
        </div>
      </div>
      {badge && (
        <span className="rounded-full bg-cyan-500/20 px-2 py-1 text-[10px] font-bold text-cyan-400">
          {badge}
        </span>
      )}
      {!disabled && <ChevronDown className="h-4 w-4 -rotate-90 text-white/30" />}
    </Link>
  );
}

function EmptyState({ title, text, action, href }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20">
        <Signal className="h-9 w-9 text-cyan-400" />
      </div>
      <h1 className="text-2xl font-black text-white">{title}</h1>
      <p className="mt-2 max-w-xs text-sm text-white/50">{text}</p>
      <Link
        to={href}
        className="mt-6 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg"
      >
        {action}
      </Link>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-cyan-500/30" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600">
          <Signal className="h-6 w-6 text-white" />
        </div>
      </div>
      <p className="mt-4 text-sm font-bold text-white/60">Connecting to vehicle...</p>
    </div>
  );
}