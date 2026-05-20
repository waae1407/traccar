import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import HomeHero from "@/components/home/HomeHero";
import HomePathCards from "@/components/home/HomePathCards";
import HomeStorefrontSection from "@/components/home/HomeStorefrontSection";
import HomeAutoBusinessSection from "@/components/home/HomeAutoBusinessSection";
import HomeWhyDifferent from "@/components/home/HomeWhyDifferent";
import HomeFeaturedVehicles from "@/components/home/HomeFeaturedVehicles";
import { ArrowRight } from "lucide-react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

export default function PublicHome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === "admin") navigate("/dashboard", { replace: true });
    else if (user?.role === "host") navigate("/host/dashboard", { replace: true });
    else if (user) navigate("/book-now", { replace: true });
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "var(--font-inter)" }}>
      {/* NAV */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGO_ICON} alt="uRide" className="h-7 w-7 rounded-lg object-cover" />
            <span className="font-black text-gray-900 text-base tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>uRide</span>
          </div>
          <button
            onClick={() => base44.auth.redirectToLogin(window.location.href)}
            className="px-4 py-1.5 rounded-full text-sm font-bold text-white shadow-sm"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
          >
            Sign In
          </button>
        </div>
      </header>

      {/* HERO */}
      <HomeHero />

      {/* MAIN CONTENT */}
      <div className="max-w-3xl mx-auto px-4 pb-16 mt-6 space-y-10">

        {/* 1. Path cards */}
        <HomePathCards />

        {/* 2. Storefront section */}
        <HomeStorefrontSection />

        {/* 3. Auto business section */}
        <HomeAutoBusinessSection />

        {/* 4. Why different */}
        <HomeWhyDifferent />

        {/* 5. Featured vehicles */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-1">Available Now</p>
          <HomeFeaturedVehicles />
        </div>

        {/* 6. Final CTA */}
        <div className="rounded-2xl text-center py-10 px-6 overflow-hidden relative"
          style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #1a1040 100%)" }}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 60% 40%, hsl(338 90% 56% / 0.3) 0%, transparent 60%)" }} />
          <div className="relative z-10">
            <h3 className="text-2xl font-black text-white mb-2" style={{ fontFamily: "var(--font-syne)" }}>
              Ready to get started?
            </h3>
            <p className="text-white/60 text-sm mb-6">
              Find a vehicle or launch your rental business today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/book-now"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3 rounded-2xl bg-white text-gray-900 font-bold text-sm shadow-lg">
                Browse Available Cars <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/become-a-host"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3 rounded-2xl border border-white/30 text-white font-bold text-sm hover:bg-white/10 transition-all">
                Become a Host <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-4 text-xs text-gray-300 pt-2">
          <Link to="/privacy" className="hover:text-gray-500 transition-colors">Privacy</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-gray-500 transition-colors">Terms</Link>
          <span>·</span>
          <span>© {new Date().getFullYear()} uRide</span>
        </div>
      </div>
    </div>
  );
}