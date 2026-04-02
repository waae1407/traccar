import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { cn } from "@/lib/utils";

const pageTitles = {
  "/": "Dashboard",
  "/customers": "Customers",
  "/vehicles": "Vehicles",
  "/bookings": "Bookings",
  "/payments": "Payments",
  "/rent-to-own": "Rent-to-Own Contracts",
  "/maintenance": "Maintenance",
  "/reports": "Reports",
};

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const title = pageTitles[location.pathname] || "uRide";

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <div
        className={cn(
          "transition-all duration-300",
          collapsed ? "lg:ml-[72px]" : "lg:ml-64"
        )}
      >
        <TopBar onMenuClick={() => setMobileOpen(true)} title={title} />
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}