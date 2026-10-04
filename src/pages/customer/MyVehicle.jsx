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
import { useVehicleSkin } from "@/hooks/useVehicleSkin";
import MyVehicleCompact from "@/components/customer/myvehicle/MyVehicleCompact";
import VehicleSkinPicker from "@/components/customer/myvehicle/VehicleSkinPicker";
import MyVehicleClassicStyles from "@/components/customer/myvehicle/MyVehicleClassicStyles";
import ClassicDiagnosticsSheet from "@/components/customer/myvehicle/ClassicDiagnosticsSheet";
import MyVehicleActionDock from "@/components/customer/myvehicle/MyVehicleActionDock";
import SecurityTicketCarousel from "@/components/customer/myvehicle/SecurityTicketCarousel";

const ACTIVE_RENTAL_STATUSES = ["active", "approved", "confirmed", "checked_out", "return_required", "post_inspection_required", "overdue_return", "payment_due", "grace_period", "return_pending_host_review", "under_review"];
const PLACEHOLDER_CAR = "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&auto=format&fit=crop&q=80";
const LABEL_FONT = "'Barlow Condensed', sans-serif";

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
  let color = "#22C55E";
  if (voltage < 11.8) {
    label = "Critical";
    color = "#FF453A";
  } else if (voltage <= 12.1) {
    label = "Low";
    color = "#FF9F0A";
  }
  
  if (device?.ignition_status === 'on' || voltage >= 13.0) {
    label = "Charging";
    color = "#22C55E";
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

// Weather chip — monochrome icon + temperature (no colored ambient effects)
function getWeatherStyle(weather) {
  const iconProps = { size: 14, color: "#E4E4E7", strokeWidth: 2.5 };
  if (!weather?.current_weather) return { icon: <Cloud {...iconProps} color="#A1A1AA" />, temp: "--°" };
  const { temperature, weathercode, is_day } = weather.current_weather;
  let Icon = is_day ? Sun : Moon;
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(weathercode)) Icon = CloudRain;
  else if ([71,73,75,77,85,86].includes(weathercode)) Icon = Snowflake;
  else if ([95,96,99].includes(weathercode)) Icon = CloudLightning;
  else if ([2,3,45,48].includes(weathercode)) Icon = Cloud;
  return { icon: <Icon {...iconProps} />, temp: `${Math.round(temperature)}°` };
}

// Signal bars SVG icon
function SignalBarsIcon({ strength = 100 }) {
  const bars = [
    { x: 0, y: 9, h: 5, threshold: 0 },
    { x: 4.5, y: 6.5, h: 7.5, threshold: 25 },
    { x: 9, y: 3.5, h: 10.5, threshold: 50 },
    { x: 13.5, y: 0, h: 14, threshold: 75 },
  ];
  const activeColor = strength > 25 ? "#22C55E" : (strength > 0 ? "#FF9F0A" : "#FF453A");
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
function CigaretteIcon({ color = "#22C55E", isAlert = false }) {
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
  const [showFooter, setShowFooter] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const viewport = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;
      const distanceFromBottom = docHeight - (scrollY + viewport);
      // Only reveal the nav once the user has actually scrolled down and reached the bottom
      setShowFooter(scrollY > 120 && distanceFromBottom < 80);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
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
  const battInfo = isDemo ? { pct: 100, label: "Good", color: "#22C55E", voltage: "12.8" } : getBatteryInfo(device);
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
      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: "transparent", position: "relative" }}>

        {/* ── FULL-SCREEN MAP BACKGROUND (fixed, fills entire viewport) ── */}
        <div style={{
          position: "fixed",
          top: 0, left: "50%",
          transform: "translateX(-50%)",
          width: "100%", maxWidth: 430,
          height: "100vh",
          zIndex: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}>
          {booking ? (
            <FindMyVehicleMap booking={booking} vehicleColor={vehicle?.color} />
          ) : (
            <div style={{ height: "100%", background: "#0a0a0a" }} />
          )}
          {/* Vehicle render floating right */}
          {vehicleImage && (
            <div style={{
              position: "absolute",
              right: "-4%", top: "6%",
              width: "52%", height: "28%",
              overflow: "hidden",
              pointerEvents: "none",
              zIndex: 2,
            }}>
              <img
                src={vehicleImage}
                alt={name}
                style={{
                  width: "100%", height: "100%",
                  objectFit: "contain", objectPosition: "center",
                  display: "block",
                  filter: "brightness(1.1) contrast(1.15) saturate(1.05)",
                }}
              />
              <div className="vehicle-glint" />
            </div>
          )}
          {/* Top gradient scrim — text legibility */}
          <div style={{
            position: "absolute",
            top: 0, left: 0, right: 0, height: "35%",
            background: "linear-gradient(180deg, rgba(5,5,6,0.88) 0%, rgba(5,5,6,0.4) 50%, transparent 100%)",
            zIndex: 3, pointerEvents: "none",
          }} />
          {/* Bottom gradient scrim — content readability at bottom */}
          <div style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0, height: "30%",
            background: "linear-gradient(0deg, rgba(5,5,6,0.88) 0%, rgba(5,5,6,0.3) 60%, transparent 100%)",
            zIndex: 3, pointerEvents: "none",
          }} />
          {/* Blue accent glow */}
          <div style={{
            position: "absolute",
            right: -40, top: 40,
            width: 210, height: 96,
            background: "radial-gradient(ellipse at center, rgba(47,128,255,0.12), transparent 70%)",
            filter: "blur(18px)",
            zIndex: 3, pointerEvents: "none",
          }} />
        </div>

        {/* ── VEHICLE INFO OVERLAY (transparent, floats over full-screen map) ── */}
        <div style={{
          position: "relative",
          paddingTop: 16,
          paddingLeft: 20,
          paddingRight: 16,
          zIndex: 4,
        }}>
          {/* Foreground content */}
          <div style={{ position: "relative", zIndex: 4 }}>
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
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 0, textShadow: "0 1px 10px rgba(0,0,0,0.85)" }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: "#F5F5F7", lineHeight: 1.15, margin: 0, letterSpacing: "-0.4px", textTransform: "capitalize" }}>{name.toLowerCase()}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                    <span style={{ color: "rgba(255,255,255,0.82)", fontSize: 13, fontWeight: 550, display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 6px rgba(34,197,94,0.6)", flexShrink: 0 }} />
                      {isDemo ? "Online" : (device?.online_status === "offline" ? "Offline" : "Online")}
                    </span>
                    <span style={{ color: "#9CA3AF", fontSize: 13, fontWeight: 550, display: "flex", alignItems: "center", gap: 5 }}>
                      {gps.status === "online" ? "Live" : "No GPS"}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={onOpenSkinPicker}
                  aria-label="Switch view"
                  className="control-tap"
                  style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <Layers size={15} color="#E4E4E7" />
                </button>
                <button
                  onClick={() => window.location.href = "/messages"}
                  aria-label="Messages"
                  style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <MessageSquare size={15} color="#A1A1AA" />
                </button>
                <button
                  onClick={() => window.location.href = "/account"}
                  aria-label="Account"
                  style={{ width: 32, height: 32, borderRadius: "50%", background: "#D946EF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: 14, border: "none", cursor: "pointer" }}
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
              <div>
                <p style={{ fontSize: 13, fontWeight: 650, color: "#F5F5F7", lineHeight: 1.1, margin: 0, letterSpacing: "-0.1px", fontVariantNumeric: "tabular-nums" }}>{isDemo ? 72 : battInfo.pct}%</p>
                <p style={{ fontSize: 11, color: "#9A9AA0", margin: "2px 0 0", fontWeight: 400 }}>Battery</p>
              </div>
            </div>

            {/* Removed redundant status icons to free up map space */}
          </div>

          {/* Location bar — in content flow, floats over map */}
          <div style={{ marginTop: 10 }}>
            <div className="flex items-start gap-3">
              <div style={{ marginTop: 2, flexShrink: 0, width: 28, height: 28, borderRadius: 14, background: "rgba(47,128,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MapPin size={14} color="#2F80FF" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 650, color: "#F5F5F7", letterSpacing: "-0.1px", lineHeight: 1.2, textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>
                  {displayAddress?.poi || displayAddress?.street || "Locating Vehicle..."}
                </p>
                <p style={{ fontSize: 12, color: "#A1A1AA", marginTop: 2, fontWeight: 400, textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>
                  {displayAddress?.poi ? displayAddress.street : displayAddress?.city_state}
                </p>
                <p style={{ fontSize: 11, color: "#71717A", marginTop: 4, fontWeight: 400 }}>
                  Updated {gps.label === "Live" ? "just now" : gps.label.toLowerCase()}
                </p>
              </div>
              <button
                onClick={() => {
                  if (device?.last_latitude && device?.last_longitude) {
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${device.last_latitude},${device.last_longitude}`, "_blank");
                  }
                }}
                aria-label="Directions"
                style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", flexShrink: 0,
                  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <Navigation size={18} color="#FFFFFF" style={{ transform: "rotate(45deg)" }} />
              </button>
            </div>
          </div>
        </div>

        {/* Scroll content — pushed down so map stays fully visible on initial load */}
        <div style={{ padding: "0 15px", paddingBottom: 150, paddingTop: "calc(100vh - 230px)", position: "relative", zIndex: 5 }}>

          {/* ── RENTAL INFO CARD ── */}
          <div style={{
            background: "rgba(26,26,26,0.72)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.08)",
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
              <p style={{ fontSize: 11, color: (booking?.payment_status === "failed" || booking?.payment_status === "overdue" || booking?.booking_status === "payment_due") ? "#FF453A" : "#22C55E", fontWeight: 500 }}>
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

          {/* remote controls moved above rental info */}

          {/* ── SECURITY MONITOR (horizontal live ticket carousel) ── */}
          <SecurityTicketCarousel device={device} />

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
                <Shield size={18} color="#FCA5A5" />
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <p style={{ fontSize: 17, fontWeight: 800, color: "#FFFFFF", fontFamily: LABEL_FONT, letterSpacing: "0.03em", textTransform: "uppercase", lineHeight: 1.1 }}>End Your Rental</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.78)", marginTop: 3 }}>Complete return inspection to stop billing immediately</p>
              </div>
              <ChevronRight size={16} color="rgba(255,255,255,0.75)" />
            </button>
          )}

        </div>

        {/* Full Diagnostics Bottom Sheet */}
        {showDiagnostics && <ClassicDiagnosticsSheet device={device} onClose={() => setShowDiagnostics(false)} />}

        {/* ── FIXED ACTION DOCK + FLOATING SOS (thumb-reachable, scroll-aware) ── */}
        <MyVehicleActionDock
          booking={booking}
          device={device}
          isLocked={isLocked}
          commandLoading={commandLoading}
          dropoffInspectionComplete={dropoffInspectionComplete}
          onCommand={handleCommand}
          visible={true}
          navVisible={showFooter}
        />

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