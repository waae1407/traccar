import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { MapPin, ChevronDown, Bell, User, LogIn } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getLogoHomeRoute } from "@/lib/logoHomeRoute";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

export default function CustomerTopBar({ user, city, onCityChange }) {
  const navigate = useNavigate();

  // Minimal query — only fetches one booking, only for customers
  const { data: activeBookings = [] } = useQuery({
    queryKey: ["logo-active-booking", user?.id],
    queryFn: () => base44.entities.BookingRequest.filter(
      { user_id: user.id },
      "-updated_date",
      5
    ),
    enabled: !!user?.id && user?.role !== "admin" && user?.role !== "host",
    staleTime: 60_000,
  });
  const activeBooking = activeBookings.find(b =>
    ["approved","active","confirmed","payment_due","grace_period","return_pending_host_review","under_review"].includes(b.booking_status)
  ) || null;
  const logoRoute = getLogoHomeRoute(user, activeBooking);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="w-full max-w-2xl mx-auto px-5 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to={logoRoute} aria-label="Go to home" className="flex items-center gap-2 cursor-pointer">
          <img src={LOGO_ICON} alt="uRide" className="h-8 w-8 rounded-xl object-cover" />
          <span className="font-bold text-gray-900 text-lg tracking-tight">uRide</span>
        </Link>

        {/* City selector */}
        <button
          onClick={onCityChange}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          <MapPin className="h-3.5 w-3.5 text-pink-600" />
          <span className="text-sm font-semibold text-gray-700">{city || "Select City"}</span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </button>

        {/* Account */}
        <div className="flex items-center gap-2">
          <button className="relative h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <Bell className="h-5 w-5 text-gray-500" />
          </button>
          {user ? (
            <Link to="/account">
              <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                {user.full_name?.charAt(0) || "U"}
              </div>
            </Link>
          ) : (
            <Link to="/account" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 transition-colors">
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}