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
import useUserLocation from "@/hooks/useUserLocation";
import { CalendarCheck, Key, ChevronRight, CreditCard, Shield, Zap, Clock, Star, Car } from "lucide-react";
import { canonicalCheckoutUrl, isCustomDomainHost } from "@/lib/customDomain";
import HostTrustPanel from "@/components/trust/HostTrustPanel";
import StorefrontLeadCapture from "@/components/host/storefront/StorefrontLeadCapture";
import { latestSnapshotFor, publicHostLabels, publicRating } from "@/lib/reputation/publicTrust";

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
  const coverImageUrl = brand?.cover_image_url;
  const inventoryPresentationStyle = brand?.inventory_presentation_style || "clean_grid";
  const showMarketplace = brand?.show_marketplace_vehicles;
  const showRto = brand?.show_rto_options !== false;
  const showRentForFree = brand?.show_rent_for_free !== false;

  const { data: hosts = [] } = useQuery({
    queryKey: ["storefront-host", brand?.host_id],
    queryFn: () => base44.entities.Host.filter({ id: brand.host_id }),
    enabled: !!brand?.host_id,
  });
  const host = hosts[0];

  const { data: commerceProfiles = [] } = useQuery({
    queryKey: ["storefront-commerce-profile", brand?.host_id],
    queryFn: () => base44.entities.HostCommerceProfile.filter({ host_id: brand.host_id }, "-updated_date", 1),
    enabled: !!brand?.host_id,
  });
  const commerceProfile = commerceProfiles[0];
  const reservationRequestOnly = commerceProfile?.booking_enabled !== false && (!commerceProfile?.online_payments_enabled || commerceProfile?.payment_processor === "reservation_only") && ["host_stripe", "reservation_only"].includes(commerceProfile?.payment_processor);

  const { data: reviews = [] } = useQuery({
    queryKey: ["storefront-public-reviews", brand?.host_id],
    queryFn: () => base44.entities.HostReview.filter({ host_id: brand.host_id, moderation_status: "approved", visibility_status: "public" }, "-created_date", 500),
    enabled: !!brand?.host_id,
  });

  const { data: signalSnapshots = [] } = useQuery({
    queryKey: ["storefront-signal-snapshots", brand?.host_id],
    queryFn: () => base44.entities.ReputationSignalSnapshot.list("-created_date", 500),
    enabled: !!brand?.host_id,
  });

  // Host's own vehicles — storefront_visible filter applied in useMemo below
  const { data: hostVehicles = [], isLoading: loadingHost } = useQuery({
    queryKey: ["storefront-host-vehicles", brand?.host_id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: brand.host_id, approval_status: "approved" }),
    enabled: !!brand?.host_id,
  });

  // Marketplace vehicles (all approved) — only if host enabled it
  const { data: marketplaceVehicles = [], isLoading: loadingMarket } = useQuery({
    queryKey: ["storefront-market-vehicles"],
    queryFn: async () => {
      const [vehicleRows, commerceRows, planRows] = await Promise.all([
        base44.entities.Vehicle.filter({ approval_status: "approved", status: "Available" }),
        base44.entities.HostCommerceProfile.list("-updated_date", 500),
        base44.entities.OperatorPlanConfiguration.list("-updated_date", 500),
      ]);
      const visibilityByHost = planRows.reduce((map, row) => {
        if (!row.host_id || map[row.host_id] !== undefined) return map;
        map[row.host_id] = row.marketplace_enabled !== false;
        return map;
      }, {});
      commerceRows.forEach((row) => {
        if (!row.host_id) return;
        visibilityByHost[row.host_id] = row.marketplace_enabled !== false && row.marketplace_visibility !== false;
      });
      // Build plan mode map to enforce FleetOS block
      const planModeMap = {};
      planRows.forEach((p) => { if (p.host_id && !planModeMap[p.host_id]) planModeMap[p.host_id] = p.active_mode || p.selected_mode || "marketplace_partner"; });
      return vehicleRows.filter((vehicle) => {
        if (visibilityByHost[vehicle.host_id] === false) return false;
        if (vehicle.admin_marketplace_approved === false) return false;
        const mode = planModeMap[vehicle.host_id] || "marketplace_partner";
        if (mode === "fleetos_professional") return false;
        if (mode === "hybrid_growth" && vehicle.marketplace_visible === false) return false;
        return true;
      });
    },
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
    const avail = allVehicles.filter(v =>
      v.status === "Available" &&
      v.storefront_visible !== false
    );
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
  const hostSnapshot = latestSnapshotFor(signalSnapshots, "host", brand?.host_id);
  const hostLabels = publicHostLabels(hostSnapshot, { status: "approved" });
  const hostRating = publicRating(reviews);
  const completedTrips = hostSnapshot?.completed_bookings_count || 0;

  const handleBook = (vehicle) => {
    setSelectedVehicle(null);
    const params = new URLSearchParams({ vehicle: vehicle.id, type: bookingType, storefront: businessSlug, return: `/host/${businessSlug}` });
    if (isCustomDomainHost()) window.location.href = canonicalCheckoutUrl(params);
    else navigate(`/checkout?${params.toString()}`);
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
      <div className="mx-auto w-full max-w-6xl">
      {/* Branded hero banner */}
      <button
        onClick={() => {
          const params = new URLSearchParams({ storefront: businessSlug, return: `/host/${businessSlug}` });
          if (isCustomDomainHost()) window.location.href = canonicalCheckoutUrl(params);
          else navigate(`/checkout?${params.toString()}`);
        }}
        className="mt-5 mb-6 md:mb-8 rounded-3xl md:rounded-[2rem] overflow-hidden relative w-full text-left active:scale-[0.98] transition-transform block min-h-[280px] md:min-h-[360px] shadow-xl"
        style={{ background: `linear-gradient(135deg, ${brandColor} 0%, ${secondaryColor} 100%)` }}>
        {coverImageUrl && <img src={coverImageUrl} alt="Storefront hero" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0" style={{
          background: coverImageUrl
            ? "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.0) 35%, rgba(0,0,0,0.7) 100%)"
            : `linear-gradient(135deg, ${brandColor}dd, ${secondaryColor}aa), linear-gradient(to top, rgba(0,0,0,.55), transparent 60%)`
        }} />
        {!coverImageUrl && <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full opacity-10 bg-white blur-3xl" />}
        <div className="relative px-6 md:px-10 py-8 md:py-12 flex h-full min-h-[280px] md:min-h-[360px] flex-col justify-end gap-4">
          {/* Trust badges row */}
          {(hostRating.count > 0 || completedTrips > 0 || available.length > 0) && (
            <div className="flex flex-wrap gap-2 mb-1">
              {hostRating.count > 0 && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[10px] md:text-xs font-bold text-white border border-white/20">
                  <Star className="h-3 w-3 fill-white" /> {hostRating.rating.toFixed(1)} ({hostRating.count})
                </span>
              )}
              {completedTrips > 0 && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[10px] md:text-xs font-bold text-white border border-white/20">
                  <Car className="h-3 w-3" /> {completedTrips}+ trips
                </span>
              )}
              {available.length > 0 && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[10px] md:text-xs font-bold text-white border border-white/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> {available.length} available
                </span>
              )}
            </div>
          )}
          <div>
            <p className="text-white/70 text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] mb-2">
              {showRto ? "Weekly Rentals · Rent to Own" : "Premium Weekly Rentals"}
            </p>
            <h1 className="text-white font-black leading-[1.05] text-3xl md:text-5xl lg:text-6xl" style={{ fontFamily: "var(--font-syne)" }}>
              {brand?.hero_title || "Find Your Ride"}
            </h1>
            <p className="text-white/80 text-sm md:text-base mt-3 max-w-md">{brand?.hero_subtitle || "Start earning today — get a car in minutes"}</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-xs md:text-sm font-black shadow-lg" style={{ color: brandColor }}>
            {brand?.cta_button_text || "Book Now"}
            <ChevronRight className="h-4 w-4" />
          </span>
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
      <div className="px-5 mb-6 md:mb-8 mt-2">
        {user && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Welcome back{user.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}</p>}
        <h2 className="text-2xl md:text-3xl font-black leading-tight" style={{ fontFamily: "var(--font-syne)", background: `linear-gradient(135deg, ${brandColor}, ${secondaryColor})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          {brand?.business_display_name || brand?.hero_title || "Find Your Ride"}
        </h2>
        {brand?.about_text && <p className="text-gray-500 text-sm md:text-base mt-3 max-w-2xl leading-relaxed">{brand.about_text}</p>}
      </div>

      <HostTrustPanel labels={hostLabels} rating={hostRating.rating} reviewCount={hostRating.count} completedTrips={completedTrips} />

      {/* Value props — why rent with us */}
      <div className="px-5 mb-6 md:mb-8">
        <div className="grid grid-cols-3 gap-2.5 md:gap-4">
          {[
            { icon: Zap, label: "Instant", sub: "Approval" },
            { icon: Shield, label: "No Credit", sub: "Check" },
            { icon: Clock, label: "24/7", sub: "Support" },
          ].map((item, i) => (
            <div key={i} className="rounded-2xl bg-white border border-gray-100 p-3 md:p-4 flex flex-col items-center text-center shadow-sm">
              <div className="h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center mb-1.5"
                style={{ background: `linear-gradient(135deg, ${brandColor}15, ${secondaryColor}15)` }}>
                <item.icon className="h-4 w-4 md:h-5 md:w-5" style={{ color: brandColor }} strokeWidth={2} />
              </div>
              <p className="text-xs md:text-sm font-black text-gray-900 leading-tight">{item.label}</p>
              <p className="text-[10px] md:text-xs text-gray-400 leading-tight">{item.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {reservationRequestOnly && (
        <div className="mx-5 md:mx-0 mb-6 md:mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <CreditCard className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black text-amber-900">Connect Stripe to enable instant online booking.</p>
            <p className="text-xs text-amber-700 mt-1">This storefront is live and customers can still submit reservation requests until Stripe is connected.</p>
          </div>
        </div>
      )}

      {/* Rent for Free banner */}
      {showRentForFree && <RentForFreeBanner />}

      {/* Booking type toggles */}
      <div className="px-5 mb-6 md:mb-8">
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
        <StorefrontLeadCapture brand={brand} businessSlug={businessSlug} />
      ) : (
        <BookNowVehicleGrid
          vehicles={filtered}
          isLoading={isLoading}
          location={location}
          onSelect={setSelectedVehicle}
          isExpandedRadius={false}
          reviews={reviews}
          signalSnapshots={signalSnapshots}
          presentationStyle={inventoryPresentationStyle}
        />
      )}
      </div>

      <VehicleDetailSheet
        vehicle={selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        onBook={handleBook}
        user={user}
        reviews={reviews}
        signalSnapshots={signalSnapshots}
        bookingDisabled={false}
        disabledReason=""
      />
    </div>
  );
}