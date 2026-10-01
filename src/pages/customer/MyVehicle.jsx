import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  Lock, Unlock, MapPin, Navigation, ChevronUp, ChevronDown,
  Car, Calendar, Mail, Bell, User, Shield, AlertTriangle, X,
} from "lucide-react";
import FindMyVehicleMap from "@/components/customer/mybookings/FindMyVehicleMap";
import VehicleInspectionSheet from "@/components/customer/VehicleInspectionSheet";
import SOSButton from "@/components/customer/sos/SOSButton";
import VehicleExpandedDrawer from "@/components/customer/myvehicle/VehicleExpandedDrawer";

const ACTIVE_RENTAL_STATUSES = ["active", "approved", "confirmed", "checked_out", "return_required", "post_inspection_required", "overdue_return", "payment_due", "grace_period", "return_pending_host_review", "under_review"];
const PLACEHOLDER_CAR = "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&auto=format&fit=crop&q=80";

function getDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function getCompassDirection(course) {
  if (course === undefined || course === null) return "Unknown";
  const val = course % 360;
  if (val >= 337.5 || val < 22.5) return `${val}° (North)`;
  if (val >= 22.5 && val < 67.5) return `${val}° (NE)`;
  if (val >= 67.5 && val < 112.5) return `${val}° (East)`;
  if (val >= 112.5 && val < 157.5) return `${val}° (SE)`;
  if (val >= 157.5 && val < 202.5) return `${val}° (South)`;
  if (val >= 202.5 && val < 247.5) return `${val}° (SW)`;
  if (val >= 247.5 && val < 292.5) return `${val}° (West)`;
  if (val >= 292.5 && val < 337.5) return `${val}° (NW)`;
  return `${val}°`;
}

function isOperationalRental(booking) {
  if (!booking) return false;
  const ACTIVE_PHASES = ['payment_complete', 'pickup_required', 'checked_out', 'active', 'return_required', 'return_in_progress', 'host_review'];
  if (booking.rental_lifecycle_phase && ACTIVE_PHASES.includes(booking.rental_lifecycle_phase)) return true;
  if (!ACTIVE_RENTAL_STATUSES.includes(booking.booking_status)) return false;
  return true;
}

function isOverdue(booking) {
  if (!booking || !booking.end_date) return false;
  return Date.now() > new Date(`${booking.end_date}T23:59:59`).getTime();
}

function vehicleName(vehicle, booking) {
  return vehicle?.display_name || [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || booking?.vehicle_name || "My Vehicle";
}

function getBatteryInfo(device) {
  const voltage = device?.power_voltage || device?.battery_voltage || 0;
  if (!voltage) return { pct: 0, label: "Unknown", color: "#71717A", voltage: "0.0" };
  let pct = 0;
  if (device?.ignition_status === 'on' || voltage >= 13.0) {
    pct = 100;
  } else {
    pct = Math.max(0, Math.min(100, Math.round(((voltage - 11.8) / (12.6 - 11.8)) * 100)));
  }
  let label = "Good";
  let color = "#30D158";
  if (voltage < 11.8) { label = "Critical"; color = "#FF453A"; }
  else if (voltage <= 12.1) { label = "Low"; color = "#FF9F0A"; }
  if (device?.ignition_status === 'on' || voltage >= 13.0) { label = "Charging"; color = "#30D158"; }
  return { pct, label, color, voltage: voltage.toFixed(1) };
}

function freshness(device) {
  const value = device?.last_seen_at || device?.location_updated_at;
  if (!value) return { label: "No GPS", status: "offline" };
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 2) return { label: "Live", status: "online" };
  if (minutes < 30) return { label: `${minutes}m ago`, status: "online" };
  return { label: "Stale", status: "offline" };
}

function DiagRow({ label, value, isAlert }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#A1A1AA" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: isAlert ? "#FF453A" : "#F5F5F7" }}>{value}</span>
    </div>
  );
}

// Gold circular control button
function GoldCircleBtn({ icon, label, sub, onClick, loading, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`control-tap ${loading ? "btn-loading-spin" : ""}`}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        background: "none",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled && !loading ? 0.4 : 1,
        padding: 0,
        transition: "all 0.2s ease-in-out",
      }}
    >
      <div
        style={{
          width: 68,
          height: 68,
          borderRadius: "50%",
          background: "rgba(10,10,12,0.8)",
          border: "2px solid rgba(212,175,55,0.55)",
          boxShadow: "0 0 18px rgba(212,175,55,0.25), inset 0 0 12px rgba(212,175,55,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <div className="btn-loading-content" style={{ gap: 0 }}>
          {loading ? (
            <div style={{ width: 22, height: 22, border: "2px solid rgba(212,175,55,0.3)", borderTopColor: "#D4AF37", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          ) : (
            icon
          )}
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#D4AF37", letterSpacing: "0.1em", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 8, color: "#71717A", margin: "1px 0 0", fontWeight: 500, letterSpacing: "0.04em" }}>{sub}</p>
      </div>
    </button>
  );
}

export default function MyVehicle() {
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const deepLinkedBookingId = searchParams.get("booking_id");
  const isAdminPreview = !!deepLinkedBookingId;
  const [inspectionTarget, setInspectionTarget] = useState(null);
  const [commandLoading, setCommandLoading] = useState(null);
  const [isLocked, setIsLocked] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data: bookings = [], isLoading: bookingsLoading, error: bookingsError } = useQuery({
    queryKey: ["my-vehicle-bookings", user?.email, deepLinkedBookingId],
    queryFn: async () => {
      if (deepLinkedBookingId) {
        const bookingRecord = await base44.entities.BookingRequest.get(deepLinkedBookingId);
        return [bookingRecord];
      }
      const results = await base44.entities.BookingRequest.filter({ user_email: user?.email });
      return results;
    },
    enabled: deepLinkedBookingId ? true : (!!user?.email && !authLoading),
    refetchInterval: 30_000,
  });

  const activeRentals = bookings.filter(isOperationalRental).sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
  const booking = deepLinkedBookingId ? bookings[0] : activeRentals[0];
  const isOverdueRental = isOverdue(booking);

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
    refetchInterval: 20_000,
  });
  const device = devices[0];
  const gps = freshness(device);

  const { data: safetyEvents = [] } = useQuery({
    queryKey: ["customer-safety-events", booking?.vehicle_id],
    queryFn: () => base44.entities.TelematicsSafetyEvent.filter({ vehicle_id: booking?.vehicle_id, is_active: true, visible_to_customer: true }),
    enabled: !!booking?.vehicle_id,
    refetchInterval: 15_000,
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ["pickup-snapshot", booking?.id],
    queryFn: () => base44.entities.OdometerSnapshot.filter({ booking_id: booking?.id, snapshot_type: "rental_pickup" }),
    enabled: !!booking?.id,
  });
  const pickupSnapshot = snapshots[0];

  const { data: addressData } = useQuery({
    queryKey: ["reverse-geocode", device?.last_latitude, device?.last_longitude],
    queryFn: async () => {
      if (!device?.last_latitude || !device?.last_longitude) return null;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${device.last_latitude}&lon=${device.last_longitude}&format=json`);
        const data = await res.json();
        const poi = data.address?.amenity || data.address?.shop || data.address?.building || data.address?.leisure || data.address?.tourism;
        const road = data.address?.road ? `${data.address.house_number ? data.address.house_number + ' ' : ''}${data.address.road}` : null;
        const city = data.address?.city || data.address?.town || data.address?.village || "";
        return { poi: poi || null, street: road || city || "Unknown Location", city_state: `${city}${data.address?.state ? ', ' + data.address.state : ''}` };
      } catch (e) { return null; }
    },
    enabled: !!device?.last_latitude && !!device?.last_longitude,
    staleTime: 300000,
  });

  const [userLoc, setUserLoc] = useState(null);
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      }, () => {}, { enableHighAccuracy: false, maximumAge: 60000 });
    }
  }, []);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const endDateMs = booking?.end_date ? new Date(`${booking.end_date}T23:59:59`).getTime() : null;
  const diffMs = endDateMs ? Math.max(0, endDateMs - now) : null;
  const remainingDays = diffMs != null ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : null;
  const remainingHours = diffMs != null ? Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)) : null;
  const remainingStr = remainingDays != null
    ? (remainingDays > 0 ? `${remainingDays}d ${remainingHours}h` : `${remainingHours}h`)
    : "N/A";

  const handleCommand = async (type) => {
    const isPaymentIssue = booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due";

    if (isPaymentIssue) {
      import("sonner").then(({ toast }) => {
        toast.error("Account Action Required", {
          description: "Please update your payment method to unlock vehicle controls.",
          action: { label: "Update Card", onClick: () => window.location.href = "/account" }
        });
      });
      return;
    }

    if (!isBookingActive && !pickupInspectionComplete && (type === "lock" || type === "unlock")) {
      import("sonner").then(({ toast }) => {
        toast.error("Rental Not Started", {
          description: "You must complete the pickup inspection to unlock the vehicle.",
          action: { label: "Start Inspection", onClick: () => setInspectionTarget({ booking, type: "pickup" }) }
        });
      });
      return;
    }

    if (!pickupInspectionComplete && (type === "lock" || type === "unlock")) {
      setInspectionTarget({ booking, type: "pickup" });
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
      if (type === "lock" || type === "unlock") {
        await TelematicsService.sendCommand({
          telematics_device_id: device.id,
          vehicle_id: vehicle?.id || booking?.vehicle_id,
          booking_id: booking?.id,
          command_type: type,
          source: "vehicle_command_center",
        });
        toast.success(`Vehicle ${type}ed`);
        setIsLocked(type === "lock");
      } else if (type === "find") {
        await TelematicsService.startAlarm({ vehicle_id: vehicle?.id, telematics_device_id: device.id });
        toast.success("Vehicle alarm activated!");
        if (device?.last_latitude && device?.last_longitude) {
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${device.last_latitude},${device.last_longitude}`, "_blank");
        }
      }
    } catch (err) {
      console.error("[MyVehicle] Command failed:", type, err);
      const { toast } = await import("sonner");
      const errorMsg = err?.message || err?.error || (typeof err === "string" ? err : "Unknown error");
      const isAuthError = err?.status === 401 || err?.message?.includes("Unauthorized") || err?.error?.includes("Unauthorized");
      toast.error(isAuthError ? "Session expired — please sign in again" : "Command failed", {
        description: isAuthError ? undefined : errorMsg,
      });
    }
    setTimeout(() => setCommandLoading(null), 2000);
  };

  if (authLoading || bookingsLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
        <div style={{ width: 28, height: 28, border: "2px solid #D4AF37", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  // Demo mode: no active booking
  const isDemo = !booking;
  const name = isDemo ? "2018 Toyota Mirai" : vehicleName(vehicle, booking);
  const battInfo = isDemo ? { pct: 100, label: "Good", color: "#30D158", voltage: "12.8" } : getBatteryInfo(device);
  const pickupInspectionComplete = booking?.pickup_photos?.length > 0;
  const dropoffInspectionComplete = booking?.return_exterior_photos?.length > 0 || booking?.return_interior_photos?.length > 0;
  const isBookingActive = !isDemo && booking
    ? ["active", "approved", "confirmed", "checked_out", "return_required", "post_inspection_required", "overdue_return", "return_pending_host_review", "under_review"].includes(booking.booking_status) &&
      (booking.rental_lifecycle_phase ? ["payment_complete", "pickup_required", "checked_out", "active", "return_required", "return_in_progress", "host_review"].includes(booking.rental_lifecycle_phase) : true) &&
      booking.payment_status === "paid"
    : false;
  const isReturnRequired = !isDemo && booking && ["return_required", "post_inspection_required", "overdue_return"].includes(booking.booking_status);

  const activeAlarms = safetyEvents.map(event => ({
    id: event.id,
    label: event.alert_message || event.alert_title,
    color: event.customer_severity === "critical" ? "#FF453A" : "#FF9F0A"
  }));
  const displayAddress = isDemo ? { poi: "Barton Creek Square", street: "2901 S Capital of Texas Hwy", city_state: "Austin, TX" } : addressData;

  let distanceStr = null;
  if (isDemo) {
    distanceStr = "0.3 mi away";
  } else if (userLoc && device?.last_latitude) {
    const dist = getDistanceMiles(userLoc.lat, userLoc.lon, device.last_latitude, device.last_longitude);
    distanceStr = dist < 0.1 ? "Near you" : `${dist.toFixed(1)} mi away`;
  }

  let parkedStr = null;
  if (isDemo) {
    parkedStr = "Parked for 2 hrs";
  } else if (device?.speed === 0 || device?.ignition_status === 'off') {
    if (device?.parked_at) {
      const hours = Math.floor((Date.now() - new Date(device.parked_at).getTime()) / 3600000);
      const mins = Math.floor((Date.now() - new Date(device.parked_at).getTime()) / 60000);
      if (hours >= 24) { const days = Math.floor(hours / 24); parkedStr = `Parked ${days}d`; }
      else if (hours > 0) parkedStr = `Parked ${hours}h`;
      else if (mins > 0) parkedStr = `Parked ${mins}m`;
      else parkedStr = "Just parked";
    } else { parkedStr = "Parked"; }
  }

  return (
    <div className="dvh-fill" style={{ background: "#000", color: "#F5F5F7", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif", letterSpacing: "-0.01em", position: "relative", overflow: "hidden" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes borderSpin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
        .btn-loading-spin { overflow: hidden; }
        .btn-loading-spin > div:first-child::before {
          content: ''; position: absolute; top: 50%; left: 50%;
          width: 250%; height: 250%;
          background: conic-gradient(from 0deg, transparent 75%, rgba(212,175,55,0.85) 100%);
          animation: borderSpin 1s linear infinite;
          z-index: 0;
        }
        .glass-panel {
          background: rgba(8,8,10,0.72);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(212,175,55,0.18);
        }
        .dvh-fill { height: 100vh; height: 100dvh; }
      `}</style>

      {inspectionTarget && (
        <VehicleInspectionSheet
          booking={inspectionTarget.booking}
          type={inspectionTarget.type}
          onClose={() => setInspectionTarget(null)}
          onComplete={() => {}}
        />
      )}

      {/* ═══ FULL BLEED MAP ═══ */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, background: "#000" }}>
        {booking ? (
          <FindMyVehicleMap booking={booking} vehicleColor={vehicle?.color} />
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <Car size={32} color="#333" style={{ margin: "0 auto 8px" }} />
              <p style={{ color: "#555", fontSize: 13 }}>No active rental</p>
            </div>
          </div>
        )}
      </div>

      {/* ═══ FLEX OVERLAY ═══ */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 10,
        display: "flex", flexDirection: "column",
        pointerEvents: "none", boxSizing: "border-box",
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}>
      {/* ═══ ALERT BANNERS ═══ */}
      {(isReturnRequired || isOverdueRental || activeAlarms.length > 0) && (
        <div style={{ order: 2, pointerEvents: "auto", flexShrink: 0, paddingTop: 6, maxWidth: 398, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
          {isReturnRequired && (
            <div style={{ background: "rgba(255,159,10,0.15)", border: "1px solid rgba(255,159,10,0.4)", borderRadius: 12, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(10px)" }}>
              <Shield size={15} color="#FF9F0A" />
              <p style={{ fontSize: 12, fontWeight: 600, color: "#FFF", margin: 0 }}>Return Inspection Required</p>
            </div>
          )}
          {isOverdueRental && !isReturnRequired && (
            <div style={{ background: "rgba(255,69,58,0.15)", border: "1px solid rgba(255,69,58,0.4)", borderRadius: 12, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(10px)" }}>
              <AlertTriangle size={15} color="#FF453A" />
              <p style={{ fontSize: 12, fontWeight: 600, color: "#FFF", margin: 0 }}>Rental Overdue — Return vehicle immediately</p>
            </div>
          )}
          {activeAlarms.map(alarm => (
            <div key={alarm.id} style={{ background: "rgba(255,69,58,0.15)", border: `1px solid ${alarm.color}`, borderRadius: 12, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(10px)" }}>
              <AlertTriangle size={15} color={alarm.color} />
              <p style={{ fontSize: 12, fontWeight: 600, color: "#FFF", margin: 0 }}>{alarm.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ═══ TOP HEADER — frosted glass ═══ */}
      <div style={{ order: 1, pointerEvents: "auto", flexShrink: 0, maxWidth: 398, margin: "0 auto", width: "100%" }}>
        <div className="glass-panel" style={{ borderRadius: 16, padding: "10px 14px" }}>
          {/* Top row: status • title • parked badge */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#39FF14", boxShadow: "0 0 8px #39FF14", flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#39FF14" }}>ACTIVE</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#FFF", letterSpacing: "0.06em" }}>MY VEHICLE</span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#D4AF37",
              border: "1px solid rgba(212,175,55,0.5)", borderRadius: 6, padding: "3px 8px",
              background: "rgba(212,175,55,0.08)",
            }}>
              {parkedStr ? parkedStr.toUpperCase() : "PARKED"}
            </span>
          </div>
          {/* Address row */}
          <div style={{ textAlign: "center", marginTop: 6 }}>
            <span style={{ fontSize: 10, color: "#A1A1AA", letterSpacing: "0.08em", fontWeight: 500 }}>
              {displayAddress
                ? `${(displayAddress.poi || displayAddress.street || "LOCATING").toUpperCase()} • ${(displayAddress.city_state || "").toUpperCase()}`
                : "LOCATING VEHICLE..."
              }
            </span>
          </div>
          {distanceStr && (
            <div style={{ textAlign: "center", marginTop: 2 }}>
              <span style={{ fontSize: 9, color: "#89B4F8", fontWeight: 600, letterSpacing: "0.04em" }}>{distanceStr.toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ CENTER CONTROLS ═══ */}
      <div style={{ order: 3, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, pointerEvents: "none", maxWidth: 430, margin: "0 auto", width: "100%" }}>
      {!expanded && (
        <>
          {/* SAFE DRIVER badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            border: "1px solid rgba(57,255,20,0.5)", borderRadius: 999,
            padding: "5px 14px", background: "rgba(57,255,20,0.05)",
          }}>
            <Shield size={12} color="#39FF14" />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#39FF14" }}>SAFE DRIVER</span>
          </div>

          {/* SOS (left) + Navigate (right) */}
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "0 50px", pointerEvents: "auto" }}>
            <SOSButton booking={booking} device={device} inline />
            <button
              onClick={() => {
                if (device?.last_latitude && device?.last_longitude) {
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${device.last_latitude},${device.last_longitude}`, "_blank");
                }
              }}
              style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "rgba(47,128,255,0.12)", border: "2px solid rgba(47,128,255,0.6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: "0 0 16px rgba(47,128,255,0.3)",
                backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
              }}
              className="control-tap"
            >
              <Navigation size={22} color="#2F80FF" style={{ transform: "rotate(45deg)" }} />
            </button>
          </div>
        </>
      )}
      </div>

      {/* ═══ BOTTOM PANEL ═══ */}
      <div style={{ order: 4, pointerEvents: "auto", flexShrink: 0, maxWidth: 430, margin: "0 auto", width: "100%" }}>
        <div className="glass-panel" style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottom: "none", padding: "16px 16px 0" }}>
          {!expanded ? (
            <>
              {/* Gold circular buttons */}
              <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 12 }}>
                <GoldCircleBtn
                  icon={<Lock size={22} color={isLocked ? "#39FF14" : "#D4AF37"} strokeWidth={2.2} />}
                  label="LOCK"
                  sub={isLocked ? "LOCKED" : "OPEN"}
                  onClick={() => booking && handleCommand("lock")}
                  loading={commandLoading === "lock"}
                  disabled={!!commandLoading || dropoffInspectionComplete}
                />
                <GoldCircleBtn
                  icon={<MapPin size={22} color="#D4AF37" strokeWidth={2.2} />}
                  label="LOCATE"
                  sub="FIND"
                  onClick={() => booking && handleCommand("find")}
                  loading={commandLoading === "find"}
                  disabled={!!commandLoading || dropoffInspectionComplete}
                />
                <GoldCircleBtn
                  icon={<Unlock size={22} color={!isLocked ? "#39FF14" : "#D4AF37"} strokeWidth={2.2} />}
                  label="UNLOCK"
                  sub={isLocked ? "DOORS" : "OPEN"}
                  onClick={() => booking && handleCommand("unlock")}
                  loading={commandLoading === "unlock"}
                  disabled={!!commandLoading || dropoffInspectionComplete}
                />
              </div>

              {/* MORE handle */}
              <button
                onClick={() => setExpanded(true)}
                style={{
                  width: "100%", background: "none", border: "none", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  padding: "4px 0 8px",
                }}
              >
                <ChevronUp size={16} color="#D4AF37" style={{ opacity: 0.7 }} />
                <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.1em", color: "#D4AF37", opacity: 0.8 }}>
                  MORE — RENTAL • VEHICLE HEALTH • ADVANCED CONTROLS
                </span>
              </button>
            </>
          ) : (
            <>
              {/* Expanded content */}
              <VehicleExpandedDrawer
                booking={booking}
                device={device}
                gps={gps}
                battInfo={battInfo}
                isOverdueRental={isOverdueRental}
                isReturnRequired={isReturnRequired}
                isBookingActive={isBookingActive}
                dropoffInspectionComplete={dropoffInspectionComplete}
                remainingStr={remainingStr}
                onClose={() => setExpanded(false)}
                onOpenDiagnostics={() => { setShowDiagnostics(true); setExpanded(false); }}
                onEndRental={() => { setInspectionTarget({ booking, type: "dropoff" }); setExpanded(false); }}
              />
            </>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(212,175,55,0.15)", margin: "0 -16px" }} />

          {/* Bottom nav */}
          <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 0 12px" }}>
            {[
              { icon: <Car size={20} />, label: "My Vehicle", path: "/my-vehicle", active: true },
              { icon: <Calendar size={20} />, label: "Book Now", path: "/book-now", active: false },
              { icon: <Mail size={20} />, label: "Messages", path: "/messages", active: false },
              { icon: <Bell size={20} />, label: "Alerts", path: "/notifications", active: false },
              { icon: <User size={20} />, label: "Account", path: "/account", active: false },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => window.location.href = item.path}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span style={{ color: item.active ? "#D4AF37" : "#71717A" }}>{item.icon}</span>
                <span style={{ fontSize: 8, fontWeight: item.active ? 700 : 400, color: item.active ? "#D4AF37" : "#71717A", letterSpacing: "0.02em" }}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>

      {/* ═══ DIAGNOSTICS BOTTOM SHEET ═══ */}
      {showDiagnostics && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={() => setShowDiagnostics(false)} />
          <div style={{
            position: "relative", background: "#17181C", borderTop: "1px solid rgba(212,175,55,0.2)",
            borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: "24px 20px 40px",
            boxShadow: "0 -10px 40px rgba(0,0,0,0.5)", animation: "fade-in-up 0.3s ease-out",
            maxHeight: "85vh", display: "flex", flexDirection: "column",
            maxWidth: 430, margin: "0 auto", width: "100%",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#FFF", margin: 0 }}>System Diagnostics</h3>
                <p style={{ fontSize: 12, color: "#A1A1AA", margin: "2px 0 0" }}>Raw telemetry from MT20 interface</p>
              </div>
              <button onClick={() => setShowDiagnostics(false)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={16} color="#FFF" />
              </button>
            </div>

            <div style={{ overflowY: "auto", flex: 1, paddingRight: 4, paddingBottom: 20 }} className="no-scrollbar">
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#71717A", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10, margin: "0 0 10px 0" }}>Security & Access</p>
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px", display: "grid", gap: 12 }}>
                  <DiagRow label="Doors" value={device?.door_open ? "Open" : "Closed"} isAlert={device?.door_open} />
                  <DiagRow label="Trunk" value={device?.trunk_open ? "Open" : "Closed"} isAlert={device?.trunk_open} />
                  <DiagRow label="Starter Circuit" value={device?.starter_disabled ? "Disabled" : "Normal"} isAlert={device?.starter_disabled} />
                  <DiagRow label="Hood Wire Volt" value={device?.hood_wire_voltage ? `${device.hood_wire_voltage}V (Analog)` : "0.0V (Analog)"} />
                  <DiagRow label="Door Wire Volt" value={device?.door_wire_voltage ? `${device.door_wire_voltage}V (Analog)` : "0.0V (Analog)"} />
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#71717A", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10, margin: "0 0 10px 0" }}>System Alarms</p>
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px", display: "grid", gap: 12 }}>
                  <DiagRow label="Impact / Shock" value={device?.shock_alarm ? "Triggered" : "Clear"} isAlert={device?.shock_alarm} />
                  <DiagRow label="Power Cut" value={device?.power_cut_alarm ? "Triggered" : "Clear"} isAlert={device?.power_cut_alarm} />
                  <DiagRow label="Low Battery" value={device?.low_battery_alarm ? "Triggered" : "Clear"} isAlert={device?.low_battery_alarm} />
                  <DiagRow label="Overspeed" value={device?.overspeed_alarm ? "Triggered" : "Clear"} isAlert={device?.overspeed_alarm} />
                  <DiagRow label="Movement" value={device?.movement_alarm ? "Triggered" : "Clear"} isAlert={device?.movement_alarm} />
                  <DiagRow label="Geofence" value={device?.geofence_alarm ? "Triggered" : "Clear"} isAlert={device?.geofence_alarm} />
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#71717A", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10, margin: "0 0 10px 0" }}>Environmental</p>
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px", display: "grid", gap: 12 }}>
                  <DiagRow label="Smoke Sensor" value={device?.smoke_detected ? "Detected" : "Clear"} isAlert={device?.smoke_detected} />
                  <DiagRow label="Smoke Voltage" value={device?.smoke_voltage ? `${device.smoke_voltage}V (Analog)` : "0.0V (Analog)"} />
                </div>
              </div>

              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#71717A", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10, margin: "0 0 10px 0" }}>Raw Data</p>
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", padding: "12px 16px", display: "grid", gap: 12 }}>
                  <DiagRow label="Bluetooth" value={device?.bluetooth_on ? "Active" : "Inactive"} />
                  <DiagRow label="Direction Heading" value={getCompassDirection(device?.course)} />
                  <DiagRow label="Device Mileage" value={device?.device_mileage ? `${device.device_mileage.toLocaleString()} miles` : "0 miles"} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}