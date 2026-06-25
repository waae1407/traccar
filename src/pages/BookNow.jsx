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
import MarketplaceFilters from "@/components/marketplace/MarketplaceFilters";
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
  const [marketplaceFilters, setMarketplaceFilters] = useState({
    city: '',
    pickup_date: '',
    return_date: '',
    price_min: 0,
    price_max: 500,
    vehicle_type: [],
    fuel_type: [],
    contactless_pickup: false,
    delivery_available: false,
    instant_booking: true,
    rental_type: 'weekly',
    sort: 'recommended'
  });

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

  const { data: commerceProfiles = [] } = useQuery({
    queryKey: ["public-commerce-profiles"],
    queryFn: () => base44.entities.HostCommerceProfile.list("-updated_date", 500),
    staleTime: 60_000,
  });

  const { data: operatorPlans = [] } = useQuery({
    queryKey: ["public-marketplace-fallback-plans"],
    queryFn: () => base44.entities.OperatorPlanConfiguration.list("-updated_date", 500),
    staleTime: 60_000,
  });

  const { data: approvedHosts = [] } = useQuery({
    queryKey: ["public-approved-hosts"],
    queryFn: () => base44.entities.Host.filter({ status: "approved" }, "-created_date", 500),
    staleTime: 5 * 60_000,
  });

  const { data: brandSettings = [] } = useQuery({
    queryKey: ["public-brand-moderation"],
    queryFn: () => base44.entities.HostBrandSettings.list("-updated_date", 500),
    staleTime: 5 * 60_000,
  });

  const { data: platformSettingsData } = useQuery({
    queryKey: ["platform-settings-public"],
    queryFn: () => base44.functions.invoke('getPlatformSettings', {}).then(r => r.data),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const complianceEnforcementEnabled = platformSettingsData ? platformSettingsData.compliance_enforcement_enabled !== false : true;

  // Fetch active fast-commit locks to show "Checkout in progress" status
  // ONLY show for locks created within last 120 seconds (final Submit/Pay)
  const { data: activeLocks = [] } = useQuery({
    queryKey: ["active-fast-commit-locks"],
    queryFn: () => base44.entities.BookingHold.filter({ status: 'active' }, '-hold_expires_at', 100),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  // Map vehicle_id to lock info (only if <120 seconds old)
  const vehicleLockMap = useMemo(() => {
    const map = {};
    const now = new Date();
    activeLocks.forEach(lock => {
      const lockAge = now.getTime() - new Date(lock.hold_start).getTime();
      const lockAgeSeconds = Math.floor(lockAge / 1000);
      
      // FAST-COMMIT: Only show "Checkout in progress" for locks <120 seconds old
      // This indicates active final-submit, NOT browsing/checkout navigation
      if (lock.status === 'active' && lockAgeSeconds < 120) {
        map[lock.vehicle_id] = {
          lock_id: lock.id,
          expires_at: lock.hold_expires_at,
          age_seconds: lockAgeSeconds,
          customer_email: lock.customer_email,
        };
      }
    });
    return map;
  }, [activeLocks]);

  // Build approved host set and brand moderation set
  const approvedHostIds = useMemo(() => new Set(approvedHosts.map(h => h.id)), [approvedHosts]);
  const blockedHostIds = useMemo(() => new Set(
    approvedHosts.filter(h => h.booking_blocked === true).map(h => h.id)
  ), [approvedHosts]);
  const suspendedStorefrontHostIds = useMemo(() => new Set(
    brandSettings.filter(b => b.moderation_status === "suspended").map(b => b.host_id)
  ), [brandSettings]);

  // Build a per-host plan mode map for marketplace eligibility
  const hostPlanModeMap = useMemo(() => {
    const map = {};
    operatorPlans.forEach((plan) => {
      if (plan.host_id && !map[plan.host_id]) {
        map[plan.host_id] = {
          mode: plan.active_mode || plan.selected_mode || "marketplace_partner",
          status: plan.status,
        };
      }
    });
    return map;
  }, [operatorPlans]);

  const marketplaceVisibilityByHost = useMemo(() => {
    const map = {};
    commerceProfiles.forEach((profile) => {
      if (!profile.host_id) return;
      map[profile.host_id] = profile.marketplace_enabled !== false && profile.marketplace_visibility !== false;
    });
    return map;
  }, [commerceProfiles]);

  // Suggested alternate cities for current location
  const suggested = useMemo(() => {
    const key = location.city.toLowerCase();
    return SUGGESTED_CITIES[key] || [];
  }, [location.city]);

  // All available vehicles, sorted by distance if location is known (no hard distance cutoff)
  const available = useMemo(() => {
    const avail = vehicles.filter((v) => {
      if (v.status !== "Available") return false;
      if (!v.host_id) return false;
      if (v.approval_status && v.approval_status !== "approved") return false;
      if (v.admin_marketplace_approved === false) return false;
      if (!approvedHostIds.has(v.host_id)) return false;
      if (blockedHostIds.has(v.host_id)) return false;
      if (suspendedStorefrontHostIds.has(v.host_id)) return false;
      // Commerce profile level check
      if (marketplaceVisibilityByHost[v.host_id] === false) return false;
      // Plan-level rules
      const hostPlan = hostPlanModeMap[v.host_id];
      const planMode = hostPlan?.mode || "marketplace_partner";
      const planStatus = hostPlan?.status;
      // FleetOS: always blocked from marketplace
      if (planMode === "fleetos_professional") return false;
      // Hybrid Growth: must have marketplace_visible = true AND active/trialing sub
      if (planMode === "hybrid_growth") {
        if (v.marketplace_visible === false) return false;
        if (planStatus && !["active", "trialing"].includes(planStatus)) return false;
      }
      // Marketplace Partner: always eligible (ignore marketplace_visible field)
      return true;
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
  }, [vehicles, location, marketplaceVisibilityByHost, hostPlanModeMap, approvedHostIds, blockedHostIds, suspendedStorefrontHostIds]);

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
      
      {/* Premium Marketplace Filters */}
      <MarketplaceFilters
        filters={marketplaceFilters}
        onFiltersChange={setMarketplaceFilters}
        vehicleCount={available.length}
        isLoading={isLoading}
      />

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