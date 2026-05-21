import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, CalendarDays, Activity, User, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Home", icon: Home, path: "/" },
  { label: "Bookings", icon: CalendarDays, path: "/my-bookings" },
  { label: "Activity", icon: Activity, path: "/activity" },
  { label: "Messages", icon: MessageSquare, path: "/messages" },
  { label: "Account", icon: User, path: "/account" },
];

export default function CustomerBottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
      <div className="flex items-center justify-around h-[72px] w-full max-w-2xl mx-auto px-1">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path ||
            (tab.path !== "/" && location.pathname.startsWith(tab.path));
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all min-w-[60px] relative",
                isActive ? "text-pink-600" : "text-gray-400 hover:text-gray-600"
              )}
            >
              {isActive && (
                <span className="absolute top-1 inset-x-2 h-0.5 rounded-full" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} />
              )}
              <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center transition-all", isActive ? "bg-pink-50" : "")}>
                <tab.icon className={cn("h-[18px] w-[18px]", isActive ? "text-pink-600" : "text-gray-400")} strokeWidth={isActive ? 2.5 : 1.8} />
              </div>
              <span className={cn("text-[10px] font-bold tracking-wide leading-none", isActive ? "text-pink-600" : "text-gray-400")}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}