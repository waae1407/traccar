import React, { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { format, intervalToDuration } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Lock, Unlock, Wind, Camera, Clock, Fuel, CheckCircle, Navigation, ChevronRight, Car, Calendar, Mail, Bell, User, MessageSquare, MapPin, Shield, Sun, Moon, CloudRain, Snowflake, Cloud, CloudLightning, Activity, Power, Battery, Gauge, Signal, Zap, Flame, ZapOff, Settings2, X, AlertTriangle, Satellite, Banknote, Layers } from "lucide-react";
import FindMyVehicleMap from "@/components/customer/mybookings/FindMyVehicleMap";
import VehicleInspectionSheet from "@/components/customer/VehicleInspectionSheet";
import SOSButton from "@/components/customer/sos/SOSButton";
import RecklessDrivingCard from "@/components/gps/RecklessDrivingCard";
import { useVehicleSkin } from "@/hooks/useVehicleSkin";
import MyVehicleCompact from "@/components/customer/myvehicle/MyVehicleCompact";
import VehicleSkinPicker from "@/components/customer/myvehicle/VehicleSkinPicker";
import MyVehicleClassicStyles from "@/components/customer/myvehicle/MyVehicleClassicStyles";
import ClassicDiagnosticsSheet from "@/components/customer/myvehicle/ClassicDiagnosticsSheet";

const ACTIVE_RENTAL_STATUSES = ["active", "approved", "confirmed", "checked_out", "return_required", "post_inspection_required", "overdue_return", "payment_due", "grace_period", "return_pending_host_review", "under_review"];
const PLACEHOLDER_CAR = "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&auto=format&fit=crop&q=80";

function getDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}


function isOperationalRental(booking) {
  if (!booking) return false;
  // ── RENTAL360: Use rental_lifecycle_phase as source of truth ──
  // My Vehicle must show booking if phase is: payment_complete, pickup_required, checked_out,
  // active, return_required, return_in_progress, host_review
  const ACTIVE_PHASES = ['payment_complete', 'pickup_required', 'checked_out', 'active', 'return_required', 'return_in_progress', 'host_review'];
  if (booking.rental_lifecycle_phase && ACTIVE_PHASES.includes(booking.rental_lifecycle_phase)) return true;
  // Fall back to booking_status for backward compatibility
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
  if (voltage < 11.8) {
    label = "Critical";
    color = "#FF453A";
  } else if (voltage <= 12.1) {
    label = "Low";
    color = "#FF9F0A";
  }
  
  if (device?.ignition_status === 'on' || voltage >= 13.0) {
    label = "Charging";
    color = "#30D158";
  }

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

function getWeatherStyle(weather) {
  const baseBg = "linear-gradient(180deg, #08090C 0%, #050506 100%)";
  if (!weather?.current_weather) {
    return {
      icon: <Cloud size={14} color="#A1A1AA" strokeWidth={2.5} />,
      label: "Weather",
      temp: "--°",
      ambientBg: baseBg,
      rayClass: "",
      rayStyle: { background: "radial-gradient(circle at 100% 0%, rgba(255,255,255,0.06), transparent 40%)" }
    };
  }
  
  const { temperature, weathercode, is_day } = weather.current_weather;
  const tempStr = `${Math.round(temperature)}°`;
  
  // Rain / Drizzle / Showers
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(weathercode)) {
    return {
      icon: <CloudRain size={14} color="#89B4F8" strokeWidth={2.5} />,
      label: "Rain",
      temp: tempStr,
      ambientBg: baseBg,
      rayClass: "rain-glow-active",
      rayStyle: { background: "radial-gradient(circle at 100% 0%, rgba(137,180,248,0.25) 0%, transparent 60%)" }
    };
  }
  // Snow
  if ([71,73,75,77,85,86].includes(weathercode)) {
    return {
      icon: <Snowflake size={14} color="#A7E4F2" strokeWidth={2.5} />,
      label: "Snow",
      temp: tempStr,
      ambientBg: baseBg,
      rayClass: "snow-glow-active",
      rayStyle: { background: "radial-gradient(circle at 100% 0%, rgba(167,228,242,0.25) 0%, transparent 60%)" }
    };
  }
  // Thunderstorm
  if ([95,96,99].includes(weathercode)) {
    return {
      icon: <CloudLightning size={14} color="#C4A7E7" strokeWidth={2.5} />,
      label: "Storm",
      temp: tempStr,
      ambientBg: baseBg,
      rayClass: "storm-glow-active",
      rayStyle: { background: "radial-gradient(circle at 100% 0%, rgba(196,167,231,0.25) 0%, transparent 60%)" }
    };
  }
  // Cloudy / Fog
  if ([2,3,45,48].includes(weathercode)) {
    return {
      icon: <Cloud size={14} color="#B5B9C2" strokeWidth={2.5} />,
      label: "Cloudy",
      temp: tempStr,
      ambientBg: baseBg,
      rayClass: "cloud-glow-active",
      rayStyle: { background: "radial-gradient(circle at 100% 0%, rgba(181,185,194,0.2) 0%, transparent 60%)" }
    };
  }
  // Clear / Mostly Clear
  if (is_day) {
    return {
      icon: <Sun size={14} color="#F8C455" strokeWidth={2.5} />,
      label: "Clear",
      temp: tempStr,
      ambientBg: baseBg,
      rayClass: "sun-rays-active",
      rayStyle: { 
        background: "repeating-conic-gradient(from 180deg at 100% 0%, rgba(248,196,85,0.12) 0deg, rgba(248,196,85,0.12) 8deg, transparent 8deg, transparent 18deg), radial-gradient(circle at 100% 0%, rgba(255,230,150,0.4) 0%, transparent 50%)" 
      }
    };
  } else {
    return {
      icon: <Moon size={14} color="#9EA5F1" strokeWidth={2.5} />,
      label: "Clear",
      temp: tempStr,
      ambientBg: baseBg,
      rayClass: "moon-beams-active",
      rayStyle: { 
        background: "repeating-conic-gradient(from 180deg at 100% 0%, rgba(158,165,241,0.06) 0deg, rgba(158,165,241,0.06) 12deg, transparent 12deg, transparent 25deg), radial-gradient(circle at 100% 0%, rgba(158,165,241,0.25) 0%, transparent 55%)" 
      }
    };
  }
}

// Signal bars SVG icon
function SignalBarsIcon({ strength = 100 }) {
  const bars = [
    { x: 0, y: 9, h: 5, threshold: 0 },
    { x: 4.5, y: 6.5, h: 7.5, threshold: 25 },
    { x: 9, y: 3.5, h: 10.5, threshold: 50 },
    { x: 13.5, y: 0, h: 14, threshold: 75 },
  ];
  const activeColor = strength > 25 ? "#30D158" : (strength > 0 ? "#FF9F0A" : "#FF453A");
  const inactiveColor = "rgba(255,255,255,0.15)";
  
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
      {bars.map((bar, i) => (
        <rect key={i} x={bar.x} y={bar.y} width="3" height={bar.h} rx="1" fill={strength >= bar.threshold ? activeColor : inactiveColor} style={{ filter: strength >= bar.threshold ? `drop-shadow(0 0 6px ${activeColor}60)` : 'none' }} />
      ))}
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

// No Smoking SVG
function NoSmokingIcon() {
  return (
    <div style={{ position: "relative", width: 14, height: 14, marginRight: 4 }}>
      {/* Cigarette base */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: "absolute", zIndex: 1 }}>
        <rect x="3" y="11" width="12" height="3" rx="1" fill="#A1A1AA" />
        <rect x="15" y="11" width="5" height="3" rx="1" fill="#D4A373" />
        <path d="M4 11 Q6 8 8 7" stroke="#A1A1AA" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
      {/* Red circle and slash */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: "absolute", zIndex: 2 }}>
        <circle cx="12" cy="12" r="10" stroke="#FF453A" strokeWidth="2.5" />
        <line x1="5" y1="5" x2="19" y2="19" stroke="#FF453A" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// Cigarette / Smoke SVG
function CigaretteIcon({ color = "#30D158", isAlert = false }) {
  return (
    <div style={{ position: "relative", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 2 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ position: "absolute", zIndex: 2 }}>
        {/* Cigarette Body */}
        <rect x="4" y="16" width="16" height="4" rx="1" fill="#E4E4E7" />
        {/* Filter */}
        <rect x="15" y="16" width="5" height="4" rx="1" fill="#D4A373" />
        {/* Ash/Ember tip */}
        <circle cx="4" cy="18" r="1.5" fill={isAlert ? "#FF453A" : color} style={{
           filter: isAlert ? "drop-shadow(0 0 4px #FF453A)" : `drop-shadow(0 0 2px ${color})`,
           animation: isAlert ? "cherryPulse 0.5s infinite alternate" : "cherryPulse 1.5s infinite alternate",
           transformOrigin: "4px 18px"
        }} />
      </svg>
      {/* Dynamic Smoke Lines */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ position: "absolute", zIndex: 1, top: -8, left: -6 }}>
        <path className="smoke-line-1" d="M8 15C5 11 11 7 7 2" stroke={isAlert ? "#FF453A" : color} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        <path className="smoke-line-2" d="M10 16C7 12 13 8 9 3" stroke={isAlert ? "#FF453A" : color} strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      </svg>
    </div>
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


function MyVehicleClassicScreen({ onOpenSkinPicker }) {
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const deepLinkedBookingId = searchParams.get("booking_id");
  const isAdminPreview = !!deepLinkedBookingId;
  const [inspectionTarget, setInspectionTarget] = useState(null);
  const [commandLoading, setCommandLoading] = useState(null);
  const [isLocked, setIsLocked] = useState(true); // Optimistic lock state
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showFooter, setShowFooter] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current + 5) {
        setShowFooter(false);
      } else if (currentScrollY < lastScrollY.current - 5) {
        setShowFooter(true);
      }
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const { data: bookings = [], isLoading: bookingsLoading, error: bookingsError } = useQuery({
    queryKey: ["my-vehicle-bookings", user?.email, deepLinkedBookingId],
    queryFn: async () => {
      if (deepLinkedBookingId) {
        const bookingRecord = await base44.entities.BookingRequest.get(deepLinkedBookingId);
        return [bookingRecord];
      }
      const results = await base44.entities.BookingRequest.filter({ user_email: user?.email });
      console.log('[MyVehicle] Bookings loaded:', results.length, results.map(b => ({ id: b.id, status: b.booking_status, vehicle: b.vehicle_name })));
      return results;
    },
    enabled: deepLinkedBookingId ? true : (!!user?.email && !authLoading),
    refetchInterval: 30_000,
  });

  const activeRentals = bookings.filter(isOperationalRental).sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
  const booking = deepLinkedBookingId ? bookings[0] : activeRentals[0];
  const isOverdueRental = isOverdue(booking);
  
  // Debug logging
  useEffect(() => {
    console.log('[MyVehicle] User:', user?.email, user?.id);
    console.log('[MyVehicle] Bookings:', bookings.length, 'Active rentals:', activeRentals.length);
    console.log('[MyVehicle] Current booking:', booking ? { id: booking.id, status: booking.booking_status, vehicle: booking.vehicle_name, end_date: booking.end_date } : 'NO BOOKING');
    console.log('[MyVehicle] Is demo mode:', !booking);
    if (bookingsError) console.error('[MyVehicle] Query error:', bookingsError);
  }, [bookings, booking, activeRentals.length, user?.email, bookingsError]);

  const { data: vehicleList = [], refetch: refetchVehicle } = useQuery({
    queryKey: ["my-vehicle-record", booking?.vehicle_id],
    queryFn: () => base44.entities.Vehicle.filter({ id: booking?.vehicle_id }),
    enabled: !!booking?.vehicle_id,
  });
  const vehicle = vehicleList[0];
  const heroReady = !!vehicle?.hero_image_url && vehicle?.hero_image_source_url === vehicle?.image_url;

  // If this vehicle's photo hasn't had its background removed yet (or the photo changed), do it once.
  useEffect(() => {
    if (!vehicle?.id || !vehicle?.image_url || heroReady) return;
    base44.functions.invoke("removeVehicleBackground", { vehicle_id: vehicle.id }).then(() => refetchVehicle());
  }, [vehicle?.id, vehicle?.image_url, heroReady]);

  const { data: devices = [] } = useQuery({
    queryKey: ["my-vehicle-device", booking?.vehicle_id],
    queryFn: () => base44.entities.TelematicsDevice.filter({ vehicle_id: booking?.vehicle_id }),
    enabled: !!booking?.vehicle_id,
    refetchInterval: 30_000,
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

  const { data: weather } = useQuery({
    queryKey: ["vehicle-weather", device?.last_latitude, device?.last_longitude],
    queryFn: async () => {
      if (!device?.last_latitude || !device?.last_longitude) return null;
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${device.last_latitude}&longitude=${device.last_longitude}&current_weather=true&temperature_unit=fahrenheit`);
      return res.json();
    },
    enabled: !!device?.last_latitude && !!device?.last_longitude,
    refetchInterval: 300000,
  });

  const remainingDays = booking?.end_date
    ? Math.max(0, Math.ceil((new Date(`${booking.end_date}T23:59:59`).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const remainingStr = remainingDays != null
    ? `${remainingDays}d`
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

    // Guard: device and vehicle must be loaded before sending any command
    if (!device?.id) {
      const { toast } = await import("sonner");
      console.error("[MyVehicle] Command blocked — device not loaded yet", { type, deviceId: device?.id, vehicleId: vehicle?.id });
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
  } else if (type === "climate") {
    toast.info("Climate control", { description: "Remote climate start is not available on this vehicle." });
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

  if (authLoading || bookingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#050506" }}>
        <div className="w-8 h-8 border-2 border-[#2F80FF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Demo mode: no active booking — show preview with placeholder data
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

  const vehicleImage = (heroReady ? vehicle.hero_image_url : vehicle?.image_url) || (isDemo ? PLACEHOLDER_CAR : "");
  const weatherStyle = getWeatherStyle(weather);

  let distanceStr = null;
  if (isDemo) {
    distanceStr = "0.3 mi away • 6 min walk";
  } else if (userLoc && device?.last_latitude) {
    const dist = getDistanceMiles(userLoc.lat, userLoc.lon, device.last_latitude, device.last_longitude);
    distanceStr = dist < 0.1 ? "Near you" : `${dist.toFixed(1)} mi away`;
    const walkMins = Math.round(dist * 20);
    if (walkMins > 0 && walkMins < 60 && dist < 3) distanceStr += ` • ${walkMins} min walk`;
  }

  let parkedStr = null;
  if (isDemo) {
    parkedStr = "Parked for 2 hrs";
  } else if (device?.speed === 0 || device?.ignition_status === 'off') {
    if (device?.parked_at) {
      const hours = Math.floor((Date.now() - new Date(device.parked_at).getTime()) / 3600000);
      const mins = Math.floor((Date.now() - new Date(device.parked_at).getTime()) / 60000);
      if (hours >= 24) {
        const days = Math.floor(hours/24);
        parkedStr = `Parked for ${days} day${days > 1 ? 's' : ''}`;
      }
      else if (hours > 0) parkedStr = `Parked for ${hours} hr${hours > 1 ? 's' : ''}`;
      else if (mins > 0) parkedStr = `Parked for ${mins} min${mins > 1 ? 's' : ''}`;
      else parkedStr = "Just parked";
    } else {
      parkedStr = "Parked";
    }
  }

  const activeAlarms = safetyEvents.map(event => ({
    id: event.id,
    label: event.alert_message || event.alert_title,
    icon: event.category === "safety" || event.category === "security" ? AlertTriangle : Activity,
    color: event.customer_severity === "critical" ? "#FF453A" : "#FF9F0A"
  }));
  const displayAddress = isDemo ? { poi: "Barton Creek Square", street: "2901 S Capital of Texas Hwy", city_state: "Austin, TX" } : addressData;

  let displayMiles = "268";
  let displayLabel = "Range";
  if (!isDemo) {
    const currentMiles = vehicle?.virtual_odometer || device?.device_mileage || 0;
    if (pickupSnapshot?.virtual_odometer_miles) {
      const driven = Math.max(0, Math.round(currentMiles - pickupSnapshot.virtual_odometer_miles));
      displayMiles = driven.toLocaleString();
      displayLabel = "Trip Miles";
    } else if (booking) {
      displayMiles = "0";
      displayLabel = "Trip Miles";
    } else {
      displayMiles = Math.round(currentMiles).toLocaleString();
      displayLabel = "Odometer";
    }
  }

  return (
    <div style={{ background: "#050506", minHeight: "100vh", color: "#F5F5F7", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif", letterSpacing: "-0.01em" }}>
      <MyVehicleClassicStyles />
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

        {/* ── CINEMATIC VEHICLE HERO ── */}
        <div style={{
          position: "relative",
          overflow: "hidden",
          background: weatherStyle.ambientBg,
          minHeight: "auto",
          paddingTop: 16,
          paddingBottom: 16,
          paddingLeft: 20,
          paddingRight: 16,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}>
          {/* Vehicle image — cinematic, de-emphasized studio background */}
          <div style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1,
          }}>
            {vehicleImage && (
              <div style={{
                position: "absolute",
                right: "-15%",
                top: "5%",
                width: "90%",
                height: "90%",
                overflow: "hidden" // Contains the glint within the image area
              }}>
                <img
                  src={vehicleImage}
                  alt={name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center",
                    display: "block",
                    opacity: 0.95,
                    filter: "brightness(0.9) contrast(1.15) saturate(1.05)",
                    transform: "scale(1.05)",
                  }}
                />
                <div className="vehicle-glint" />
              </div>
            )}
            <div style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, #050506 0%, #050506 10%, rgba(5,5,6,0.92) 25%, rgba(5,5,6,0.35) 55%, transparent 85%)",
              zIndex: 2,
            }} />
            <div style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, #050506 0%, transparent 15%, transparent 85%, #050506 100%)",
              zIndex: 3,
            }} />
            <div style={{
              position: "absolute",
              right: -40,
              top: 40,
              width: 210,
              height: 96,
              background: "radial-gradient(ellipse at center, rgba(47,128,255,0.18), transparent 70%)",
              filter: "blur(18px)",
              zIndex: 4,
            }} />
          </div>

          {/* Dynamic weather rays layer (OVER vehicle, UNDER text) */}
          <div className={weatherStyle.rayClass} style={{
            position: "absolute",
            top: 0, right: 0, bottom: 0, left: 0,
            pointerEvents: "none",
            zIndex: 1,
            mixBlendMode: "screen",
            WebkitMaskImage: "radial-gradient(circle at 100% 0%, black 10%, transparent 70%)",
            maskImage: "radial-gradient(circle at 100% 0%, black 10%, transparent 70%)",
            ...weatherStyle.rayStyle,
          }} />

          {/* Foreground text content */}
          <div style={{ position: "relative", zIndex: 2 }}>
          {/* Return Required Banner */}
          {isReturnRequired && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ background: "rgba(255,159,10,0.15)", border: "1px solid rgba(255,159,10,0.4)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, backdropFilter: "blur(10px)" }}>
                <Shield size={18} color="#FF9F0A" />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#FFF", margin: 0 }}>Return Inspection Required</p>
                  <p style={{ fontSize: 11, color: "#FF9F0A", margin: "2px 0 0" }}>Complete return inspection to close your rental</p>
                </div>
              </div>
            </div>
          )}

          {/* Overdue Warning Banner */}
          {isOverdueRental && !isReturnRequired && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ background: "rgba(255,69,58,0.15)", border: "1px solid rgba(255,69,58,0.4)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, backdropFilter: "blur(10px)" }}>
                <AlertTriangle size={18} color="#FF453A" />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#FFF", margin: 0 }}>Rental Overdue</p>
                  <p style={{ fontSize: 11, color: "#FF453A", margin: "2px 0 0" }}>Return vehicle immediately to stop billing</p>
                </div>
              </div>
            </div>
          )}

          {/* Active Alert Banners */}
          {activeAlarms.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {activeAlarms.map(alarm => (
                <div key={alarm.id} style={{ background: "rgba(255,69,58,0.15)", border: `1px solid ${alarm.color}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 8, backdropFilter: "blur(10px)" }}>
                  <alarm.icon size={18} color={alarm.color} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#FFF", margin: 0 }}>{alarm.label}</p>
                </div>
              ))}
            </div>
          )}

            {/* Top row: name + icons */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 26, fontWeight: 600, color: "#F5F5F7", lineHeight: 1.2, margin: 0, letterSpacing: "-0.4px", maxWidth: 280, textTransform: "capitalize" }}>{name.toLowerCase()}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                    <span style={{ color: "rgba(255,255,255,0.82)", fontSize: 13, fontWeight: 550, display: "flex", alignItems: "center", gap: 5 }}>
                      <Car size={13} color={isDemo || isBookingActive || (!pickupInspectionComplete && booking) ? "#30D158" : "#8E8E93"} strokeWidth={2.5} />
                      {isDemo ? "Active" : (!pickupInspectionComplete && booking ? "Ready for pickup" : (booking?.booking_status ? booking.booking_status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : "Inactive"))}
                    </span>
                    {(() => {
                      const isSmokingAllowed = vehicle?.smoking_allowed === true;
                      const isSmokeDetected = device?.smoke_detected;
                      let icon, label, statusText, statusColor, pulse;
                      
                      if (!isSmokingAllowed) {
                        if (!isSmokeDetected) {
                          icon = <NoSmokingIcon />;
                          label = "Smoke Sensor:";
                          statusText = "Clear";
                          statusColor = "#30D158";
                          pulse = true;
                        } else {
                          icon = <CigaretteIcon color="#FF453A" isAlert={true} />;
                          label = "Smoking:";
                          statusText = "Detected";
                          statusColor = "#FF453A";
                          pulse = false;
                        }
                      } else {
                        if (!isSmokeDetected) {
                          icon = <span style={{ fontSize: 14, filter: "grayscale(100%) opacity(0.6)", marginRight: 4 }}>🌬️</span>;
                          label = "Cabin Air:";
                          statusText = "Clear";
                          statusColor = "#30D158";
                          pulse = true;
                        } else {
                          icon = <span style={{ fontSize: 14, marginRight: 4 }}>⚠️</span>;
                          label = "Cabin:";
                          statusText = "Heavy Smoke";
                          statusColor = "#FF9F0A";
                          pulse = false;
                        }
                      }

                      return (
                        <span style={{ color: "rgba(255,255,255,0.82)", fontSize: 13, fontWeight: 550, display: "flex", alignItems: "center", gap: 0 }}>
                          {icon}
                          {label} <span className={pulse ? "text-monitor-pulse" : ""} style={{ color: statusColor, marginLeft: 4 }}>{statusText}</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={onOpenSkinPicker}
                  aria-label="Switch view"
                  className="control-tap"
                  style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <Layers size={16} color="#D4AF37" />
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 10px", height: 36, borderRadius: 18, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }}>
                  {weatherStyle.icon}
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#F5F5F7" }}>{weatherStyle.temp}</span>
                </div>
                <button
                  onClick={() => window.location.href = "/messages"}
                  style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <MessageSquare size={16} color="#A1A1AA" />
                </button>
                <button
                  onClick={() => window.location.href = "/account"}
                  style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #9B59B6, #E91E8C)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: 15, border: "none", cursor: "pointer" }}
                >
                  {user?.full_name?.charAt(0) || "R"}
                </button>
              </div>
            </div>

            {/* Stats — inline, large, bold */}
            <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 14, marginTop: 14 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 650, color: "#F5F5F7", lineHeight: 1.1, margin: 0, letterSpacing: "-0.1px", fontVariantNumeric: "tabular-nums" }}>{displayMiles} mi</p>
                <p style={{ fontSize: 11, color: "#9A9AA0", margin: "2px 0 0", fontWeight: 400 }}>{displayLabel}</p>
              </div>
            </div>

            {/* Removed redundant status icons to free up map space */}
          </div>
        </div>

        {/* Scroll content */}
        <div style={{ padding: "0 15px", paddingBottom: 80, marginTop: 4, position: "relative", zIndex: 5 }}>

          {/* ── MAP CARD — borderless, bleeds into canvas ── */}
          <div style={{
            background: "transparent",
            border: "none",
            borderRadius: 0,
            overflow: "hidden",
            marginBottom: 12,
          }}>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-start gap-3">
                <div style={{ marginTop: 2, flexShrink: 0, width: 28, height: 28, borderRadius: 14, background: "rgba(47,128,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <MapPin size={14} color="#2F80FF" />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 650, color: "#F5F5F7", letterSpacing: "-0.1px", lineHeight: 1.2 }}>
                    {displayAddress?.poi || displayAddress?.street || "Locating Vehicle..."}
                  </p>
                  <p style={{ fontSize: 12, color: "#A1A1AA", marginTop: 2, fontWeight: 400 }}>
                    {displayAddress?.poi ? displayAddress.street : displayAddress?.city_state}
                  </p>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {distanceStr && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#89B4F8", background: "rgba(137,180,248,0.15)", padding: "2px 6px", borderRadius: 6 }}>
                        {distanceStr}
                      </span>
                    )}
                    {parkedStr && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#A1A1AA", background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 6 }}>
                        {parkedStr}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ height: 240, position: "relative" }}>
              {booking ? (
                <>
                  <FindMyVehicleMap booking={booking} vehicleColor={vehicle?.color} />
                  {/* Subtle tint to harmonize tiles with the canvas */}
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 200, background: "rgba(5,5,6,0.25)" }} />
                  <button 
                    onClick={() => {
                      if (device?.last_latitude && device?.last_longitude) {
                        window.open(`https://www.google.com/maps/dir/?api=1&destination=${device.last_latitude},${device.last_longitude}`, "_blank");
                      }
                    }}
                    style={{
                      position: "absolute", bottom: 14, right: 14, zIndex: 400,
                      background: "rgba(47,128,255,0.85)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 20,
                      padding: "9px 18px", display: "flex", alignItems: "center", gap: 6,
                      color: "#FFF", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                      boxShadow: "0 4px 16px rgba(47,128,255,0.35), inset 0 1px 0 rgba(255,255,255,0.2)"
                    }}
                  >
                    <Navigation size={14} color="#FFFFFF" style={{ transform: "rotate(45deg)", marginBottom: 2 }} />
                    Directions
                  </button>
                </>
              ) : (
                <div style={{ height: "100%", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <p style={{ color: "#71717A", fontSize: 12 }}>GPS location available during active rental</p>
                </div>
              )}
            </div>
          </div>

          {/* ── RENTAL INFO CARD ── */}
          <div style={{
            background: "#1A1A1A",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 18,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 0,
            marginBottom: 16,
          }}>
            {/* Rental ends */}
            <div style={{ flex: 1 }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={13} color={isOverdueRental ? "#FF453A" : "#71717A"} />
                <p style={{ fontSize: 11, color: isOverdueRental ? "#FF453A" : "#8E8E93", fontWeight: 450 }}>
                  {isOverdueRental ? "Overdue since" : "Rental ends"}
                </p>
              </div>
              <p style={{ fontSize: 13, fontWeight: 650, color: isOverdueRental ? "#FF453A" : "#F5F5F7", letterSpacing: "-0.1px" }}>
                {booking?.end_date ? format(new Date(`${booking.end_date}T23:59:59`), "MMM d, yyyy") : "N/A"}
              </p>
              <p style={{ fontSize: 11, color: isOverdueRental ? "#FF453A" : "#8E8E93", fontWeight: 400 }}>
                {booking?.end_date ? format(new Date(`${booking.end_date}T23:59:59`), "h:mm a") : ""}
              </p>
            </div>

            <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.05)", margin: "0 8px" }} />

            {/* Remaining */}
            <div style={{ flex: 1 }}>
              <div className="flex items-center gap-1.5 mb-1">
                <svg width="13" height="13" viewBox="0 0 13 13">
                  <circle cx="6.5" cy="6.5" r="5.5" fill="none" stroke="#71717A" strokeWidth="1.2" />
                  <circle cx="6.5" cy="6.5" r="5.5" fill="none" stroke="#2F80FF" strokeWidth="1.2"
                    strokeDasharray="34.5" strokeDashoffset="8.6" strokeLinecap="round"
                    transform="rotate(-90 6.5 6.5)" />
                </svg>
                <p style={{ fontSize: 11, color: "#8E8E93", fontWeight: 450 }}>Remaining</p>
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#F5F5F7", letterSpacing: "-0.1px", fontVariantNumeric: "tabular-nums" }}>{remainingStr}</p>
              <p style={{ fontSize: 10, color: "#6B6B70", fontWeight: 400, marginTop: 1 }}>until return</p>
            </div>

            <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.05)", margin: "0 8px" }} />

            {/* Payment Status */}
            <div 
              onClick={() => {
                if (booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") {
                  window.location.href = `/account`;
                }
              }}
              style={{ 
                flex: 0.8, 
                cursor: (booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") ? "pointer" : "default",
                background: (booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") ? "rgba(255,69,58,0.15)" : "transparent",
                borderRadius: 12,
                padding: (booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") ? "8px 10px" : "0",
                margin: (booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") ? "-8px -10px" : "0",
                border: (booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") ? "1px solid rgba(255,69,58,0.4)" : "none",
                transition: "all 0.2s"
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Banknote size={14} color={(booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") ? "#FF453A" : "#71717A"} />
                <p style={{ fontSize: 11, color: (booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") ? "#FF453A" : "#8E8E93", fontWeight: 450 }}>Payment</p>
              </div>
              <p style={{ fontSize: 13, fontWeight: 650, color: (booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") ? "#FF453A" : "#F5F5F7", letterSpacing: "-0.1px" }}>
                {(booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") ? "Action Needed" : (booking?.payment_status === "paid" || booking?.payment_status === "pending" || !booking ? "Paid" : "Due Soon")}
              </p>
              <p style={{ fontSize: 11, color: (booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") ? "#FF453A" : "#30D158", fontWeight: 500 }}>
                {(booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") ? "Update Card" : (booking?.next_billing_date ? `Next: ${format(new Date(`${booking.next_billing_date}T12:00:00`), "MMM d")}` : "Up to date")}
              </p>
            </div>

            <button 
              onClick={() => window.location.href = '/my-bookings'}
              style={{ background: 'transparent', border: 'none', padding: '12px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ChevronRight size={18} color="#71717A" />
            </button>
          </div>

          {/* ── REMOTE CONTROLS ── */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 650, color: "#8E8E93", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12 }}>
              Remote Controls
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>

              {/* Lock */}
              <button
                onClick={() => booking && handleCommand("lock")}
                disabled={!!commandLoading || dropoffInspectionComplete}
                className={`control-tap ${commandLoading === "lock" ? "btn-loading-spin" : ""}`}
                style={{
                  position: "relative",
                  aspectRatio: "1/1",
                  background: "#1A1A1A",
                  border: isLocked ? "1px solid rgba(48,209,88,0.15)" : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 18,
                  padding: 0,
                  cursor: "pointer",
                  opacity: dropoffInspectionComplete && commandLoading !== "lock" ? 0.45 : 1,
                  transition: "all 0.2s ease-in-out",
                }}
              >
                <div className="btn-loading-content">
                  <Lock size={24} color={isLocked ? "#30D158" : "#FFFFFF"} strokeWidth={2.2} style={{ filter: isLocked ? "drop-shadow(0 2px 10px rgba(48,209,88,0.2))" : "none" }} />
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#F5F5F7", lineHeight: 1.2 }}>Lock</p>
                    <p style={{ fontSize: 9, color: isLocked ? "#30D158" : "#7C7C80", lineHeight: 1.2, fontWeight: 500 }}>
                      {isLocked ? "Locked" : "Not Locked"}
                    </p>
                  </div>
                </div>
              </button>

              {/* Unlock */}
              <button
                onClick={() => booking && handleCommand("unlock")}
                disabled={!!commandLoading || dropoffInspectionComplete}
                className={`control-tap ${commandLoading === "unlock" ? "btn-loading-spin" : ""}`}
                style={{
                  position: "relative",
                  aspectRatio: "1/1",
                  background: "#1A1A1A",
                  border: !isLocked ? "1px solid rgba(48,209,88,0.15)" : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 18,
                  padding: 0,
                  cursor: "pointer",
                  opacity: dropoffInspectionComplete && commandLoading !== "unlock" ? 0.45 : 1,
                  transition: "all 0.2s ease-in-out",
                }}
              >
                <div className="btn-loading-content">
                  <Unlock size={24} color={!isLocked ? "#30D158" : "#FFFFFF"} strokeWidth={2.2} style={{ filter: !isLocked ? "drop-shadow(0 2px 10px rgba(48,209,88,0.2))" : "none" }} />
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#F5F5F7", lineHeight: 1.2 }}>Unlock</p>
                    <p style={{ fontSize: 9, color: !isLocked ? "#30D158" : "#7C7C80", lineHeight: 1.2, fontWeight: 500 }}>
                      {!isLocked ? "Unlocked" : "Doors"}
                    </p>
                  </div>
                </div>
              </button>

              {/* Climate */}
              <button
                onClick={() => booking && handleCommand("climate")}
                disabled={!!commandLoading || dropoffInspectionComplete}
                className={`control-tap ${commandLoading === "climate" ? "btn-loading-spin" : ""}`}
                style={{
                  position: "relative",
                  aspectRatio: "1/1",
                  background: "#1A1A1A",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 18,
                  padding: 0,
                  cursor: "pointer",
                  opacity: dropoffInspectionComplete && commandLoading !== "climate" ? 0.45 : 1,
                  transition: "all 0.2s ease-in-out",
                }}
              >
                <div className="btn-loading-content">
                  <FanIcon color="#FFFFFF" />
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#F5F5F7", lineHeight: 1.2 }}>Climate</p>
                    <p style={{ fontSize: 9, color: "#7C7C80", lineHeight: 1.2, fontWeight: 500 }}>AC / Heat</p>
                  </div>
                </div>
              </button>

              {/* Find Vehicle — highlighted with blue border */}
              <button
                onClick={() => booking && handleCommand("find")}
                disabled={!!commandLoading || dropoffInspectionComplete}
                className={`control-tap ${commandLoading === "find" ? "btn-loading-spin" : ""}`}
                style={{
                  position: "relative",
                  aspectRatio: "1/1",
                  background: "rgba(47,128,255,0.08)",
                  border: "1px solid rgba(59,130,246,0.4)",
                  borderRadius: 18,
                  padding: 0,
                  boxShadow: "0 0 12px rgba(59,130,246,0.1)",
                  opacity: dropoffInspectionComplete && commandLoading !== "find" ? 0.45 : 1,
                  cursor: !dropoffInspectionComplete ? "pointer" : "default",
                  transition: "all 0.2s ease-in-out",
                }}
              >
                <div className="btn-loading-content">
                  <HornIcon color="#3B82F6" />
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#F5F5F7", lineHeight: 1.2 }}>Find Vehicle</p>
                    <p style={{ fontSize: 9, color: "#60A5FA", lineHeight: 1.2, fontWeight: 500 }}>Flash &amp; Honk</p>
                  </div>
                </div>
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: "#A1A1AA", textAlign: "center", marginTop: 10, fontWeight: 450 }}>
              Lock and unlock available after pickup
            </p>
          </div>

          {/* ── RECKLESS DRIVING MONITOR ── */}
          {booking && device && (
            <div style={{ marginBottom: 16 }}>
              <RecklessDrivingCard device={device} />
            </div>
          )}

          {/* ── END YOUR RENTAL ── */}
          {!dropoffInspectionComplete && isBookingActive && (
            <button
              onClick={() => setInspectionTarget({ booking, type: "dropoff" })}
              style={{
                width: "100%",
                background: "#7F1D1D",
                border: "1px solid rgba(248,113,113,0.25)",
                borderRadius: 18,
                padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 12,
                marginBottom: 10,
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(127,29,29,0.3)",
                transition: "all 0.2s",
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 12,
                background: "rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Shield size={18} color="#F87171" />
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
            <div className="flex items-center justify-between mb-3">
              <p style={{ fontSize: 11, fontWeight: 700, color: "#71717A", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Vehicle Health
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#30D158", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <CheckCircle size={10} color="#0a0a0a" strokeWidth={3} />
                </div>
                <span style={{ fontSize: 12, color: "#30D158", fontWeight: 500 }}>All systems normal</span>
              </div>
            </div>
            <div style={{
              background: "#1A1A1A",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 18,
              padding: "16px 12px",
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 8,
            }}>
              {[
                { label: "Vehicle", sub: device?.online_status === "offline" ? "Offline" : "Online", ok: device?.online_status !== "offline" },
                { label: "Doors", sub: device?.door_open ? "Open" : "Closed", ok: !device?.door_open },
                { label: "Battery", sub: battInfo.label, ok: battInfo.label !== "Critical" },
                { label: "Location", sub: gps.status === "online" ? "GPS Signal" : "No GPS", ok: gps.status === "online" },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: item.ok ? "rgba(48,209,88,0.15)" : "rgba(255,69,58,0.15)",
                    border: item.ok ? "1px solid rgba(48,209,88,0.3)" : "1px solid rgba(255,69,58,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <CheckCircle size={16} color={item.ok ? "#30D158" : "#FF453A"} strokeWidth={2.5} />
                  </div>
                  <p style={{ fontSize: 10, color: "#A1A1AA", textAlign: "center", lineHeight: 1.2 }}>{item.label}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#FFFFFF", textAlign: "center", lineHeight: 1.2 }}>{item.sub}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowDiagnostics(true)}
              style={{
                width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16, padding: "12px", display: "flex", alignItems: "center", justifyContent: "center",
                gap: 8, marginTop: 12, cursor: "pointer", transition: "all 0.2s"
              }}
            >
              <Settings2 size={16} color="#A1A1AA" />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#E4E4E7" }}>View Full Diagnostics</span>
            </button>
          </div>

        </div>

        {/* Full Diagnostics Bottom Sheet */}
        {showDiagnostics && <ClassicDiagnosticsSheet device={device} onClose={() => setShowDiagnostics(false)} />}

        {/* ── SOS FLOATING BUTTON ── */}
        <SOSButton booking={booking} device={device} />

        {/* ── BOTTOM NAVIGATION ── */}
        <div style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: showFooter ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(100%)",
          transition: "transform 0.3s ease-in-out",
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

export default function MyVehicle() {
  const { skin, setSkin, skinConfig } = useVehicleSkin();
  const [showSkinPicker, setShowSkinPicker] = useState(false);
  const openPicker = () => setShowSkinPicker(true);

  if (skinConfig.overlay === "compact") {
    return (
      <>
        <MyVehicleCompact skinConfig={skinConfig} onOpenSkinPicker={openPicker} />
        {showSkinPicker && (
          <VehicleSkinPicker
            currentSkin={skin}
            onSelect={(id) => { setSkin(id); setShowSkinPicker(false); }}
            onClose={() => setShowSkinPicker(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <MyVehicleClassicScreen onOpenSkinPicker={openPicker} />
      {showSkinPicker && (
        <VehicleSkinPicker
          currentSkin={skin}
          onSelect={(id) => { setSkin(id); setShowSkinPicker(false); }}
          onClose={() => setShowSkinPicker(false)}
        />
      )}
    </>
  );
}