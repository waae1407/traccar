import React, { useState } from "react";
import { Menu, Search, Bell, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocation } from "react-router-dom";

const pageMeta = {
  "/dashboard": { title: "Dashboard", subtitle: "Fleet overview & analytics" },
  "/customers": { title: "Customers", subtitle: "Manage your customer base" },
  "/vehicles": { title: "Vehicles", subtitle: "Fleet inventory & status" },
  "/bookings-admin": { title: "Bookings", subtitle: "Active & upcoming rentals" },
  "/payments": { title: "Payments", subtitle: "Revenue & payment tracking" },
  "/rent-to-own": { title: "Rent-to-Own", subtitle: "Ownership contracts" },
  "/maintenance": { title: "Maintenance", subtitle: "Service logs & schedules" },
  "/reports": { title: "Reports", subtitle: "Performance analytics" },
};

export default function TopBar({ onMenuClick }) {
  const [searchQuery, setSearchQuery] = useState("");
  const location = useLocation();
  const meta = pageMeta[location.pathname] || { title: "uRide", subtitle: "" };

  return (
    <header className="h-[70px] flex items-center justify-between px-4 md:px-6 sticky top-0 z-30 border-b border-white/[0.06]"
      style={{ background: "hsl(222 28% 7% / 0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
      
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="lg:hidden text-white/60 hover:text-white hover:bg-white/10" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="hidden sm:block">
          <h1 className="text-lg font-syne font-bold text-white leading-tight">{meta.title}</h1>
          <p className="text-[11px] text-white/35 leading-none mt-0.5">{meta.subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            placeholder="Search name, VIN, phone..."
            className="pl-9 pr-4 h-9 w-64 rounded-xl text-sm bg-white/[0.06] border border-white/[0.08] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <button className="relative h-9 w-9 rounded-xl flex items-center justify-center bg-white/[0.06] border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/10 transition-all group">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-primary rounded-full shadow-[0_0_6px_hsl(338_90%_56%/0.8)] animate-pulse-glow" />
        </button>

        <button className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-xl bg-gradient-to-r from-primary/20 to-purple-500/20 border border-primary/30 text-primary text-xs font-medium hover:from-primary/30 hover:to-purple-500/30 transition-all">
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI Insights</span>
        </button>
      </div>
    </header>
  );
}