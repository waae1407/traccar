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
 * Black surface, metallic gold wordmark, wireframe vehicle centrepiece, and a
 * three-tile gold dock (Lock | Locate | Unlock). The emergency SOS keeps its
 * original red floating button, hovering above the dock.
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
    <div
      className="gold-remote"
      style={{
        background: "#000",
        color: "#F5F5F7",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif",
        display: "flex",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="gold-shell">
      <style>{`
        .gold-remote { height: 100vh; height: 100dvh; }
        .gold-shell { position: relative; width: 100%; max-width: 430px; height: 100%; display: flex; flex-direction: column; }
        .gold-car-box { width: min(172px, 44vw); }
        @media (max-height: 800px) { .gold-car-box { width: min(148px, 37vw); } }
        @media (max-height: 700px) { .gold-car-box { width: min(120px, 31vw); } }
        @keyframes gold-sos-pulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 6px rgba(255,59,48,0.35)); }
          50% { transform: scale(1.04); filter: drop-shadow(0 0 16px rgba(255,59,48,0.8)); }
        }
        .gold-sos { animation: gold-sos-pulse 2.4s ease-in-out infinite; }
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
          position: "absolute", top: "max(12px, env(safe-area-inset-top))", right: "max(14px, env(safe-area-inset-right))",
          zIndex: 80, width: 40, height: 40, borderRadius: "50%", cursor: "pointer",
          background: "rgba(10,10,12,0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(197,160,89,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Layers size={18} color={GOLD} />
      </button>

      {/* Wordmark */}
      <div style={{ paddingTop: "max(26px, calc(env(safe-area-inset-top) + 16px))", textAlign: "center" }}>
        <p
          style={{
            fontFamily: "'Inter', -apple-system, 'SF Pro Display', sans-serif",
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: "0.01em",
            margin: 0,
            background: "linear-gradient(180deg, #FFF4CC 0%, #FFD700 34%, #C5A059 68%, #8A6E33 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 18px rgba(212,175,55,0.35))",
          }}
        >
          uRide
        </p>
      </div>

      {/* Vehicle centrepiece */}
      <main
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
        }}
      >
        <div className="gold-car-box">
          <GoldVehicleWireframe />
        </div>
        <div style={{ marginTop: 20, textAlign: "center", maxWidth: 340 }}>
          <p
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#EADFC0",
              margin: 0,
            }}
          >
            {name}
          </p>
          <p style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: lockColor, margin: "7px 0 0" }}>
            {lockLabel}
          </p>
        </div>
      </main>

      {/* Location + control dock */}
      <footer style={{ padding: "0 16px calc(18px + env(safe-area-inset-bottom))" }}>
        <button
          onClick={openInMaps}
          style={{
            width: "100%", background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 6,
            padding: "0 0 14px",
          }}
        >
          <MapPin size={12} color={GOLD} style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: "rgba(197,160,89,0.72)", lineHeight: 1.35, textAlign: "left", maxWidth: 300 }}>
            {displayAddress?.poi || displayAddress?.street || "Locating vehicle..."}
            {displayAddress?.city_state ? `, ${displayAddress.city_state}` : ""}
            <span style={{ color: "rgba(197,160,89,0.42)" }}> · GPS {freshness(device)}</span>
          </span>
        </button>

        <div style={{ display: "flex", gap: 12 }}>
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
        </div>
      </footer>

      {/* Emergency SOS — original red floating button, hovering above the dock */}
      {booking && (
        <div
          className="gold-sos"
          style={{
            position: "absolute",
            right: "max(18px, env(safe-area-inset-right))",
            bottom: "calc(150px + env(safe-area-inset-bottom))",
            zIndex: 70,
          }}
        >
          <SOSButton booking={booking} device={device} inline size={60} />
        </div>
      )}
      </div>
    </div>
  );
}