import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Car, ArrowRight, MapPin, Calendar, Loader } from "lucide-react";
import { format } from "date-fns";

export default function HomeFeaturedVehicles() {
  const [searchParams, setSearchParams] = useState(null);
  const [shouldLoad, setShouldLoad] = useState(false);

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
          <Loader className="h-4 w-4 text-white/40 animate-spin" />
          <p className="text-sm text-white/50">
            {isSearchMode ? "Finding available vehicles…" : "Loading featured vehicles…"}
          </p>
        </div>
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <div id="home-featured-vehicles">
        <div className="rounded-3xl border border-dashed border-white/15 glass py-12 text-center">
          <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3">
            <Car className="h-5 w-5 text-white/30" />
          </div>
          {isSearchMode ? (
            <>
              <p className="text-sm font-semibold text-white/60">No vehicles available for your dates.</p>
              <p className="text-xs text-white/35 mt-1">Try different dates or a wider search.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-white/60">Approved vehicles will appear here soon.</p>
              <p className="text-xs text-white/35 mt-1">Fleet partners are onboarding now.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="home-featured-vehicles">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/40 mb-1">
            {isSearchMode ? "Search Results" : "Available Now"}
          </p>
          <h3 className="text-3xl font-black text-white" style={{ fontFamily: "var(--font-syne)" }}>
            {isSearchMode ? "Available for Your Dates" : "Featured Weekly Rentals"}
          </h3>
          {isSearchMode && searchParams?.city && (
            <p className="text-xs text-white/45 mt-1 flex items-center gap-1">
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
          className="text-xs font-bold text-pink-400 flex items-center gap-1 hover:underline"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {vehicles.slice(0, 6).map((v) => (
          <Link
            to={isSearchMode && searchParams
              ? `/book-now?city=${searchParams.city || ""}&pickup_date=${searchParams.pickupDate}&return_date=${searchParams.returnDate}${searchParams.vehicleType ? `&vehicle_type=${searchParams.vehicleType}` : ""}`
              : "/book-now"
            }
            key={v.id}
            className="rounded-3xl glass glass-hover overflow-hidden transition-all group"
          >
            <div className="relative">
              {v.image_url ? (
                <img src={v.image_url} alt={`${v.make} ${v.model}`} className="w-full h-32 object-cover group-hover:scale-[1.04] transition-transform" loading="lazy" />
              ) : (
                <div className="w-full h-32 flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(265 30% 18%) 0%, hsl(338 30% 18%) 100%)" }}>
                  <Car className="h-8 w-8 text-white/25" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute top-2.5 left-2.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[9px] font-bold backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Available
                </span>
              </div>
              {v.instant_booking_enabled !== false && (
                <div className="absolute top-2.5 right-2.5">
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500/90 text-white text-[8px] font-bold backdrop-blur-sm">
                    ⚡ Instant
                  </span>
                </div>
              )}
            </div>

            <div className="p-4">
              <p className="text-sm font-bold text-white truncate leading-tight">{v.year} {v.make} {v.model}</p>
              {v.city && (
                <p className="text-[11px] text-white/45 flex items-center gap-0.5 mt-1">
                  <MapPin className="h-3 w-3" />{v.city}{v.state ? `, ${v.state}` : ""}
                  {v.distance !== undefined && <span className="ml-1 text-white/30">· {v.distance} mi</span>}
                </p>
              )}
              {v.weekly_rate ? (
                <p className="text-xl font-black mt-2 gradient-text" style={{ fontFamily: "var(--font-syne)" }}>
                  ${v.weekly_rate}<span className="text-[11px] font-normal text-white/40">/wk</span>
                </p>
              ) : null}

              <div className="flex gap-1.5 mt-3 flex-wrap">
                {v.contactless_pickup && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-semibold bg-white/8 text-sky-300 border border-white/10">
                    Contactless
                  </span>
                )}
                {v.delivery_available && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-semibold bg-white/8 text-emerald-300 border border-white/10">
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