import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import HomeHero from "@/components/home/HomeHero";
import HomePathCards from "@/components/home/HomePathCards";
import HomeHowItWorks from "@/components/home/HomeHowItWorks";
import HomeWhyDifferent from "@/components/home/HomeWhyDifferent";
import HomeFleetDashboard from "@/components/home/HomeFleetDashboard";
import HomeStorefrontSection from "@/components/home/HomeStorefrontSection";
import HomeAutoBusinessSection from "@/components/home/HomeAutoBusinessSection";
import HomeFeaturedVehicles from "@/components/home/HomeFeaturedVehicles";
import { ArrowRight, Building2, Car } from "lucide-react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";
const ACTIVE_RENTAL_STATUSES = ["active", "approved", "confirmed", "payment_due", "grace_period", "return_pending_host_review", "under_review"];

function hasActiveRental(bookings = []) {
  return bookings.some((booking) => {
    if (!ACTIVE_RENTAL_STATUSES.includes(booking.booking_status) || booking.rental_ended_at) return false;
    if (booking.end_date && Date.now() > new Date(`${booking.end_date}T23:59:59`).getTime()) return false;
    return true;
  });
}

export default function PublicHome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const routeCustomer = async () => {
      if (user?.role === "admin") navigate("/dashboard", { replace: true });
      else if (user?.role === "host") navigate("/host/dashboard", { replace: true });
      else if (user?.email) {
        const bookings = await base44.entities.BookingRequest.filter({ user_email: user.email });
        if (!cancelled) navigate(hasActiveRental(bookings) ? "/vehicle-command-center" : "/book-now", { replace: true });
      }
    };
    routeCustomer();
    return () => { cancelled = true; };
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "var(--font-inter)" }}>

      {/* NAV */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGO_ICON} alt="uRide" className="h-7 w-7 rounded-lg object-cover" />
            <span className="font-black text-gray-900 text-base tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>uRide</span>
            <span className="hidden sm:inline text-[10px] font-semibold text-gray-300 ml-1 border border-gray-200 px-1.5 py-0.5 rounded-full tracking-wide uppercase">Fleet Platform</span>
          </div>
          <button
            onClick={() => base44.auth.redirectToLogin(window.location.href)}
            className="px-4 py-1.5 rounded-full text-sm font-semibold text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 transition-all"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* HERO */}
      <HomeHero />

      {/* MAIN CONTENT — white bg sections */}
      <div className="bg-white">
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-12">

          {/* 1. Path cards — driver vs fleet owner */}
          <HomePathCards />

          {/* 2. How it works */}
          <HomeHowItWorks />

        </div>
      </div>

      {/* WHY DIFFERENT — slightly tinted bg */}
      <div className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <HomeWhyDifferent />
        </div>
      </div>

      {/* FLEET DASHBOARD VISUAL */}
      <div className="bg-white">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Operational visibility</p>
          <h3 className="text-lg font-black text-gray-900 mb-4" style={{ fontFamily: "var(--font-syne)" }}>
            Fleet Operations Dashboard
          </h3>
          <p className="text-sm text-gray-500 mb-5 max-w-lg">
            uRideHub is operational infrastructure — not just listings. Hosts get real-time vehicle status, GPS tracking, payment automation, and remote controls in one dashboard.
          </p>
          <HomeFleetDashboard />
        </div>
      </div>

      {/* STOREFRONT + AUTO BUSINESS — tinted */}
      <div className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">
          <HomeStorefrontSection />
          <HomeAutoBusinessSection />
        </div>
      </div>

      {/* FEATURED VEHICLES */}
      <div className="bg-white">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <HomeFeaturedVehicles />
        </div>
      </div>

      {/* FINAL CTA */}
      <div className="px-4 pb-12 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-2xl overflow-hidden relative text-center py-12 px-6"
            style={{ background: "linear-gradient(160deg, hsl(338 90% 48%) 0%, hsl(265 80% 45%) 55%, hsl(240 70% 35%) 100%)" }}>
            <div className="absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
                backgroundSize: "32px 32px"
              }} />
            <div className="absolute inset-0"
              style={{ background: "radial-gradient(ellipse at 60% 40%, hsl(338 90% 56% / 0.3) 0%, transparent 60%)" }} />
            <div className="relative z-10">
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.92)" }}>Get started today</p>
              <h3 className="text-2xl sm:text-3xl font-black text-white mb-2 leading-tight" style={{ fontFamily: "var(--font-syne)", textShadow: "0 2px 12px rgba(0,0,0,0.25)" }}>
                Launch your rental fleet.<br />
                <span style={{ color: "rgba(255,255,255,0.95)" }}>Or get on the road today.</span>
              </h3>
              <p className="text-sm mb-7 max-w-sm mx-auto leading-relaxed" style={{ color: "rgba(255,255,255,0.92)" }}>
                uRideHub helps drivers access rentals while helping fleet operators build automated rental businesses.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link to="/book-now"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white text-gray-900 font-bold text-sm shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
                  <Car className="h-4 w-4" /> Browse Vehicles
                </Link>
                <Link to="/become-a-host"
                   className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm hover:bg-white/15 transition-all" style={{ border: "1px solid rgba(255,255,255,0.45)", color: "#ffffff" }}>
                   <Building2 className="h-4 w-4" /> Become a Fleet Partner →
                </Link>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-4 text-xs text-gray-300 mt-6">
            <Link to="/privacy" className="hover:text-gray-500 transition-colors">Privacy</Link>
            <span>·</span>
            <Link to="/terms" className="hover:text-gray-500 transition-colors">Terms</Link>
            <span>·</span>
            <span>© {new Date().getFullYear()} uRide</span>
          </div>
        </div>
      </div>

    </div>
  );
}