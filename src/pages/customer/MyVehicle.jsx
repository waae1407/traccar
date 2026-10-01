import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  Lock, Unlock, MapPin, Navigation, Clock, ChevronRight,
  Car, Calendar, Bell, User, Shield, AlertTriangle, X,
  CheckCircle2, Signal, Wind, MessageCircle, Zap,
} from "lucide-react";
import FindMyVehicleMap from "@/components/customer/mybookings/FindMyVehicleMap";
import VehicleInspectionSheet from "@/components/customer/VehicleInspectionSheet";
import SOSButton from "@/components/customer/sos/SOSButton";

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

// Card-based control button (matches mockup aesthetic)
function ControlButton({ icon: Icon, label, sub, onClick, loading, disabled, highlight }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="control-tap"
      style={{
        background: "#1C1C1E",
        borderRadius: 14,
        border: highlight ? "2px solid #0A84FF" : "1px solid rgba(255,255,255,0.08)",
        boxShadow: highlight ? "0 0 14px rgba(10,132,255,0.25)" : "none",
        padding: "14px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled && !loading ? 0.4 : 1,
        minHeight: 90,
      }}
    >
      {loading ? (
        <div style={{ width: 22, height: 22, border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#0A84FF", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      ) : (
        <Icon size={22} color={highlight ? "#0A84FF" : "#F5F5F7"} strokeWidth={2} />
      )}
      <span style={{ fontSize: 13, fontWeight: 700, color: "#F5F5F7" }}>{label}</span>
      <span style={{ fontSize: 10, color: "#8E8E93" }}>{sub}</span>
    </button>
  );
}

// Health indicator item with green/red check
function HealthItem({ label, ok }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1C1C1E", borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", background: ok ? "#30D158" : "#FF453A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {ok ? <CheckCircle2 size={14} color="#FFF" /> : <AlertTriangle size={14} color="#FFF" />}
      </div>
      <span style={{ fontSize: 12, color: "#8E8E93" }}>{label}</span>
    </div>
  );
}

// Circular progress ring (blue)
function ProgressRing({ progress, label, sublabel }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  return (
    <div style={{ position: "relative", width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="72" height="72" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
        <circle cx="36" cy="36" r={r} fill="none" stroke="#0A84FF" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#FFF", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 9, color: "#8E8E93", margin: 0 }}>{sublabel}</p>
      </div>
    </div>
  );
}

// Bottom nav item
function NavItem({ to, icon: Icon, label, active }) {
  return (
    <Link to={to} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, textDecoration: "none", padding: "4px 8px" }}>
      <Icon size={22} color={active ? "#0A84FF" : "#8E8E93"} />
      <span style={{ fontSize: 10, color: active ? "#0A84FF" : "#8E8E93", fontWeight: active ? 600 : 400 }}>{label}</span>
    </Link>
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

  // Rental progress for ring
  const endDateTime = booking?.scheduled_end_at ? new Date(booking.scheduled_end_at) : (booking?.end_date ? new Date(`${booking.end_date}T23:59:59`) : null);
  const startDateTime = booking?.start_date ? new Date(booking.start_date) : null;
  const totalRentalMs = startDateTime && endDateTime ? endDateTime - startDateTime : null;
  const elapsedMs = startDateTime ? Math.max(0, Date.now() - startDateTime) : 0;
  const rentalProgress = totalRentalMs ? Math.min(1, elapsedMs / totalRentalMs) : 0;
  const endDateStr = endDateTime ? format(endDateTime, "MMM d, yyyy") : "N/A";
  const endTimeStr = endDateTime ? format(endDateTime, "h:mm a") : "";

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#F5F5F7", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif", letterSpacing: "-0.01em", paddingBottom: 70 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {inspectionTarget && (
        <VehicleInspectionSheet
          booking={inspectionTarget.booking}
          type={inspectionTarget.type}
          onClose={() => setInspectionTarget(null)}
          onComplete={() => {}}
        />
      )}

      <div style={{ maxWidth: 430, margin: "0 auto", padding: "0 16px" }}>
        {/* ═══ HEADER ═══ */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#FFF", margin: 0 }}>{name}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: gps.status === "online" ? "#30D158" : "#8E8E93" }} />
              <span style={{ fontSize: 13, color: "#8E8E93" }}>{gps.status === "online" ? "Online" : "Offline"} • {gps.label}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link to="/messages" style={{ textDecoration: "none" }}>
              <MessageCircle size={22} color="#8E8E93" />
            </Link>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#FF2D55", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#FFF" }}>
              {(user?.full_name || user?.email || "R")[0].toUpperCase()}
            </div>
          </div>
        </header>

        {/* ═══ TOP INFO CARD ═══ */}
        <div style={{ background: "#1C1C1E", borderRadius: 16, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 24 }}>
              <div>
                <p style={{ fontSize: 20, fontWeight: 700, color: "#FFF", margin: 0 }}>{vehicle?.mileage ? `${Math.round(vehicle.mileage)} mi` : "—"}</p>
                <p style={{ fontSize: 12, color: "#8E8E93", margin: "2px 0 0" }}>Mileage</p>
              </div>
              <div>
                <p style={{ fontSize: 20, fontWeight: 700, color: "#FFF", margin: 0 }}>{battInfo.pct}%</p>
                <p style={{ fontSize: 12, color: "#8E8E93", margin: "2px 0 0" }}>Battery</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <Signal size={18} color="#8E8E93" />
              {isLocked ? <Lock size={18} color="#8E8E93" /> : <Unlock size={18} color="#8E8E93" />}
              <Wind size={18} color="#8E8E93" />
            </div>
          </div>
          <img src={vehicle?.image_url || PLACEHOLDER_CAR} alt={name} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 12 }} />
        </div>

        {/* ═══ MAP CARD ═══ */}
        <div style={{ background: "#1C1C1E", borderRadius: 16, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 16px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
              <MapPin size={16} color="#8E8E93" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#FFF", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayAddress?.street || "Locating..."}</p>
                <p style={{ fontSize: 12, color: "#8E8E93", margin: "1px 0 0" }}>{displayAddress?.city_state || ""}</p>
                <p style={{ fontSize: 11, color: "#8E8E93", margin: "2px 0 0" }}>Updated {gps.label === "Live" ? "just now" : gps.label}</p>
              </div>
            </div>
            <button
              onClick={() => {
                if (device?.last_latitude && device?.last_longitude) {
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${device.last_latitude},${device.last_longitude}`, "_blank");
                }
              }}
              className="control-tap"
              style={{
                width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.1)",
                border: "none", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
              }}
            >
              <Navigation size={18} color="#FFF" />
            </button>
          </div>
          <div style={{ height: 180, position: "relative" }}>
            {booking ? (
              <FindMyVehicleMap booking={booking} vehicleColor={vehicle?.color} />
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}>
                <Car size={32} color="#333" />
              </div>
            )}
          </div>
        </div>

        {/* ═══ RENTAL STATUS CARD ═══ */}
        {booking && (
          <div style={{ background: "#1C1C1E", borderRadius: 16, padding: "14px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Clock size={14} color="#8E8E93" />
                <span style={{ fontSize: 12, color: "#8E8E93" }}>Rental ends</span>
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#FFF", margin: 0 }}>{endDateStr}</p>
              <p style={{ fontSize: 13, color: "#8E8E93", margin: "1px 0 0" }}>{endTimeStr}</p>
            </div>
            <ProgressRing progress={rentalProgress} label={remainingStr} sublabel="remaining" />
            <div style={{ flex: 1, textAlign: "right" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", marginBottom: 4 }}>
                <Zap size={14} color="#8E8E93" />
                <span style={{ fontSize: 12, color: "#8E8E93" }}>Battery</span>
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#FFF", margin: 0 }}>{battInfo.pct}%</p>
              <p style={{ fontSize: 13, color: battInfo.color, margin: "1px 0 0" }}>{battInfo.label}</p>
            </div>
            <ChevronRight size={20} color="#8E8E93" />
          </div>
        )}

        {/* ═══ REMOTE CONTROLS ═══ */}
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#8E8E93", letterSpacing: "0.05em", margin: "0 0 10px" }}>REMOTE CONTROLS</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ControlButton icon={MapPin} label="Find Vehicle" sub="Locate & alarm" onClick={() => handleCommand("find")} loading={commandLoading === "find"} disabled={!booking} highlight />
            <ControlButton icon={Lock} label="Lock" sub="Secure doors" onClick={() => handleCommand("lock")} loading={commandLoading === "lock"} disabled={!booking || !pickupInspectionComplete} />
            <ControlButton icon={Unlock} label="Unlock" sub="Open doors" onClick={() => handleCommand("unlock")} loading={commandLoading === "unlock"} disabled={!booking || !pickupInspectionComplete} />
            <SOSButton booking={booking} device={device} variant="card" />
          </div>
          <p style={{ fontSize: 12, color: "#8E8E93", textAlign: "center", marginTop: 10 }}>
            {pickupInspectionComplete ? "Remote controls active" : "Lock and unlock available after pickup"}
          </p>
        </div>

        {/* ═══ END RENTAL ═══ */}
        {booking && !dropoffInspectionComplete && isBookingActive && (
          <button
            onClick={() => setInspectionTarget({ booking, type: "dropoff" })}
            className="control-tap"
            style={{
              width: "100%", background: "rgba(255,69,58,0.08)", border: "1.5px solid rgba(255,69,58,0.4)",
              borderRadius: 16, padding: "14px 16px", marginBottom: 12, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 12, textAlign: "left",
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,69,58,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Shield size={20} color="#FF453A" />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#FF453A", margin: 0 }}>End Your Rental</p>
              <p style={{ fontSize: 12, color: "#8E8E93", margin: "1px 0 0" }}>Complete return inspection to stop billing immediately</p>
            </div>
          </button>
        )}

        {/* ═══ VEHICLE HEALTH ═══ */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#8E8E93", letterSpacing: "0.05em", margin: 0 }}>VEHICLE HEALTH</p>
            <button onClick={() => setShowDiagnostics(true)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
              <CheckCircle2 size={14} color="#30D158" />
              <span style={{ fontSize: 12, color: "#30D158" }}>All systems normal</span>
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <HealthItem label="Vehicle Online" ok={gps.status === "online"} />
            <HealthItem label="Doors Closed" ok={!device?.door_open} />
            <HealthItem label="Battery Good" ok={battInfo.pct > 20} />
            <HealthItem label="GPS Signal" ok={gps.status === "online"} />
          </div>
        </div>
      </div>

      {/* ═══ BOTTOM NAV ═══ */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#000", borderTop: "1px solid rgba(255,255,255,0.08)", padding: "8px 0 max(8px, env(safe-area-inset-bottom))", zIndex: 50 }}>
        <div style={{ maxWidth: 430, margin: "0 auto", display: "flex", justifyContent: "space-around", alignItems: "center" }}>
          <NavItem to="/my-vehicle" icon={Car} label="My Vehicle" active />
          <NavItem to="/book-now" icon={Calendar} label="Book Now" />
          <NavItem to="/messages" icon={MessageCircle} label="Messages" />
          <NavItem to="/notifications" icon={Bell} label="Alerts" />
          <NavItem to="/account" icon={User} label="Account" />
        </div>
      </nav>

      {/* ═══ DIAGNOSTICS BOTTOM SHEET ═══ */}
      {showDiagnostics && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={() => setShowDiagnostics(false)} />
          <div style={{
            position: "relative", background: "#17181C", borderTop: "1px solid rgba(255,255,255,0.08)",
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