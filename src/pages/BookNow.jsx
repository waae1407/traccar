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
import RentForFreeBanner from "@/components/customer/booknow/RentForFreeBanner";
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
  const refCode = new URLSearchParams(window.location.search).get("ref");
  const { data: tenantCompany } = useQuery({
    queryKey: ["company-by-slug", companySlug],
    queryFn: async () => {
      const results = await base44.entities.Company.filter({ slug: companySlug });
      return results[0] || null;
    },
    enabled: !!companySlug,
    staleTime: 5 * 60_000,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["public-approved-reviews"],
    queryFn: () => base44.entities.HostReview.filter({ moderation_status: "approved", visibility_status: "public" }, "-created_date", 500),
  });

  const { data: signalSnapshots = [] } = useQuery({
    queryKey: ["public-signal-snapshots"],
    queryFn: () => base44.entities.ReputationSignalSnapshot.list("-created_date", 500),
  });

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles-public", tenantCompany?.id],
    queryFn: () => tenantCompany?.id
      ? base44.entities.Vehicle.filter({ company_id: tenantCompany.id })
      : base44.entities.Vehicle.list(),
    staleTime: 60_000,
  });

  const { data: operatorPlans = [] } = useQuery({
    queryKey: ["public-marketplace-eligible-plans"],
    queryFn: () => base44.entities.OperatorPlanConfiguration.list("-updated_date", 500),
    staleTime: 60_000,
  });

  const marketplacePlanByHost = useMemo(() => {
    return operatorPlans.reduce((map, plan) => {
      if (!plan.host_id || map[plan.host_id]) return map;
      map[plan.host_id] = plan;
      return map;
    }, {});
  }, [operatorPlans]);

  // Suggested alternate cities for current location
  const suggested = useMemo(() => {
    const key = location.city.toLowerCase();
    return SUGGESTED_CITIES[key] || [];
  }, [location.city]);

  // All available vehicles, sorted by distance if location is known (no hard distance cutoff)
  const available = useMemo(() => {
    const avail = vehicles.filter((v) => {
      if (v.status !== "Available" || !v.host_id) return false;
      const plan = marketplacePlanByHost[v.host_id];
      return !plan || plan.marketplace_enabled !== false;
    });
    if (!location.lat || !location.lon) return avail;
    return avail
      .map((v) => ({
        ...v,
        distance: v.vehicle_lat && v.vehicle_lon
          ? getDistance(location.lat, location.lon, v.vehicle_lat, v.vehicle_lon)
          : undefined,
      }))
      .sort((a, b) => {
        if (a.distance === undefined && b.distance === undefined) return 0;
        if (a.distance === undefined) return 1;
        if (b.distance === undefined) return -1;
        return a.distance - b.distance;
      });
  }, [vehicles, location, marketplacePlanByHost]);

  const rtoEligible = available.filter((v) => v.rent_to_own_eligible);

  // Filter logic (all tabs work on the full available fleet)
  const filtered = activeFilter === "RTO"
    ? available.filter((v) => v.rent_to_own_eligible)
    : activeFilter === "Budget"
    ? [...available].sort((a, b) => (a.weekly_rate || 9999) - (b.weekly_rate || 9999))
    : activeFilter === "Newest"
    ? [...available].sort((a, b) => (b.year || 0) - (a.year || 0))
    : available; // "All" = sorted by distance (nearest first)

  const handleBook = (vehicle) => {
    setSelectedVehicle(null);
    const companyParam = companySlug ? `&company=${companySlug}` : "";
    const refParam = refCode ? `&ref=${refCode}` : "";
    navigate(`/checkout?vehicle=${vehicle.id}&type=${bookingType}${companyParam}${refParam}`);
  };

  const handleLocationZipSearch = async (zipcode, altCity) => {
    if (altCity) {
      setManualCity(altCity.name, altCity.state, altCity.lat, altCity.lon);
    } else {
      await setByZip(zipcode);
    }
  };

  return (
    <div className="min-h-screen pb-32 bg-gray-50">
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

      {/* Referral promo banner */}
      <RentForFreeBanner />

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
      {!isLoading && available.length === 0 ? (
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
          isExpandedRadius={false}
          reviews={reviews}
          signalSnapshots={signalSnapshots}
        />
      )}

      {/* Vehicle Detail Sheet */}
      <VehicleDetailSheet
        vehicle={selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        onBook={handleBook}
        user={user}
        reviews={reviews}
        signalSnapshots={signalSnapshots}
      />
    </div>
  );
}