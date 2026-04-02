import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { cn } from "@/lib/utils";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen mesh-bg">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />
      <div className={cn("transition-all duration-300 ease-in-out", collapsed ? "lg:ml-[72px]" : "lg:ml-64")}>
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <main className="p-4 md:p-6 lg:p-8 min-h-[calc(100vh-70px)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}