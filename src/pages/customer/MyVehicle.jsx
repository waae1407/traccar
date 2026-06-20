import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, intervalToDuration } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Lock, Unlock, Wind, Camera, Clock, Fuel, CheckCircle, Navigation, ChevronRight, Car, Calendar, Mail, Bell, User, MessageSquare, MapPin, Shield } from "lucide-react";
import FindMyVehicleMap from "@/components/customer/mybookings/FindMyVehicleMap";
import VehicleInspectionSheet from "@/components/customer/VehicleInspectionSheet";

const ACTIVE_RENTAL_STATUSES = ["active", "approved", "confirmed", "payment_due", "grace_period", "return_pending_host_review", "under_review"];
const PLACEHOLDER_CAR = "https://images.unsplash.com/photo-1617654112329-5e3d7b5f56e7?w=600&auto=format&fit=crop&q=80&ixlib=rb-4.0.3";

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
  if (!value) return { label: "No GPS", status: "offline" };
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 2) return { label: "Live", status: "online" };
  if (minutes < 30) return { label: `${minutes}m ago`, status: "online" };
  return { label: "Stale", status: "offline" };
}

// Signal bars SVG icon
function SignalBarsIcon({ color = "#A1A1AA" }) {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
      <rect x="0" y="9" width="3" height="5" rx="1" fill={color} />
      <rect x="4.5" y="6.5" width="3" height="7.5" rx="1" fill={color} />
      <rect x="9" y="3.5" width="3" height="10.5" rx="1" fill={color} />
      <rect x="13.5" y="0" width="3" height="14" rx="1" fill={color} />
    </svg>
  );
}

// Fan/climate SVG
function FanIcon({ color = "#A1A1AA" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2" fill={color} />
      <path d="M9 7C9 7 7.5 3 5 2C3.5 1.5 3 3 4 4.2C5 5.4 7.5 6.5 7.5 6.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11 9C11 9 15 10.5 16 13.5C16.5 15 15 15.5 14 14.5C13 13.5 11.5 11 11.5 11" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9 11C9 11 10.5 15 13.5 16C15 16.5 15.5 15 14.5 14C13.5 13 11 11.5 11 11.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 9C7 9 3 7.5 2 4.5C1.5 3 3 2.5 4 3.5C5 4.5 6.5 7 6.5 7" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// Find Vehicle horn SVG
function HornIcon({ color = "#2F80FF" }) {
  return (
    <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
      <path d="M1 7.5H7L15 3V21L7 16.5H1V7.5Z" fill={color} />
      <path d="M15 5C18 6.5 20 9 20 12C20 15 18 17.5 15 19" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="23" y1="7" x2="31" y2="7" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="23" y1="12" x2="31" y2="12" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="23" y1="17" x2="31" y2="17" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export default function MyVehicle() {
  const { user, isLoading: authLoading } = useAuth();
  const [inspectionTarget, setInspectionTarget] = useState(null);
  const [commandLoading, setCommandLoading] = useState(null);

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["my-vehicle-bookings", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user?.email }),
    enabled: !!user?.email && !authLoading,
    refetchInterval: 60_000,
  });

  const activeRentals = bookings.filter(isOperationalRental).sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
  const booking = activeRentals[0];

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
  const gps = freshness(device);

  const remainingTime = booking?.end_date
    ? intervalToDuration({ start: new Date(), end: new Date(`${booking.end_date}T23:59:59`) })
    : null;
  const remainingStr = remainingTime
    ? `${remainingTime.days ? remainingTime.days + 'd ' : ''}${remainingTime.hours || 0}h ${remainingTime.minutes || 0}m`
    : "N/A";

  const handleCommand = async (type) => {
    if (!pickupInspectionComplete && (type === "lock" || type === "unlock")) {
      setInspectionTarget({ booking, type: "pickup" });
      return;
    }
    setCommandLoading(type);
    try {
      const { default: TelematicsService } = await import("@/lib/telematics/TelematicsService");
      const { toast } = await import("sonner");
      if (type === "lock" || type === "unlock") {
        await TelematicsService.sendCommand({
          telematics_device_id: device?.id,
          vehicle_id: vehicle?.id,
          booking_id: booking?.id,
          command_type: type,
          source: "vehicle_command_center",
        });
        toast.success(`Vehicle ${type}ed`);
      } else if (type === "find") {
        await TelematicsService.startAlarm({ vehicle_id: vehicle?.id, telematics_device_id: device?.id });
        toast.success("Vehicle alarm activated!");
        if (device?.last_latitude && device?.last_longitude) {
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${device.last_latitude},${device.last_longitude}`, "_blank");
        }
      }
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error("Command failed");
    }
    setTimeout(() => setCommandLoading(null), 2000);
  };

  if (authLoading || bookingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#050506" }}>
        <div className="w-8 h-8 border-2 border-[#2F80FF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const name = booking ? vehicleName(vehicle, booking) : "My Vehicle";
  const pickupInspectionComplete = booking?.pickup_photos?.length > 0;
  const dropoffInspectionComplete = booking?.return_exterior_photos?.length > 0 || booking?.return_interior_photos?.length > 0;
  const isBookingActive = booking
    ? ["active", "approved", "confirmed", "return_pending_host_review", "under_review"].includes(booking.booking_status) &&
      booking.payment_status === "paid" &&
      !booking.rental_ended_at
    : false;

  const vehicleImage = vehicle?.image_url || PLACEHOLDER_CAR;
  const locationLabel = device?.address || "Vehicle Location";
  const locationSub = device?.last_latitude ? `${device.last_latitude.toFixed(4)}, ${device.last_longitude.toFixed(4)}` : "Locating...";

  return (
    <div style={{ background: "#050506", minHeight: "100vh" }}>
      {inspectionTarget && (
        <VehicleInspectionSheet
          booking={inspectionTarget.booking}
          type={inspectionTarget.type}
          onClose={() => setInspectionTarget(null)}
          onComplete={() => {}}
        />
      )}

      {/* Centered mobile container */}
      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: "#050506", position: "relative" }}>

        {/* ── HERO SECTION ── */}
        <div style={{
          background: "radial-gradient(circle at 75% 20%, rgba(47,128,255,0.16), transparent 50%), #050506",
          padding: "16px 16px 12px",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Top row */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <p style={{ fontSize: 26, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.15 }}>{name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#30D158", display: "inline-block" }} />
                <span style={{ color: "#30D158", fontSize: 14, fontWeight: 500 }}>Online</span>
                <span style={{ color: "#A1A1AA", fontSize: 14 }}>|</span>
                <span style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 400 }}>Live</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.location.href = "/messages"}
                style={{ width: 36, height: 36, borderRadius: "50%", background: "#17181C", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <MessageSquare size={16} color="#A1A1AA" />
              </button>
              <button
                onClick={() => window.location.href = "/account"}
                style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #9B59B6, #E91E8C)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: 15 }}
              >
                {user?.full_name?.charAt(0) || "R"}
              </button>
            </div>
          </div>

          {/* Stats + Image row */}
          <div className="flex items-end" style={{ minHeight: 120 }}>
            {/* Left: stats */}
            <div style={{ flex: 1, paddingBottom: 8 }}>
              <div className="flex items-end gap-5 mb-4">
                <div>
                  <p style={{ fontSize: 28, fontWeight: 700, color: "#FFFFFF", lineHeight: 1 }}>268 mi</p>
                  <p style={{ fontSize: 13, color: "#A1A1AA", marginTop: 3 }}>Range</p>
                </div>
                <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.12)" }} />
                <div>
                  <p style={{ fontSize: 28, fontWeight: 700, color: "#FFFFFF", lineHeight: 1 }}>72%</p>
                  <p style={{ fontSize: 13, color: "#A1A1AA", marginTop: 3 }}>Hydrogen</p>
                </div>
              </div>
              {/* Status icons row */}
              <div className="flex items-center gap-5">
                <SignalBarsIcon color="#A1A1AA" />
                <Lock size={17} color="#A1A1AA" strokeWidth={1.6} />
                <FanIcon color="#A1A1AA" />
              </div>
            </div>

            {/* Right: vehicle image */}
            <div style={{ width: "52%", flexShrink: 0, display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
              <img
                src={vehicleImage}
                alt={name}
                style={{
                  width: "100%",
                  maxHeight: 145,
                  objectFit: "contain",
                  filter: "drop-shadow(-6px 4px 18px rgba(0,0,0,0.85))",
                  display: "block",
                }}
              />
            </div>
          </div>
        </div>

        {/* Scroll content */}
        <div style={{ padding: "0 12px", paddingBottom: 90 }}>

          {/* ── MAP CARD ── */}
          <div style={{
            background: "#17181C",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 24,
            overflow: "hidden",
            marginBottom: 10,
          }}>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-start gap-2">
                <MapPin size={15} color="#A1A1AA" style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#FFFFFF" }}>{locationLabel}</p>
                  <p style={{ fontSize: 11, color: "#71717A", marginTop: 1 }}>{locationSub}</p>
                  <p style={{ fontSize: 11, color: "#71717A" }}>Updated {gps.label}</p>
                </div>
              </div>
              <button style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "#24252A",
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Navigation size={15} color="#FFFFFF" style={{ transform: "rotate(45deg)" }} />
              </button>
            </div>
            <div style={{ height: 190 }}>
              {booking ? (
                <FindMyVehicleMap booking={booking} vehicleColor={vehicle?.color} />
              ) : (
                <div style={{ height: "100%", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <p style={{ color: "#71717A", fontSize: 12 }}>GPS location available during active rental</p>
                </div>
              )}
            </div>
          </div>

          {/* ── RENTAL INFO CARD ── */}
          <div style={{
            background: "#17181C",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 24,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 0,
            marginBottom: 10,
          }}>
            {/* Rental ends */}
            <div style={{ flex: 1 }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={13} color="#71717A" />
                <p style={{ fontSize: 11, color: "#71717A" }}>Rental ends</p>
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>
                {booking?.end_date ? format(new Date(`${booking.end_date}T23:59:59`), "MMM d, yyyy") : "N/A"}
              </p>
              <p style={{ fontSize: 12, color: "#A1A1AA" }}>
                {booking?.end_date ? format(new Date(`${booking.end_date}T23:59:59`), "h:mm a") : ""}
              </p>
            </div>

            <div style={{ width: 1, height: 44, background: "rgba(255,255,255,0.08)", margin: "0 12px" }} />

            {/* Remaining */}
            <div style={{ flex: 1 }}>
              <div className="flex items-center gap-1.5 mb-1">
                <svg width="13" height="13" viewBox="0 0 13 13">
                  <circle cx="6.5" cy="6.5" r="5.5" fill="none" stroke="#71717A" strokeWidth="1.2" />
                  <circle cx="6.5" cy="6.5" r="5.5" fill="none" stroke="#2F80FF" strokeWidth="1.2"
                    strokeDasharray="34.5" strokeDashoffset="8.6" strokeLinecap="round"
                    transform="rotate(-90 6.5 6.5)" />
                </svg>
                <p style={{ fontSize: 11, color: "#71717A" }}>Remaining</p>
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>{remainingStr}</p>
              <p style={{ fontSize: 12, color: "#A1A1AA" }}>remaining</p>
            </div>

            <div style={{ width: 1, height: 44, background: "rgba(255,255,255,0.08)", margin: "0 12px" }} />

            {/* Hydrogen */}
            <div style={{ flex: 0.8 }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Fuel size={13} color="#71717A" />
                <p style={{ fontSize: 11, color: "#71717A" }}>Hydrogen</p>
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>72%</p>
            </div>

            <ChevronRight size={16} color="#71717A" style={{ marginLeft: 4 }} />
          </div>

          {/* ── REMOTE CONTROLS ── */}
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#71717A", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Remote Controls
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>

              {/* Lock */}
              <button
                onClick={() => booking && handleCommand("lock")}
                disabled={!isBookingActive || !!commandLoading || !pickupInspectionComplete || dropoffInspectionComplete}
                style={{
                  aspectRatio: "1",
                  background: "#17181C",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 20,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                  cursor: isBookingActive && pickupInspectionComplete ? "pointer" : "default",
                  opacity: !isBookingActive || !pickupInspectionComplete || dropoffInspectionComplete ? 0.45 : 1,
                  transition: "transform 0.1s",
                }}
              >
                <Lock size={26} color="#FFFFFF" strokeWidth={1.5} />
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF", lineHeight: 1.2 }}>Lock</p>
                  <p style={{ fontSize: 10, color: "#71717A", lineHeight: 1.2 }}>Doors</p>
                </div>
              </button>

              {/* Unlock */}
              <button
                onClick={() => booking && handleCommand("unlock")}
                disabled={!isBookingActive || !!commandLoading || !pickupInspectionComplete || dropoffInspectionComplete}
                style={{
                  aspectRatio: "1",
                  background: "#17181C",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 20,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                  cursor: isBookingActive && pickupInspectionComplete ? "pointer" : "default",
                  opacity: !isBookingActive || !pickupInspectionComplete || dropoffInspectionComplete ? 0.45 : 1,
                  transition: "transform 0.1s",
                }}
              >
                <Unlock size={26} color="#FFFFFF" strokeWidth={1.5} />
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF", lineHeight: 1.2 }}>Unlock</p>
                  <p style={{ fontSize: 10, color: "#71717A", lineHeight: 1.2 }}>Doors</p>
                </div>
              </button>

              {/* Climate */}
              <button
                disabled
                style={{
                  aspectRatio: "1",
                  background: "#17181C",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 20,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: 0.45,
                  cursor: "default",
                }}
              >
                <Wind size={26} color="#FFFFFF" strokeWidth={1.5} />
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#A1A1AA", lineHeight: 1.2 }}>Climate</p>
                  <p style={{ fontSize: 10, color: "#71717A", lineHeight: 1.2 }}>Off</p>
                </div>
              </button>

              {/* Find Vehicle */}
              <button
                onClick={() => booking && handleCommand("find")}
                disabled={!isBookingActive || !!commandLoading || dropoffInspectionComplete}
                style={{
                  aspectRatio: "1",
                  background: "#17181C",
                  border: "2px solid #2F80FF",
                  borderRadius: 20,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: isBookingActive && !dropoffInspectionComplete
                    ? "0 0 0 1px rgba(47,128,255,0.15), 0 0 18px rgba(47,128,255,0.3)"
                    : "none",
                  opacity: !isBookingActive || dropoffInspectionComplete ? 0.45 : 1,
                  cursor: isBookingActive && !dropoffInspectionComplete ? "pointer" : "default",
                  transition: "transform 0.1s",
                }}
              >
                <HornIcon color="#2F80FF" />
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.2 }}>Find Vehicle</p>
                  <p style={{ fontSize: 10, color: "#71717A", lineHeight: 1.2 }}>Flash & Honk</p>
                </div>
              </button>
            </div>
            <p style={{ fontSize: 11, color: "#71717A", textAlign: "center", marginTop: 8 }}>
              Lock and unlock available after pickup
            </p>
          </div>

          {/* ── END YOUR RENTAL ── */}
          {!dropoffInspectionComplete && isBookingActive && (
            <button
              onClick={() => setInspectionTarget({ booking, type: "dropoff" })}
              style={{
                width: "100%",
                background: "rgba(255,69,58,0.08)",
                border: "1px solid rgba(255,69,58,0.4)",
                borderRadius: 22,
                padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 12,
                marginBottom: 10,
                cursor: "pointer",
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 12,
                background: "rgba(255,69,58,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Shield size={18} color="#FF453A" />
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>End Your Rental</p>
                <p style={{ fontSize: 11, color: "#A1A1AA", marginTop: 2 }}>Complete return inspection to stop billing immediately</p>
              </div>
              <ChevronRight size={16} color="#71717A" />
            </button>
          )}

          {/* ── VEHICLE HEALTH ── */}
          <div style={{ marginBottom: 10 }}>
            <div className="flex items-center justify-between mb-2">
              <p style={{ fontSize: 11, fontWeight: 700, color: "#71717A", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Vehicle Health
              </p>
              <div className="flex items-center gap-1">
                <CheckCircle size={13} color="#30D158" />
                <p style={{ fontSize: 11, color: "#30D158" }}>All systems normal</p>
              </div>
            </div>
            <div style={{
              background: "#17181C",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 22,
              padding: "12px 8px",
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 4,
            }}>
              {[
                { label: "Vehicle", sub: "Online" },
                { label: "Doors", sub: "Closed" },
                { label: "Hydrogen", sub: "Good" },
                { label: "Location", sub: "GPS Signal" },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <CheckCircle size={18} color="#30D158" />
                  <p style={{ fontSize: 10, color: "#A1A1AA", textAlign: "center", lineHeight: 1.2 }}>{item.label}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#FFFFFF", textAlign: "center", lineHeight: 1.2 }}>{item.sub}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── BOTTOM NAVIGATION ── */}
        <div style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 430,
          background: "#17181C",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "10px 0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          zIndex: 50,
        }}>
          {[
            { icon: <Car size={22} />, label: "My Vehicle", path: "/my-vehicle", active: true },
            { icon: <Calendar size={22} />, label: "Book Now", path: "/book-now", active: false },
            { icon: <Mail size={22} />, label: "Messages", path: "/messages", active: false },
            { icon: <Bell size={22} />, label: "Alerts", path: "/notifications", active: false, badge: 6 },
            { icon: <User size={22} />, label: "Account", path: "/account", active: false },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => window.location.href = item.path}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative", background: "none", border: "none", cursor: "pointer" }}
            >
              <span style={{ color: item.active ? "#FFFFFF" : "#71717A" }}>{item.icon}</span>
              <span style={{ fontSize: 10, fontWeight: item.active ? 600 : 400, color: item.active ? "#FFFFFF" : "#71717A" }}>
                {item.label}
              </span>
              {item.badge && (
                <span style={{
                  position: "absolute", top: -4, right: -6,
                  background: "#FF453A", borderRadius: "50%",
                  width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 700, color: "#FFFFFF",
                }}>{item.badge}</span>
              )}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}