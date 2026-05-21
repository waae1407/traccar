import React, { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Car, ArrowRight } from "lucide-react";
import StorefrontHero from "@/components/host/storefront/StorefrontHero";
import StorefrontFleetGrid from "@/components/host/storefront/StorefrontFleetGrid";
import StorefrontReviews from "@/components/host/storefront/StorefrontReviews";
import StorefrontFooter from "@/components/host/storefront/StorefrontFooter";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

export default function PublicHostStorefront() {
  const { businessSlug } = useParams();

  const { data: brands = [], isLoading: loadingBrand } = useQuery({
    queryKey: ["public-brand", businessSlug],
    queryFn: () => base44.entities.HostBrandSettings.filter({ business_slug: businessSlug }),
  });
  const brand = brands[0];

  const { data: hosts = [], isLoading: loadingHost } = useQuery({
    queryKey: ["public-host", brand?.host_id],
    queryFn: () => base44.entities.Host.filter({ id: brand.host_id }),
    enabled: !!brand?.host_id,
  });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({
    queryKey: ["public-vehicles", brand?.host_id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: brand.host_id, approval_status: "approved", status: "Available" }),
    enabled: !!brand?.host_id,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["public-reviews", brand?.host_id],
    queryFn: () => base44.entities.HostReview.filter({ host_id: brand.host_id, status: "published" }),
    enabled: !!brand?.host_id,
  });

  // Track storefront view
  useEffect(() => {
    if (host?.id) {
      base44.entities.Host.update(host.id, { storefront_views: (host.storefront_views || 0) + 1 });
    }
  }, [host?.id]);

  if (loadingBrand || loadingHost) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-pink-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Determine unavailability
  const isSuspended = brand?.moderation_status === "suspended" || host?.status === "suspended";
  const isUnavailable = isSuspended || brand?.moderation_status === "under_review";
  const isUnpublished = !brand || brand.published_status !== "live" || brand?.moderation_status === "unpublished";
  const isBookingBlocked = host?.booking_blocked;

  if (isUnavailable || isUnpublished) {
    const title = !brand
      ? "Store Not Found"
      : isSuspended
      ? "Store Temporarily Unavailable"
      : isUnavailable
      ? "Store Coming Soon"
      : "Store Coming Soon";

    const message = !brand
      ? "We couldn't find a store at this address."
      : isSuspended
      ? "This rental store is temporarily unavailable. Please check back later or browse other vehicles."
      : "This rental store is almost ready. Check back soon!";

    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center text-center px-6">
        <img src={LOGO_ICON} alt="uRide" className="h-14 w-14 rounded-2xl object-cover mb-5 shadow-lg" />
        <h1 className="text-3xl font-black text-gray-900 mb-3" style={{ fontFamily: "var(--font-syne)" }}>
          {title}
        </h1>
        <p className="text-gray-400 text-sm mb-6 max-w-sm">{message}</p>
        <Link to="/book-now" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Browse All Vehicles <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "var(--font-inter)" }}>
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {brand.logo_url
              ? <img src={brand.logo_url} alt="logo" className="h-8 w-8 rounded-xl object-cover" />
              : <div className="h-8 w-8 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: `linear-gradient(135deg, ${brand.brand_color}, ${brand.secondary_color})` }}>
                  {brand.business_display_name?.charAt(0) || "R"}
                </div>}
            <span className="font-black text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>
              {brand.business_display_name}
            </span>
          </div>
          {isBookingBlocked ? (
            <span className="px-4 py-2 rounded-full text-sm font-bold text-white/80 opacity-60 cursor-not-allowed"
              style={{ background: `linear-gradient(135deg, ${brand.brand_color}, ${brand.secondary_color})` }}>
              Currently Unavailable
            </span>
          ) : (
            <Link to={`/book-now?host_id=${host?.id}`}
              className="px-4 py-2 rounded-full text-sm font-bold text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${brand.brand_color}, ${brand.secondary_color})` }}>
              {brand.cta_button_text || "Book Now"}
            </Link>
          )}
        </div>
      </header>

      {/* Hero */}
      <StorefrontHero brand={brand} host={host} />

      {/* Fleet */}
      <StorefrontFleetGrid vehicles={vehicles} brand={brand} hostId={host?.id} />

      {/* About */}
      {brand.about_text && (
        <section className="py-16 px-5 max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-black text-gray-900 mb-5" style={{ fontFamily: "var(--font-syne)" }}>About Us</h2>
          <p className="text-gray-500 text-base leading-relaxed">{brand.about_text}</p>
          {/* Badges */}
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {host?.badge_top_earner && <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-yellow-50 border border-yellow-200 text-yellow-700">🏆 Top Earner</span>}
            {host?.badge_fleet_first && <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-blue-50 border border-blue-200 text-blue-700">🚗 Fleet First</span>}
            {host?.badge_five_star && <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-pink-50 border border-pink-200 text-pink-700">⭐ 5-Star Host</span>}
            {host?.badge_av_pioneer && <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-violet-50 border border-violet-200 text-violet-700">⚡ AV Pioneer</span>}
            {host?.badge_compliance_king && <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">🛡️ Compliance King</span>}
          </div>
        </section>
      )}

      {/* Reviews */}
      {brand.show_reviews && <StorefrontReviews reviews={reviews} brand={brand} />}

      <StorefrontFooter brand={brand} host={host} />
    </div>
  );
}