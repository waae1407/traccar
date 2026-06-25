import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Car, ArrowRight, MapPin, Calendar, Loader } from "lucide-react";
import { format } from "date-fns";

export default function HomeFeaturedVehicles() {
  const [searchParams, setSearchParams] = useState(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  // Read URL params for search-aware behavior
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const city = params.get("city");
    const pickupDate = params.get("pickup_date");
    const returnDate = params.get("return_date");
    const vehicleType = params.get("vehicle_type");

    if (pickupDate && returnDate) {
      setSearchParams({ city, pickupDate, returnDate, vehicleType });
      setShouldLoad(true);
    } else {
      // Lazy-load: only load featured vehicles when scrolled into view
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
          }
        },
        { rootMargin: "200px" }
      );
      const el = document.getElementById("home-featured-vehicles");
      if (el) observer.observe(el);
      else setShouldLoad(true);
      return () => observer.disconnect();
    }
  }, []);

  // Search-aware query: use searchMarketplaceVehicles when dates present
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ["home-featured-search", searchParams],
    queryFn: () =>
      base44.functions
        .invoke("searchMarketplaceVehicles", {
          location: searchParams?.city ? { city: searchParams.city } : null,
          pickup_date: searchParams?.pickupDate || null,
          return_date: searchParams?.returnDate || null,
          vehicle_type: searchParams?.vehicleType ? [searchParams.vehicleType] : null,
          sort: "recommended",
          limit: 6,
          skip: 0,
        })
        .then((r) => r.data),
    enabled: !!searchParams && shouldLoad,
  });

  // Lazy-loaded featured vehicles (no search)
  const { data: featuredVehicles = [], isLoading: featuredLoading } = useQuery({
    queryKey: ["home-featured-vehicles"],
    queryFn: async () => {
      const [vehicleRows, profiles, plans] = await Promise.all([
        base44.entities.Vehicle.filter({ status: "Available", approval_status: "approved" }, "-created_date", 30),
        base44.entities.HostCommerceProfile.list("-updated_date", 500),
        base44.entities.OperatorPlanConfiguration.list("-updated_date", 500),
      ]);
      const visibilityByHost = plans.reduce((map, plan) => {
        if (!plan.host_id || map[plan.host_id] !== undefined) return map;
        map[plan.host_id] = plan.marketplace_enabled !== false;
        return map;
      }, {});
      profiles.forEach((profile) => {
        if (!profile.host_id) return;
        visibilityByHost[profile.host_id] = profile.marketplace_enabled !== false && profile.marketplace_visibility !== false;
      });
      return vehicleRows.filter((vehicle) => visibilityByHost[vehicle.host_id] !== false).slice(0, 6);
    },
    enabled: !searchParams && shouldLoad,
  });

  const isSearchMode = !!searchParams;
  const vehicles = isSearchMode ? searchResults?.vehicles || [] : featuredVehicles;
  const isLoading = isSearchMode ? searchLoading : featuredLoading;

  if (!shouldLoad) {
    return <div id="home-featured-vehicles" className="h-10" />;
  }

  if (isLoading) {
    return (
      <div id="home-featured-vehicles">
        <div className="flex items-center gap-2 mb-4">
          <Loader className="h-4 w-4 text-gray-400 animate-spin" />
          <p className="text-sm text-gray-400">
            {isSearchMode ? "Finding available vehicles…" : "Loading featured vehicles…"}
          </p>
        </div>
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <div id="home-featured-vehicles">
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-10 text-center">
          <div className="h-12 w-12 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center mx-auto mb-3">
            <Car className="h-5 w-5 text-gray-300" />
          </div>
          {isSearchMode ? (
            <>
              <p className="text-sm font-semibold text-gray-400">No vehicles available for your dates.</p>
              <p className="text-xs text-gray-300 mt-1">Try different dates or a wider search.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-400">Approved vehicles will appear here soon.</p>
              <p className="text-xs text-gray-300 mt-1">Fleet partners are onboarding now.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="home-featured-vehicles">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
            {isSearchMode ? "Search Results" : "Available Now"}
          </p>
          <h3 className="text-lg font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>
            {isSearchMode ? "Available for Your Dates" : "Featured Weekly Rentals"}
          </h3>
          {isSearchMode && searchParams?.city && (
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {searchParams.city}
              {searchParams.pickupDate && (
                <>
                  <Calendar className="h-3 w-3 ml-2" />
                  {format(new Date(searchParams.pickupDate), "MMM d")}
                  {searchParams.returnDate && ` → ${format(new Date(searchParams.returnDate), "MMM d")}`}
                </>
              )}
            </p>
          )}
        </div>
        <Link
          to={isSearchMode && searchParams
            ? `/book-now?city=${searchParams.city || ""}&pickup_date=${searchParams.pickupDate}&return_date=${searchParams.returnDate}${searchParams.vehicleType ? `&vehicle_type=${searchParams.vehicleType}` : ""}`
            : "/book-now"
          }
          className="text-xs font-bold text-pink-600 flex items-center gap-1 hover:underline"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {vehicles.slice(0, 6).map((v) => (
          <Link
            to={isSearchMode && searchParams
              ? `/book-now?city=${searchParams.city || ""}&pickup_date=${searchParams.pickupDate}&return_date=${searchParams.returnDate}${searchParams.vehicleType ? `&vehicle_type=${searchParams.vehicleType}` : ""}`
              : "/book-now"
            }
            key={v.id}
            className="rounded-2xl border border-gray-100 bg-white overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all group"
          >
            {/* Image */}
            <div className="relative">
              {v.image_url ? (
                <img src={v.image_url} alt={`${v.make} ${v.model}`} className="w-full h-28 object-cover group-hover:scale-[1.02] transition-transform" loading="lazy" />
              ) : (
                <div className="w-full h-28 flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(265 20% 94%) 0%, hsl(338 20% 94%) 100%)" }}>
                  <Car className="h-8 w-8 text-gray-300" />
                </div>
              )}
              {/* Availability badge */}
              <div className="absolute top-2 left-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[9px] font-bold backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Available
                </span>
              </div>
              {/* Instant booking badge */}
              {v.instant_booking_enabled !== false && (
                <div className="absolute top-2 right-2">
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500/90 text-white text-[8px] font-bold backdrop-blur-sm">
                    ⚡ Instant
                  </span>
                </div>
              )}
            </div>

            {/* Card body */}
            <div className="p-3">
              <p className="text-xs font-bold text-gray-900 truncate leading-tight">{v.year} {v.make} {v.model}</p>
              {v.city && (
                <p className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5">
                  <MapPin className="h-2.5 w-2.5" />{v.city}{v.state ? `, ${v.state}` : ""}
                  {v.distance !== undefined && <span className="ml-1 text-gray-300">· {v.distance} mi</span>}
                </p>
              )}
              {v.weekly_rate ? (
                <p className="text-base font-black mt-1.5" style={{ fontFamily: "var(--font-syne)", background: "linear-gradient(135deg, hsl(338 90% 50%), hsl(265 80% 55%))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  ${v.weekly_rate}<span className="text-[10px] font-normal" style={{ WebkitTextFillColor: "#9ca3af" }}>/wk</span>
                </p>
              ) : null}

              {/* Feature badges */}
              <div className="flex gap-1 mt-2 flex-wrap">
                {v.contactless_pickup && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                    Contactless
                  </span>
                )}
                {v.delivery_available && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100">
                    Delivery
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}