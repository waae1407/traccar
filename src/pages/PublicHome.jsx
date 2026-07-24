import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getLogoHomeRoute } from "@/lib/logoHomeRoute";
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
    <div className="min-h-screen mesh-bg text-white" style={{ fontFamily: "var(--font-inter)" }}>

      {/* NAV — dark glass */}
      <header className="sticky top-0 z-40 bg-background/70 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" aria-label="Go to home" className="flex items-center gap-2 cursor-pointer">
            <img src={LOGO_ICON} alt="uRide" className="h-7 w-7 rounded-lg object-cover" />
            <span className="font-black text-white text-base tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>uRide</span>
            <span className="hidden sm:inline text-[10px] font-semibold text-white/40 ml-1 border border-white/15 px-1.5 py-0.5 rounded-full tracking-wide uppercase">Fleet Platform</span>
          </Link>
          <button
            onClick={() => base44.auth.redirectToLogin(window.location.href)}
            className="px-4 py-1.5 rounded-full text-sm font-semibold text-white border border-white/20 bg-white/5 hover:bg-white/15 transition-all"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* HERO */}
      <HomeHero />

      {/* MAIN CONTENT — dark immersive sections */}
      <div className="max-w-5xl mx-auto px-5 py-20 space-y-24">

        {/* 1. Path cards */}
        <HomePathCards />

        {/* 2. How it works */}
        <HomeHowItWorks />

      </div>

      {/* WHY DIFFERENT — elevated panel */}
      <div className="bg-card/30 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-5 py-20">
          <HomeWhyDifferent />
        </div>
      </div>

      {/* FLEET DASHBOARD VISUAL */}
      <div className="max-w-5xl mx-auto px-5 py-20">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/40 mb-2">Operational visibility</p>
        <h3 className="text-3xl font-black text-white mb-4" style={{ fontFamily: "var(--font-syne)" }}>
          Fleet Operations Dashboard
        </h3>
        <p className="text-sm text-white/55 mb-6 max-w-lg">
          uRideHub is operational infrastructure — not just listings. Hosts get real-time vehicle status, GPS tracking, payment automation, and remote controls in one dashboard.
        </p>
        <HomeFleetDashboard />
      </div>

      {/* STOREFRONT + AUTO BUSINESS — elevated */}
      <div className="bg-card/30 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-5 py-20 space-y-20">
          <HomeStorefrontSection />
          <HomeAutoBusinessSection />
        </div>
      </div>

      {/* FEATURED VEHICLES */}
      <div className="max-w-5xl mx-auto px-5 py-20">
        <HomeFeaturedVehicles />
      </div>

      {/* FINAL CTA — cinematic */}
      <div className="px-5 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="relative rounded-[2rem] overflow-hidden text-center py-20 px-6"
            style={{ background: "linear-gradient(160deg, hsl(338 90% 48%) 0%, hsl(265 80% 45%) 55%, hsl(240 70% 30%) 100%)" }}>
            <div className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
                backgroundSize: "40px 40px"
              }} />
            <div className="absolute inset-0"
              style={{ background: "radial-gradient(ellipse at 60% 30%, hsl(338 90% 56% / 0.35) 0%, transparent 60%)" }} />
            <div className="relative z-10">
              <p className="text-[11px] font-bold uppercase tracking-[0.32em] mb-4" style={{ color: "rgba(255,255,255,0.85)" }}>Get started today</p>
              <h3 className="text-4xl sm:text-5xl font-black text-white mb-3 leading-[1.05]" style={{ fontFamily: "var(--font-syne)", textShadow: "0 4px 30px rgba(0,0,0,0.4)" }}>
                Launch your rental fleet.<br />
                <span style={{ color: "rgba(255,255,255,0.92)" }}>Or get on the road today.</span>
              </h3>
              <p className="text-base mb-8 max-w-md mx-auto leading-relaxed" style={{ color: "rgba(255,255,255,0.88)" }}>
                uRideHub helps drivers access rentals while helping fleet operators build automated rental businesses.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link to="/book-now"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white text-gray-900 font-bold text-sm shadow-2xl hover:scale-[1.03] transition-transform">
                  <Car className="h-4 w-4" /> Browse Vehicles
                </Link>
                <Link to="/become-a-host"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-full font-semibold text-sm text-white border border-white/30 bg-white/5 backdrop-blur-md hover:bg-white/15 transition-colors">
                  <Building2 className="h-4 w-4" /> Become a Fleet Partner →
                </Link>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-4 text-xs text-white/40 mt-8">
            <Link to="/privacy" className="hover:text-white/70 transition-colors">Privacy</Link>
            <span>·</span>
            <Link to="/terms" className="hover:text-white/70 transition-colors">Terms</Link>
            <span>·</span>
            <span>© {new Date().getFullYear()} uRide</span>
          </div>
        </div>
      </div>

    </div>
  );
}