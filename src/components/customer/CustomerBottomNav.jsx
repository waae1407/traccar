import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, CalendarDays, Activity, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Home", icon: Home, path: "/" },
  { label: "Bookings", icon: CalendarDays, path: "/my-bookings" },
  { label: "Activity", icon: Activity, path: "/activity" },
  { label: "Account", icon: User, path: "/account" },
];

export default function CustomerBottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 safe-area-pb">
      <div className="flex items-center justify-around h-16 max-w-2xl mx-auto px-2">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path ||
            (tab.path !== "/" && location.pathname.startsWith(tab.path));
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all min-w-[60px]",
                isActive ? "text-pink-600" : "text-gray-400"
              )}
            >
              <tab.icon className={cn("h-5 w-5", isActive && "fill-pink-100")} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className={cn("text-[10px] font-semibold tracking-wide", isActive ? "text-pink-600" : "text-gray-400")}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}