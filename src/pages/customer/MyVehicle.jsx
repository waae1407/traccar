import React, { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, intervalToDuration } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Lock, Unlock, Wind, Camera, Clock, Fuel, CheckCircle, Navigation, ChevronRight, Car, Calendar, Mail, Bell, User, MessageSquare, MapPin, Shield, Sun, Moon, CloudRain, Snowflake, Cloud, CloudLightning, Activity, Power, Battery, Gauge, Signal, Zap, Flame, ZapOff, Settings2, X, AlertTriangle, Satellite, Banknote } from "lucide-react";
import FindMyVehicleMap from "@/components/customer/mybookings/FindMyVehicleMap";
import VehicleInspectionSheet from "@/components/customer/VehicleInspectionSheet";

const ACTIVE_RENTAL_STATUSES = ["active", "approved", "confirmed", "payment_due", "grace_period", "return_pending_host_review", "under_review"];
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
  if (!booking || booking.rental_ended_at) return false;
  if (!ACTIVE_RENTAL_STATUSES.includes(booking.booking_status)) return false;
  if (booking.end_date && Date.now() > new Date(`${booking.end_date}T23:59:59`).getTime()) return false;
  return true;
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

function DiagRow({ label, value, isAlert }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#A1A1AA" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: isAlert ? "#FF453A" : "#F5F5F7" }}>{value}</span>
    </div>
  );
}

export default function MyVehicle() {
  const { user, isLoading: authLoading } = useAuth();
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

  const remainingTime = booking?.end_date
    ? intervalToDuration({ start: new Date(), end: new Date(`${booking.end_date}T23:59:59`) })
    : null;
  const remainingStr = remainingTime
    ? `${remainingTime.days ? remainingTime.days + 'd ' : ''}${remainingTime.hours || 0}h ${remainingTime.minutes || 0}m`
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
    setIsLocked(type === "lock");
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
    ? ["active", "approved", "confirmed", "return_pending_host_review", "under_review"].includes(booking.booking_status) &&
      booking.payment_status === "paid" &&
      !booking.rental_ended_at
    : false;

  const vehicleImage = vehicle?.image_url || (isDemo ? PLACEHOLDER_CAR : "");
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
      if (hours > 24) parkedStr = `Parked for ${Math.floor(hours/24)} days`;
      else if (hours > 0) parkedStr = `Parked for ${hours} hr${hours > 1 ? 's' : ''}`;
      else if (mins > 0) parkedStr = `Parked for ${mins} min${mins > 1 ? 's' : ''}`;
      else parkedStr = "Just parked";
    } else {
      parkedStr = "Parked";
    }
  }

  const activeAlarms = [];
  const displayAddress = isDemo ? { poi: "Barton Creek Square", street: "2901 S Capital of Texas Hwy", city_state: "Austin, TX" } : addressData;
  if (device?.smoke_detected) activeAlarms.push({ id: 'smoke', label: 'Smoke Detected in Cabin', icon: Flame, color: '#FF453A' });
  if (device?.shock_alarm) activeAlarms.push({ id: 'shock', label: 'Impact / Shock Detected', icon: Activity, color: '#FF9F0A' });
  if (device?.power_cut_alarm) activeAlarms.push({ id: 'power_cut', label: 'Main Power Cut', icon: ZapOff, color: '#FF453A' });
  if (device?.low_battery_alarm) activeAlarms.push({ id: 'low_battery', label: 'Low Battery Warning', icon: Battery, color: '#FF9F0A' });
  if (device?.overspeed_alarm) activeAlarms.push({ id: 'overspeed', label: 'Overspeed Warning', icon: Gauge, color: '#FF9F0A' });
  if (device?.movement_alarm) activeAlarms.push({ id: 'movement', label: 'Unauthorized Movement', icon: AlertTriangle, color: '#FF453A' });
  if (device?.geofence_alarm) activeAlarms.push({ id: 'geofence', label: 'Geofence Breach', icon: MapPin, color: '#FF9F0A' });

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
      <style>{`
        @keyframes weatherPulse {
          0% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 28px rgba(0,0,0,0.28), 0 0 0px var(--weather-glow); }
          50% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 28px rgba(0,0,0,0.28), 0 0 16px var(--weather-glow); }
          100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 28px rgba(0,0,0,0.28), 0 0 0px var(--weather-glow); }
        }
        .weather-card-animated {
          animation: weatherPulse 4s ease-in-out infinite;
        }

        @keyframes borderSpin { 
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); } 
        }
        .btn-loading-spin {
          overflow: hidden;
          border-color: transparent !important;
          box-shadow: 0 0 15px rgba(255,255,255,0.1) !important;
        }
        .btn-loading-spin::before {
          content: '';
          position: absolute;
          top: 50%; left: 50%; 
          width: 250%; height: 250%;
          background: conic-gradient(from 0deg, transparent 75%, rgba(255,255,255,0.85) 100%);
          animation: borderSpin 1s linear infinite;
          z-index: 0;
        }
        .btn-loading-spin::after {
          content: '';
          position: absolute;
          inset: 1.5px;
          background: linear-gradient(180deg, #1B1C21 0%, #111216 100%);
          border-radius: 22.5px;
          z-index: 1;
        }
        .btn-loading-content {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          height: 100%;
        }
        @keyframes spinRays {
          0% { transform: scale(2.5) rotate(0deg); opacity: 0.8; }
          50% { transform: scale(2.5) rotate(180deg); opacity: 1; }
          100% { transform: scale(2.5) rotate(360deg); opacity: 0.8; }
        }
        .sun-rays-active {
          transform-origin: 100% 0%;
          animation: spinRays 120s linear infinite;
        }
        @keyframes pulseBeams {
          0% { transform: scale(2.5) rotate(0deg); opacity: 0.7; }
          50% { transform: scale(2.5) rotate(5deg); opacity: 1; }
          100% { transform: scale(2.5) rotate(0deg); opacity: 0.7; }
        }
        .moon-beams-active {
          transform-origin: 100% 0%;
          animation: pulseBeams 12s ease-in-out infinite;
        }
        @keyframes ambientGlow {
          0% { opacity: 0.7; transform: scale(1.5); }
          50% { opacity: 1; transform: scale(1.55); }
          100% { opacity: 0.7; transform: scale(1.5); }
        }
        .cloud-glow-active {
          transform-origin: 100% 0%;
          animation: ambientGlow 8s ease-in-out infinite;
        }
        
        @keyframes rainFall {
          0% { background-position: 0 0, 0px 0px, 0px 0px; }
          100% { background-position: 0 0, -20px 100px, -40px 200px; }
        }
        .rain-glow-active {
          background-image: radial-gradient(circle at 100% 0%, rgba(137,180,248,0.3) 0%, transparent 70%),
                            repeating-linear-gradient(20deg, transparent, transparent 15px, rgba(255,255,255,0.15) 15px, rgba(255,255,255,0.15) 16px),
                            repeating-linear-gradient(20deg, transparent, transparent 25px, rgba(255,255,255,0.08) 25px, rgba(255,255,255,0.08) 27px) !important;
          background-size: 100% 100%, 200% 200%, 200% 200%;
          animation: rainFall 1.2s linear infinite;
        }
        .storm-glow-active {
          background-image: radial-gradient(circle at 100% 0%, rgba(196,167,231,0.3) 0%, transparent 70%),
                            repeating-linear-gradient(25deg, transparent, transparent 10px, rgba(255,255,255,0.2) 10px, rgba(255,255,255,0.2) 11px),
                            repeating-linear-gradient(25deg, transparent, transparent 20px, rgba(255,255,255,0.1) 20px, rgba(255,255,255,0.1) 22px) !important;
          background-size: 100% 100%, 200% 200%, 200% 200%;
          animation: rainFall 0.8s linear infinite;
        }
        
        @keyframes snowFall {
          0% { background-position: 0 0, 0px 0px, 0px 0px; }
          100% { background-position: 0 0, -15px 50px, 20px 80px; }
        }
        .snow-glow-active {
          background-image: radial-gradient(circle at 100% 0%, rgba(167,228,242,0.3) 0%, transparent 70%),
                            radial-gradient(circle, rgba(255,255,255,0.6) 1.5px, transparent 1.5px),
                            radial-gradient(circle, rgba(255,255,255,0.3) 2.5px, transparent 2.5px) !important;
          background-size: 100% 100%, 30px 30px, 50px 50px;
          animation: snowFall 4s linear infinite;
        }
        @keyframes vehicleGlint {
          0%, 80% { transform: translateX(-150%) skewX(-20deg); opacity: 0; }
          85% { opacity: 0.15; }
          90% { transform: translateX(150%) skewX(-20deg); opacity: 0; }
          100% { transform: translateX(150%) skewX(-20deg); opacity: 0; }
        }
        .vehicle-glint {
          position: absolute;
          top: 0; bottom: 0; left: 0; right: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent);
          animation: vehicleGlint 10s ease-in-out infinite;
          pointer-events: none;
          z-index: 5;
          mix-blend-mode: overlay;
        }
      `}</style>
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
                    opacity: 0.75,
                    filter: "brightness(0.65) contrast(1.2) saturate(1.1)",
                    transform: "scale(1.05)",
                  }}
                />
                <div className="vehicle-glint" />
              </div>
            )}
            <div style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, #050506 0%, #050506 15%, rgba(5,5,6,0.98) 35%, rgba(5,5,6,0.5) 60%, transparent 100%)",
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
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 12px", marginTop: 8 }}>
                  <span style={{ color: "rgba(255,255,255,0.76)", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                    <Satellite size={13} color={isDemo || device?.online_status === "online" ? "#30D158" : "#8E8E93"} strokeWidth={2.5} />
                    {isDemo || device?.online_status === "online" ? "Connected" : "Disconnected"}
                  </span>

                  <span style={{ color: "rgba(255,255,255,0.76)", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                    {isLocked ? (
                      <Lock size={13} color="#30D158" strokeWidth={2.5} />
                    ) : (
                      <Unlock size={13} color="#FF453A" strokeWidth={2.5} />
                    )}
                    {isLocked ? "Locked" : "Unlocked"}
                  </span>

                  <span style={{ color: "rgba(255,255,255,0.76)", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                    <Car size={13} color={isDemo || isBookingActive || (!pickupInspectionComplete && booking) ? "#30D158" : "#8E8E93"} strokeWidth={2.5} />
                    {isDemo ? "Active" : (!pickupInspectionComplete && booking ? "Ready for pickup" : (booking?.booking_status ? booking.booking_status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : "Inactive"))}
                  </span>

                  <span style={{ color: "rgba(255,255,255,0.76)", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                    <Flame size={13} color={device?.smoke_detected ? "#FF453A" : "#30D158"} strokeWidth={2.5} />
                    Cabin: <span style={{ color: device?.smoke_detected ? "#FF453A" : "#30D158" }}>{device?.smoke_detected ? "Smoke Detected" : "Clear"}</span>
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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

          {/* ── MAP CARD ── */}
          <div style={{
            background: "linear-gradient(180deg, rgba(29,30,35,0.96), rgba(19,20,24,0.98))",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 28,
            overflow: "hidden",
            marginBottom: 12,
            boxShadow: "0 18px 50px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
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
            <div style={{ height: 200, position: "relative" }}>
              {booking ? (
                <>
                  <FindMyVehicleMap booking={booking} vehicleColor={vehicle?.color} />
                  <button 
                    onClick={() => {
                      if (device?.last_latitude && device?.last_longitude) {
                        window.open(`https://www.google.com/maps/dir/?api=1&destination=${device.last_latitude},${device.last_longitude}`, "_blank");
                      }
                    }}
                    style={{
                      position: "absolute", bottom: 12, right: 12, zIndex: 400,
                      background: "#2F80FF", border: "none", borderRadius: 20,
                      padding: "8px 16px", display: "flex", alignItems: "center", gap: 6,
                      color: "#FFF", fontSize: 12, fontWeight: 700, cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(47,128,255,0.4)"
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
            background: "linear-gradient(180deg, rgba(29,30,35,0.96), rgba(19,20,24,0.98))",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 28,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 0,
            marginBottom: 16,
            boxShadow: "0 14px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)",
          }}>
            {/* Rental ends */}
            <div style={{ flex: 1 }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={13} color="#71717A" />
                <p style={{ fontSize: 11, color: "#8E8E93", fontWeight: 450 }}>Rental ends</p>
              </div>
              <p style={{ fontSize: 13, fontWeight: 650, color: "#F5F5F7", letterSpacing: "-0.1px" }}>
                {booking?.end_date ? format(new Date(`${booking.end_date}T23:59:59`), "MMM d, yyyy") : "N/A"}
              </p>
              <p style={{ fontSize: 11, color: "#8E8E93", fontWeight: 400 }}>
                {booking?.end_date ? format(new Date(`${booking.end_date}T23:59:59`), "h:mm a") : ""}
              </p>
            </div>

            <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.08)", margin: "0 10px" }} />

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
              <p style={{ fontSize: 13, fontWeight: 650, color: "#F5F5F7", letterSpacing: "-0.1px", fontVariantNumeric: "tabular-nums" }}>{remainingStr}</p>
              <p style={{ fontSize: 11, color: "#8E8E93", fontWeight: 400 }}>remaining</p>
            </div>

            <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.08)", margin: "0 10px" }} />

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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>

              {/* Lock */}
              <button
                onClick={() => booking && handleCommand("lock")}
                disabled={!!commandLoading || dropoffInspectionComplete}
                className={commandLoading === "lock" ? "btn-loading-spin" : ""}
                style={{
                  position: "relative",
                  aspectRatio: "4/3",
                  background: "linear-gradient(180deg, #1B1C21 0%, #111216 100%)",
                  border: isLocked ? "1px solid rgba(48,209,88,0.15)" : "1px solid rgba(255,69,58,0.15)",
                  borderRadius: 24,
                  padding: 0,
                  boxShadow: isLocked 
                    ? "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 8px rgba(48,209,88,0.05)"
                    : "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 8px rgba(255,69,58,0.05)",
                  cursor: "pointer",
                  opacity: dropoffInspectionComplete && commandLoading !== "lock" ? 0.45 : 1,
                  transition: "all 0.2s ease-in-out",
                }}
              >
                <div className="btn-loading-content">
                  <Lock size={26} color={isLocked ? "#30D158" : "#FF453A"} strokeWidth={1.5} style={{ filter: isLocked ? "drop-shadow(0 2px 8px rgba(48,209,88,0.15))" : "drop-shadow(0 2px 8px rgba(255,69,58,0.15))" }} />
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 12, fontWeight: 550, color: "#F5F5F7", lineHeight: 1.2, letterSpacing: "-0.05px" }}>Lock</p>
                    <p style={{ fontSize: 10, color: isLocked ? "#30D158" : "#FF453A", lineHeight: 1.2, fontWeight: 500 }}>
                      {isLocked ? "Locked" : "Unlocked"}
                    </p>
                  </div>
                </div>
              </button>

              {/* Unlock */}
              <button
                onClick={() => booking && handleCommand("unlock")}
                disabled={!!commandLoading || dropoffInspectionComplete}
                className={commandLoading === "unlock" ? "btn-loading-spin" : ""}
                style={{
                  position: "relative",
                  aspectRatio: "4/3",
                  background: "linear-gradient(180deg, #1B1C21 0%, #111216 100%)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 24,
                  padding: 0,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 8px rgba(255,255,255,0.02)",
                  cursor: "pointer",
                  opacity: dropoffInspectionComplete && commandLoading !== "unlock" ? 0.45 : 1,
                  transition: "all 0.2s ease-in-out",
                }}
              >
                <div className="btn-loading-content">
                  <Unlock size={26} color="#FFFFFF" strokeWidth={1.5} style={{ filter: "drop-shadow(0 2px 8px rgba(255,255,255,0.15))" }} />
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 12, fontWeight: 550, color: "#F5F5F7", lineHeight: 1.2, letterSpacing: "-0.05px" }}>Unlock</p>
                    <p style={{ fontSize: 10, color: "#7C7C80", lineHeight: 1.2, fontWeight: 400 }}>Doors</p>
                  </div>
                </div>
              </button>

              {/* Find Vehicle */}
              <button
                onClick={() => booking && handleCommand("find")}
                disabled={!!commandLoading || dropoffInspectionComplete}
                className={commandLoading === "find" ? "btn-loading-spin" : ""}
                style={{
                  position: "relative",
                  aspectRatio: "4/3",
                  background: "linear-gradient(180deg, #1B1C21 0%, #111216 100%)",
                  border: "1px solid rgba(47,128,255,0.2)",
                  borderRadius: 24,
                  padding: 0,
                  boxShadow: !dropoffInspectionComplete
                    ? "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 12px rgba(47,128,255,0.08)"
                    : "inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.2)",
                  opacity: dropoffInspectionComplete && commandLoading !== "find" ? 0.45 : 1,
                  cursor: !dropoffInspectionComplete ? "pointer" : "default",
                  transition: "all 0.2s ease-in-out",
                }}
              >
                <div className="btn-loading-content">
                  <HornIcon color="#2F80FF" />
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#F5F5F7", lineHeight: 1.2, letterSpacing: "-0.05px" }}>Find</p>
                    <p style={{ fontSize: 10, color: "#7C7C80", lineHeight: 1.2, fontWeight: 400 }}>Vehicle</p>
                  </div>
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
                background: "rgba(255,69,58,0.05)",
                border: "1px solid rgba(255,69,58,0.2)",
                borderRadius: 22,
                padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 12,
                marginBottom: 10,
                cursor: "pointer",
                boxShadow: "0 0 12px rgba(255,69,58,0.05)",
                transition: "all 0.2s",
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
            </div>
            <div style={{
              background: "#17181C",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 22,
              padding: "16px 8px",
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "16px 4px",
            }}>
              {[
                { label: "Connection", sub: device?.online_status === "offline" ? "Offline" : "Online", icon: Activity },
                { label: "Ignition", sub: device?.ignition_status === "on" ? "On" : "Off", icon: Power },
                { label: "Main Batt", sub: device?.power_voltage ? `${device.power_voltage}V` : "12.6V", icon: Battery },
                { label: "Int. Batt", sub: device?.battery_voltage ? `${device.battery_voltage}V` : "4.1V", icon: Zap },
                { label: "GPS Status", sub: gps.status === "online" ? "Active" : "Lost", icon: MapPin },
                { label: "Speed", sub: device?.speed ? `${Math.round(device.speed)} mph` : "0 mph", icon: Gauge },
                { label: "Cell Signal", sub: device?.signal_strength ? `${device.signal_strength}%` : "Strong", icon: Signal },
                { label: "ACC Volt", sub: device?.voltage ? `${device.voltage}V` : "0.0V", icon: Activity },
              ].map((item) => {
                const Icon = item.icon || CheckCircle;
                return (
                  <div key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    <Icon size={18} color="#30D158" style={{ filter: "drop-shadow(0 2px 8px rgba(48,209,88,0.4))" }} />
                    <p style={{ fontSize: 10, color: "#A1A1AA", textAlign: "center", lineHeight: 1.2 }}>{item.label}</p>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#FFFFFF", textAlign: "center", lineHeight: 1.2 }}>{item.sub}</p>
                  </div>
                );
              })}
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
        {showDiagnostics && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end"
          }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={() => setShowDiagnostics(false)} />
            <div style={{
              position: "relative", background: "#17181C", borderTop: "1px solid rgba(255,255,255,0.1)",
              borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: "24px 20px 40px",
              boxShadow: "0 -10px 40px rgba(0,0,0,0.5)", animation: "fade-in-up 0.3s ease-out",
              maxHeight: "85vh", display: "flex", flexDirection: "column"
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