import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Lock, Unlock, MapPin, Layers } from "lucide-react";
import VehicleInspectionSheet from "@/components/customer/VehicleInspectionSheet";
import SOSButton from "@/components/customer/sos/SOSButton";
import GoldDockButton from "@/components/customer/myvehicle/GoldDockButton";
import GoldVehicleWireframe from "@/components/customer/myvehicle/GoldVehicleWireframe";

const GOLD = "#C5A059";
const GOLD_BRIGHT = "#FFD700";
const ACTIVE_RENTAL_STATUSES = ["active", "approved", "confirmed", "checked_out", "return_required", "post_inspection_required", "overdue_return", "payment_due", "grace_period", "return_pending_host_review", "under_review"];

function isOperationalRental(booking) {
  if (!booking) return false;
  const ACTIVE_PHASES = ["payment_complete", "pickup_required", "checked_out", "active", "return_required", "return_in_progress", "host_review"];
  if (booking.rental_lifecycle_phase && ACTIVE_PHASES.includes(booking.rental_lifecycle_phase)) return true;
  return ACTIVE_RENTAL_STATUSES.includes(booking.booking_status);
}

function freshness(device) {
  const value = device?.last_seen_at || device?.location_updated_at;
  if (!value) return "No GPS signal";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 2) return "Live";
  if (minutes < 30) return `${minutes}m ago`;
  return "Stale";
}

/**
 * MyVehicleGoldRemote — "Gold" skin for the My Vehicle remote.
 * Black surface, gold wireframe vehicle, and four gold control tiles:
 * Lock | Locate | Unlock | SOS (SOS behaves exactly like the Classic skin).
 */
export default function MyVehicleGoldRemote({ onOpenSkinPicker }) {
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const deepLinkedBookingId = searchParams.get("booking_id");
  const [inspectionTarget, setInspectionTarget] = useState(null);
  const [commandLoading, setCommandLoading] = useState(null);
  const [isLocked, setIsLocked] = useState(null); // null = unknown, true = locked, false = unlocked
  const lastLockCommandAtRef = useRef(0);

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["my-vehicle-bookings", user?.email, deepLinkedBookingId],
    queryFn: async () => {
      if (deepLinkedBookingId) return [await base44.entities.BookingRequest.get(deepLinkedBookingId)];
      return base44.entities.BookingRequest.filter({ user_email: user?.email });
    },
    enabled: deepLinkedBookingId ? true : (!!user?.email && !authLoading),
    refetchInterval: 30_000,
  });

  const activeRentals = bookings.filter(isOperationalRental).sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
  const booking = deepLinkedBookingId ? bookings[0] : activeRentals[0];

  const { data: vehicleList = [] } = useQuery({
    queryKey: ["my-vehicle-record", booking?.vehicle_id],
    queryFn: () => base44.entities.Vehicle.filter({ id: booking?.vehicle_id }),
    enabled: !!booking?.vehicle_id,
  });
  const vehicle = vehicleList[0];

  const { data: devices = [] } = useQuery({
    queryKey: ["my-vehicle-device", booking?.vehicle_id],
    queryFn: () => base44.entities.TelematicsDevice.filter({ vehicle_id: booking?.vehicle_id }),
    enabled: !!booking?.vehicle_id,
    refetchInterval: 30_000,
  });
  const device = devices[0];

  const { data: addressData } = useQuery({
    queryKey: ["reverse-geocode", device?.last_latitude, device?.last_longitude],
    queryFn: async () => {
      if (!device?.last_latitude || !device?.last_longitude) return null;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${device.last_latitude}&lon=${device.last_longitude}&format=json`);
        const data = await res.json();
        const poi = data.address?.amenity || data.address?.shop || data.address?.building || data.address?.leisure || data.address?.tourism;
        const road = data.address?.road ? `${data.address.house_number ? data.address.house_number + " " : ""}${data.address.road}` : null;
        const city = data.address?.city || data.address?.town || data.address?.village || "";
        return { poi: poi || null, street: road || city || "Unknown Location", city_state: `${city}${data.address?.state ? ", " + data.address.state : ""}` };
      } catch (e) { return null; }
    },
    enabled: !!device?.last_latitude && !!device?.last_longitude,
    staleTime: 300000,
  });

  // Reflect the device's reported lock state unless a fresh command just ran
  useEffect(() => {
    if (Date.now() - lastLockCommandAtRef.current < 120000) return;
    if (device?.lock_state === "locked") setIsLocked(true);
    else if (device?.lock_state === "unlocked") setIsLocked(false);
  }, [device?.lock_state]);

  const isDemo = !booking;
  const pickupInspectionComplete = booking?.pickup_photos?.length > 0;
  const isBookingActive = !isDemo && booking
    ? ACTIVE_RENTAL_STATUSES.includes(booking.booking_status) && booking.payment_status === "paid"
    : false;
  const displayAddress = isDemo
    ? { poi: "Barton Creek Square", street: "2901 S Capital of Texas Hwy", city_state: "Austin, TX" }
    : addressData;
  const name = isDemo
    ? "2018 Toyota Mirai"
    : (vehicle?.display_name || [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || booking?.vehicle_name || "My Vehicle");

  const handleCommand = async (type) => {
    const isPaymentIssue = booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due";
    if (isPaymentIssue) {
      import("sonner").then(({ toast }) => {
        toast.error("Account Action Required", {
          description: "Please update your payment method to unlock vehicle controls.",
          action: { label: "Update Card", onClick: () => window.location.href = "/account" },
        });
      });
      return;
    }
    if (!pickupInspectionComplete && (type === "lock" || type === "unlock")) {
      if (!isBookingActive) {
        import("sonner").then(({ toast }) => {
          toast.error("Rental Not Started", {
            description: "You must complete the pickup inspection to unlock the vehicle.",
            action: { label: "Start Inspection", onClick: () => setInspectionTarget({ booking, type: "pickup" }) },
          });
        });
        return;
      }
      setInspectionTarget({ booking, type: "pickup" });
      return;
    }
    if (type === "find") {
      setCommandLoading("find");
      if (device?.id) {
        try {
          const { default: TelematicsService } = await import("@/lib/telematics/TelematicsService");
          await TelematicsService.startAlarm({ vehicle_id: vehicle?.id, telematics_device_id: device.id });
        } catch (err) { console.error("[GoldRemote] Alarm failed:", err); }
      }
      const { toast } = await import("sonner");
      toast.success("Vehicle alarm activated!", { description: "Opening map..." });
      setTimeout(() => {
        const lat = device?.last_latitude;
        const lon = device?.last_longitude;
        if (lat && lon) window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`, "_blank", "noopener,noreferrer");
      }, 1000);
      setTimeout(() => setCommandLoading(null), 2000);
      return;
    }
    if (!device?.id) {
      const { toast } = await import("sonner");
      toast.error("Device still loading", { description: "Please wait a moment and try again." });
      setTimeout(() => setCommandLoading(null), 1500);
      return;
    }

    setCommandLoading(type);
    try {
      const { default: TelematicsService } = await import("@/lib/telematics/TelematicsService");
      const { toast } = await import("sonner");
      await TelematicsService.sendCommand({
        telematics_device_id: device.id,
        vehicle_id: vehicle?.id || booking?.vehicle_id,
        booking_id: booking?.id,
        command_type: type,
        source: "vehicle_command_center",
      });
      toast.success(`Vehicle ${type}ed`);
      lastLockCommandAtRef.current = Date.now();
      setIsLocked(type === "lock");
    } catch (err) {
      console.error("[GoldRemote] Command failed:", type, err);
      const { toast } = await import("sonner");
      const errorMsg = err?.message || err?.error || (typeof err === "string" ? err : "Unknown error");
      const isAuthError = err?.status === 401 || err?.message?.includes("Unauthorized") || err?.error?.includes("Unauthorized");
      toast.error(isAuthError ? "Session expired — please sign in again" : "Command failed", { description: isAuthError ? undefined : errorMsg });
    }
    setTimeout(() => setCommandLoading(null), 2000);
  };

  const openInMaps = () => {
    const lat = device?.last_latitude;
    const lon = device?.last_longitude;
    const addressStr = displayAddress?.poi
      ? `${displayAddress.poi}, ${displayAddress.street}, ${displayAddress.city_state || ""}`
      : [displayAddress?.street, displayAddress?.city_state].filter(Boolean).join(", ");
    const url = lat && lon
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
      : addressStr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressStr)}` : null;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  if (authLoading || bookingsLoading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
        <div className="animate-spin" style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${GOLD}`, borderTopColor: "transparent" }} />
      </div>
    );
  }

  const lockLabel = isLocked === true ? "Doors Locked" : isLocked === false ? "Doors Unlocked" : "Door Status Unknown";
  const lockColor = isLocked === true ? GOLD_BRIGHT : isLocked === false ? GOLD : "#6B6B70";
  const busy = !!commandLoading;

  return (
    <div className="gold-remote" style={{ background: "#000", color: "#F5F5F7", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", position: "relative", overflow: "hidden" }}>
      <style>{`
        .gold-remote { height: 100vh; height: 100dvh; }
        @keyframes gold-breathe { 0%, 100% { opacity: 0.75 } 50% { opacity: 1 } }
      `}</style>

      {inspectionTarget && (
        <VehicleInspectionSheet
          booking={inspectionTarget.booking}
          type={inspectionTarget.type}
          onClose={() => setInspectionTarget(null)}
          onComplete={() => {}}
        />
      )}

      {/* Switch theme */}
      <button
        onClick={onOpenSkinPicker}
        aria-label="Switch view"
        className="control-tap"
        style={{
          position: "fixed", top: "max(12px, env(safe-area-inset-top))", right: "max(14px, env(safe-area-inset-right))",
          zIndex: 80, width: 40, height: 40, borderRadius: "50%", cursor: "pointer",
          background: "rgba(10,10,12,0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          border: `1px solid rgba(197,160,89,0.45)`, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Layers size={18} color={GOLD} />
      </button>

      {/* Brand */}
      <div style={{ paddingTop: "max(30px, calc(env(safe-area-inset-top) + 18px))", textAlign: "center" }}>
        <p style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 700,
          letterSpacing: "0.24em", textTransform: "uppercase", color: GOLD, margin: 0,
          textShadow: "0 0 22px rgba(212,175,55,0.4)",
        }}>
          uRide
        </p>
      </div>

      {/* Vehicle + status */}
      <div style={{
        position: "absolute", top: "46%", left: 0, right: 0, transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", padding: "0 24px",
      }}>
        <GoldVehicleWireframe width={172} />
        <div style={{ marginTop: 26, textAlign: "center", maxWidth: 340 }}>
          <p style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700,
            letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD_BRIGHT, margin: 0,
          }}>
            {name}
          </p>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: lockColor, margin: "6px 0 0" }}>
            {lockLabel}
          </p>
          <button
            onClick={openInMaps}
            style={{ marginTop: 14, background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, padding: 0 }}
          >
            <MapPin size={14} color={GOLD} />
            <span style={{ fontSize: 12, color: "rgba(197,160,89,0.9)", textAlign: "left", lineHeight: 1.35 }}>
              {displayAddress?.poi || displayAddress?.street || "Locating vehicle..."}
              {displayAddress?.city_state ? <span style={{ display: "block", color: "rgba(197,160,89,0.55)" }}>{displayAddress.city_state}</span> : null}
            </span>
          </button>
          <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(197,160,89,0.5)", margin: "10px 0 0" }}>
            GPS {freshness(device)}
          </p>
        </div>
      </div>

      {/* Control dock */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430, padding: "14px 14px calc(16px + env(safe-area-inset-bottom))",
        background: "linear-gradient(to top, rgba(0,0,0,0.96) 55%, rgba(0,0,0,0))", zIndex: 55,
      }}>
        <div style={{ display: "flex", gap: 8 }}>
          <GoldDockButton
            icon={<Lock />}
            label="Lock"
            active={isLocked === true}
            loading={commandLoading === "lock"}
            disabled={isDemo || busy}
            onClick={() => handleCommand("lock")}
          />
          <GoldDockButton
            icon={<MapPin />}
            label="Locate"
            loading={commandLoading === "find"}
            disabled={busy}
            onClick={() => handleCommand("find")}
          />
          <GoldDockButton
            icon={<Unlock />}
            label="Unlock"
            active={isLocked === false}
            loading={commandLoading === "unlock"}
            disabled={isDemo || busy}
            onClick={() => handleCommand("unlock")}
          />
          <SOSButton booking={booking} device={device} variant="tile" />
        </div>
      </div>
    </div>
  );
}