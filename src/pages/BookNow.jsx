import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext, useNavigate } from "react-router-dom";
import VehicleDetailSheet from "@/components/customer/VehicleDetailSheet";
import ContinueBookingBanner from "@/components/customer/ContinueBookingBanner";
import BookNowQuickActions from "@/components/customer/booknow/BookNowQuickActions";
import BookNowVehicleGrid from "@/components/customer/booknow/BookNowVehicleGrid";
import BookNowRtoBanner from "@/components/customer/booknow/BookNowRtoBanner";
import GigWorkerBanner from "@/components/customer/booknow/GigWorkerBanner";
import LocationContext from "@/components/customer/booknow/LocationContext";
import BookNowHeadline from "@/components/customer/booknow/BookNowHeadline";
import WaitlistEmptyState from "@/components/customer/booknow/WaitlistEmptyState";
import useUserLocation from "@/hooks/useUserLocation";
import HomeTopBar from "@/components/customer/HomeTopBar";

// Haversine distance in miles
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const SUGGESTED_CITIES = {
  detroit: [
    { name: "Ann Arbor", state: "MI", lat: 42.2808, lon: -83.7430, badge: "⚡ Fast Pickup", hot: true },
    { name: "Dearborn", state: "MI", lat: 42.3222, lon: -83.1763, badge: "🔥 High Demand", hot: true },
  ],
  "los angeles": [
    { name: "Santa Monica", state: "CA", lat: 34.0195, lon: -118.4912, badge: "🔥 High Demand", hot: true },
    { name: "Pasadena", state: "CA", lat: 34.1478, lon: -118.1445, badge: "⚡ Fast Pickup", hot: true },
  ],
  "new york": [
    { name: "Brooklyn", state: "NY", lat: 40.6782, lon: -73.9442, badge: "🔥 High Demand", hot: true },
    { name: "Queens", state: "NY", lat: 40.7282, lon: -73.7949, badge: "⚡ Fast Pickup", hot: true },
  ],
  chicago: [
    { name: "Evanston", state: "IL", lat: 42.0601, lon: -87.6819, badge: "⚡ Fast Pickup", hot: true },
    { name: "Oak Park", state: "IL", lat: 41.8856, lon: -87.8144, badge: "🔥 High Demand", hot: true },
  ],
};

export default function BookNow() {
  const context = useOutletContext() || {};
  const { user } = context;
  const navigate = useNavigate();
  const { location, detecting, source, setByZip, setManualCity } = useUserLocation(user);

  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [bookingType, setBookingType] = useState("Weekly");
  const [activeFilter, setActiveFilter] = useState("All");

  const companySlug = new URLSearchParams(window.location.search).get("company");
  const { data: tenantCompany } = useQuery({
    queryKey: ["company-by-slug", companySlug],
    queryFn: async () => {
      const results = await base44.entities.Company.filter({ slug: companySlug });
      return results[0] || null;
    },
    enabled: !!companySlug,
    staleTime: 5 * 60_000,
  });

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles-public", tenantCompany?.id],
    queryFn: () => tenantCompany?.id
      ? base44.entities.Vehicle.filter({ company_id: tenantCompany.id })
      : base44.entities.Vehicle.list(),
    staleTime: 60_000,
  });

  // Suggested alternate cities for current location
  const suggested = useMemo(() => {
    const key = location.city.toLowerCase();
    return SUGGESTED_CITIES[key] || [];
  }, [location.city]);

  // Distance filtering + sorting — with expanded radius fallback (Option D)
  const { available, isExpandedRadius } = useMemo(() => {
    if (!location.lat || !location.lon) {
      const avail = vehicles.filter((v) => v.status === "Available");
      return { available: avail, isExpandedRadius: false };
    }

    const withDistance = vehicles
      .filter((v) => v.status === "Available" && v.vehicle_lat && v.vehicle_lon)
      .map((v) => ({
        ...v,
        distance: getDistance(location.lat, location.lon, v.vehicle_lat, v.vehicle_lon),
      }))
      .sort((a, b) => a.distance - b.distance);

    const nearby = withDistance.filter((v) => v.distance <= 50);
    if (nearby.length > 0) return { available: nearby, isExpandedRadius: false };

    // Expand to 150 miles
    const expanded = withDistance.filter((v) => v.distance <= 150);
    return { available: expanded, isExpandedRadius: expanded.length > 0 };
  }, [vehicles, location]);

  const displayVehicles = available;
  const rtoEligible = available.filter((v) => v.rent_to_own_eligible);

  // Filter logic
  const filtered = activeFilter === "RTO"
    ? displayVehicles.filter((v) => v.rent_to_own_eligible)
    : activeFilter === "Budget"
    ? [...displayVehicles].sort((a, b) => (a.weekly_rate || 9999) - (b.weekly_rate || 9999))
    : activeFilter === "Newest"
    ? [...displayVehicles].sort((a, b) => (b.year || 0) - (a.year || 0))
    : displayVehicles;

  const handleBook = (vehicle) => {
    setSelectedVehicle(null);
    const companyParam = companySlug ? `&company=${companySlug}` : "";
    navigate(`/checkout?vehicle=${vehicle.id}&type=${bookingType}${companyParam}`);
  };

  const handleLocationZipSearch = async (zipcode, altCity) => {
    if (altCity) {
      setManualCity(altCity.name, altCity.state, altCity.lat, altCity.lon);
    } else {
      await setByZip(zipcode);
    }
  };

  return (
    <div className="min-h-screen pb-28 bg-gray-50">
      <HomeTopBar user={user} />

      {/* SECTION 1: Promo banner */}
      <GigWorkerBanner onCta={() => document.getElementById("vehicle-grid")?.scrollIntoView({ behavior: "smooth" })} />

      {user && <ContinueBookingBanner user={user} />}

      {/* SECTION 2: Location + Availability (compact context) */}
      <LocationContext
        location={location}
        detecting={detecting}
        source={source}
        onZipSearch={handleLocationZipSearch}
        suggestedCities={suggested}
        vehicleCount={available.length}
      />

      {/* SECTION 3: Main headline */}
      <BookNowHeadline user={user} />

      {/* SECTION 4: Rental choice toggles */}
      <BookNowQuickActions
        bookingType={bookingType}
        onTypeChange={setBookingType}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        companySlug={companySlug}
      />

      {/* SECTION 5: RTO program card */}
      {rtoEligible.length > 0 && <BookNowRtoBanner count={rtoEligible.length} companySlug={companySlug} />}

      {/* SECTION 6: Vehicle inventory or empty state */}
      <div id="vehicle-grid" />
      {!isLoading && filtered.length === 0 && !isExpandedRadius ? (
        <WaitlistEmptyState
          location={location}
          onChangeLocation={() => document.getElementById("location-context-change")?.click()}
        />
      ) : (
        <BookNowVehicleGrid
          vehicles={filtered}
          isLoading={isLoading}
          location={location}
          onSelect={setSelectedVehicle}
          isExpandedRadius={isExpandedRadius}
        />
      )}

      {/* Vehicle Detail Sheet */}
      <VehicleDetailSheet
        vehicle={selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        onBook={handleBook}
        user={user}
      />
    </div>
  );
}