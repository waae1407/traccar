import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useEffect } from "react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

export default function PublicHome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === "admin") navigate("/dashboard", { replace: true });
    else if (user) navigate("/book-now", { replace: true });
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <img src={LOGO_ICON} alt="uRide" className="h-8 w-8 rounded-full" />
          <span className="font-bold text-lg" style={{ fontFamily: "var(--font-syne, sans-serif)" }}>uRide</span>
        </div>
        <button
          onClick={() => window.location.href = "/book-now"}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          Get Started
        </button>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <img src={LOGO_ICON} alt="uRide" className="h-20 w-20 rounded-2xl mb-6 shadow-xl" />
        <h1 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: "var(--font-syne, sans-serif)" }}>
          Rent a Car.<br />Drive Your Way.
        </h1>
        <p className="text-white/50 text-lg max-w-md mb-8">
          Flexible weekly rentals and rent-to-own programs. No credit checks. Get on the road today.
        </p>
        <button
          onClick={() => window.location.href = "/book-now"}
          className="px-8 py-4 rounded-2xl text-base font-bold text-white shadow-lg"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          Browse Vehicles
        </button>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-white/40">
        <p>© {new Date().getFullYear()} uRide. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
        </div>
      </footer>
    </div>
  );
}