import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Car, Home, MessageSquare, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const ACTIVE_RENTAL_STATUSES = ["active", "approved", "confirmed", "payment_due", "grace_period", "return_pending_host_review", "under_review"];

function hasActiveRental(bookings = []) {
  return bookings.some((booking) => {
    if (!ACTIVE_RENTAL_STATUSES.includes(booking.booking_status) || booking.rental_ended_at) return false;
    if (booking.end_date && Date.now() > new Date(`${booking.end_date}T23:59:59`).getTime()) return false;
    return true;
  });
}

export default function CustomerBottomNav() {
  const location = useLocation();
  const { user } = useAuth();

  const { data: bookings = [] } = useQuery({
    queryKey: ["customer-bottom-nav-bookings", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user.email }),
    enabled: !!user?.email,
    staleTime: 30_000,
  });

  const activeRental = hasActiveRental(bookings);
  const tabs = [
    activeRental
      ? { label: "My Vehicle", icon: Car, path: "/vehicle-command-center" }
      : { label: "Home", icon: Home, path: "/" },
    { label: "Book Now", icon: Search, path: "/book-now" },
    { label: "Messages", icon: MessageSquare, path: "/messages" },
    { label: "Notifications", icon: Bell, path: "/activity" },
    { label: "Account", icon: User, path: "/account" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
      <div className="flex h-[72px] w-full max-w-2xl items-center justify-around px-1 mx-auto">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path || (tab.path !== "/" && location.pathname.startsWith(tab.path));
          return (
            <Link key={tab.path} to={tab.path} className={cn("relative flex min-w-[58px] flex-col items-center gap-1 rounded-2xl px-1 py-2 transition-all", isActive ? "text-pink-600" : "text-gray-400 hover:text-gray-600")}>
              {isActive && <span className="absolute top-1 inset-x-2 h-0.5 rounded-full" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} />}
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl transition-all", isActive ? "bg-pink-50" : "")}>
                <tab.icon className={cn("h-[18px] w-[18px]", isActive ? "text-pink-600" : "text-gray-400")} strokeWidth={isActive ? 2.5 : 1.8} />
              </div>
              <span className={cn("text-[9px] font-bold leading-none tracking-tight", isActive ? "text-pink-600" : "text-gray-400")}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}