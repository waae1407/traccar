import React, { useState, useMemo } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import VehicleDetailSheet from "@/components/customer/VehicleDetailSheet";
import ContinueBookingBanner from "@/components/customer/ContinueBookingBanner";
import LocationContext from "@/components/customer/booknow/LocationContext";
import RentForFreeBanner from "@/components/customer/booknow/RentForFreeBanner";
import BookNowRtoBanner from "@/components/customer/booknow/BookNowRtoBanner";
import BookNowVehicleGrid from "@/components/customer/booknow/BookNowVehicleGrid";
import WaitlistEmptyState from "@/components/customer/booknow/WaitlistEmptyState";
import useUserLocation from "@/hooks/useUserLocation";
import { Gift, CalendarCheck, Key, ChevronRight } from "lucide-react";

// Haversine distance in miles
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const FILTERS = ["All", "Budget", "Newest", "RTO"];

export default function HostStorefrontHome() {
  const { brand, businessSlug } = useOutletContext() || {};
  const { user } = useAuth();
  const navigate = useNavigate();
  const { location, detecting, source, setByZip, setManualCity } = useUserLocation(user);

  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [bookingType, setBookingType] = useState("Weekly");
  const [activeFilter, setActiveFilter] = useState("All");

  const brandColor = brand?.brand_color || "#e91e8c";
  const secondaryColor = brand?.secondary_color || "#7c3aed";
  const showMarketplace = brand?.show_marketplace_vehicles;
  const showRto = brand?.show_rto_options !== false;
  const showRentForFree = brand?.show_rent_for_free !== false;

  // Host's own vehicles
  const { data: hostVehicles = [], isLoading: loadingHost } = useQuery({
    queryKey: ["storefront-host-vehicles", brand?.host_id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: brand.host_id, approval_status: "approved" }),
    enabled: !!brand?.host_id,
  });

  // Marketplace vehicles (all approved) — only if host enabled it
  const { data: marketplaceVehicles = [], isLoading: loadingMarket } = useQuery({
    queryKey: ["storefront-market-vehicles"],
    queryFn: () => base44.entities.Vehicle.filter({ approval_status: "approved", status: "Available" }),
    enabled: !!showMarketplace,
  });

  const allVehicles = useMemo(() => {
    if (showMarketplace) {
      const marketIds = new Set(marketplaceVehicles.map(v => v.id));
      const combined = [...hostVehicles.filter(v => !marketIds.has(v.id)), ...marketplaceVehicles];
      return combined;
    }
    return hostVehicles;
  }, [hostVehicles, marketplaceVehicles, showMarketplace]);

  const available = useMemo(() => {
    const avail = allVehicles.filter(v => v.status === "Available");
    if (!location.lat || !location.lon) return avail;
    return avail.map(v => ({
      ...v,
      distance: v.vehicle_lat && v.vehicle_lon
        ? getDistance(location.lat, location.lon, v.vehicle_lat, v.vehicle_lon)
        : undefined,
    })).sort((a, b) => {
      if (a.distance === undefined && b.distance === undefined) return 0;
      if (a.distance === undefined) return 1;
      if (b.distance === undefined) return -1;
      return a.distance - b.distance;
    });
  }, [allVehicles, location]);

  const rtoEligible = available.filter(v => v.rent_to_own_eligible);

  const filtered = activeFilter === "RTO"
    ? available.filter(v => v.rent_to_own_eligible)
    : activeFilter === "Budget"
    ? [...available].sort((a, b) => (a.weekly_rate || 9999) - (b.weekly_rate || 9999))
    : activeFilter === "Newest"
    ? [...available].sort((a, b) => (b.year || 0) - (a.year || 0))
    : available;

  const isLoading = loadingHost || (showMarketplace && loadingMarket);

  const handleBook = (vehicle) => {
    setSelectedVehicle(null);
    navigate(`/checkout?vehicle=${vehicle.id}&type=${bookingType}&storefront=${businessSlug}`);
  };

  const handleLocationZipSearch = async (zipcode, altCity) => {
    if (altCity) setManualCity(altCity.name, altCity.state, altCity.lat, altCity.lon);
    else await setByZip(zipcode);
  };

  const BOOKING_TYPES = [
    { label: "Weekly", icon: CalendarCheck, type: "Weekly", desc: "Flexible, week by week" },
    { label: "Rent-to-Own", icon: Key, type: "Rent-to-Own", desc: "Drive to own it" },
  ];

  return (
    <div className="min-h-screen pb-4 bg-gray-50">
      {/* Gig worker hero banner */}
      <button
        onClick={() => navigate("/checkout")}
        className="mx-5 mt-5 mb-5 rounded-2xl overflow-hidden relative w-[calc(100%-2.5rem)] text-left active:scale-[0.98] transition-transform block"
        style={{ background: `linear-gradient(135deg, ${brandColor} 0%, ${secondaryColor} 100%)` }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-6 -right-6 h-28 w-28 rounded-full opacity-20 bg-white" />
        </div>
        <div className="relative px-5 py-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-white font-bold text-base leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
              Drive for Uber, DoorDash or Lyft?
            </p>
            <p className="text-white/75 text-sm mt-1">Start earning today — get a car in minutes</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-2xl">🚀</span>
            <ChevronRight className="h-4 w-4 text-white/80" />
          </div>
        </div>
      </button>

      {user && <ContinueBookingBanner user={user} />}

      {/* Location context */}
      <LocationContext
        location={location}
        detecting={detecting}
        source={source}
        onZipSearch={handleLocationZipSearch}
        suggestedCities={[]}
        vehicleCount={available.length}
      />

      {/* Headline */}
      <div className="px-5 mb-5 mt-2">
        {user && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Hi {user.full_name?.split(" ")[0]} 👋</p>}
        <h1 className="text-3xl font-black" style={{ fontFamily: "var(--font-syne)", background: `linear-gradient(135deg, ${brandColor}, ${secondaryColor})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          {brand?.hero_title || "Find Your Ride"}
        </h1>
        {brand?.hero_subtitle && <p className="text-gray-400 text-sm mt-1">{brand.hero_subtitle}</p>}
      </div>

      {/* Rent for Free banner */}
      {showRentForFree && <RentForFreeBanner />}

      {/* Booking type toggles */}
      <div className="px-5 mb-5">
        <div className="flex gap-3 mb-4">
          {BOOKING_TYPES.map((a) => {
            const isActive = bookingType === a.type;
            return (
              <button key={a.type} onClick={() => setBookingType(a.type)}
                className="flex-1 flex items-center gap-3 p-4 rounded-2xl border transition-all active:scale-95"
                style={{
                  background: isActive ? `linear-gradient(135deg, ${brandColor}, ${secondaryColor})` : "#fff",
                  borderColor: isActive ? "transparent" : "#e5e7eb",
                  boxShadow: isActive ? `0 4px 16px ${brandColor}40` : "0 1px 4px rgba(0,0,0,0.06)",
                }}>
                <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: isActive ? "rgba(255,255,255,0.25)" : "#f3f4f6" }}>
                  <a.icon className="h-4 w-4" style={{ color: isActive ? "white" : "#4b5563" }} strokeWidth={1.8} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold leading-tight" style={{ color: isActive ? "white" : "#1f2937" }}>{a.label}</p>
                  <p className="text-[10px]" style={{ color: isActive ? "rgba(255,255,255,0.7)" : "#9ca3af" }}>{a.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all border min-h-[38px]"
              style={{
                background: activeFilter === f ? `linear-gradient(135deg, ${brandColor}, ${secondaryColor})` : "#fff",
                borderColor: activeFilter === f ? "transparent" : "#e5e7eb",
                color: activeFilter === f ? "white" : "#6b7280",
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* RTO banner */}
      {showRto && rtoEligible.length > 0 && <BookNowRtoBanner count={rtoEligible.length} />}

      {/* Vehicles */}
      <div id="vehicle-grid" />
      {!isLoading && available.length === 0 ? (
        <WaitlistEmptyState location={location} onChangeLocation={() => {}} />
      ) : (
        <BookNowVehicleGrid
          vehicles={filtered}
          isLoading={isLoading}
          location={location}
          onSelect={setSelectedVehicle}
          isExpandedRadius={false}
        />
      )}

      <VehicleDetailSheet
        vehicle={selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        onBook={handleBook}
        user={user}
      />
    </div>
  );
}