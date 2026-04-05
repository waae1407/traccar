import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import CustomerBottomNav from "./CustomerBottomNav";
import CustomerTopBar from "./CustomerTopBar";
import { useAuth } from "@/lib/AuthContext";

export default function CustomerLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const isBookNow = location.pathname === "/book-now";
  const [city, setCity] = useState(user?.preferred_city || "");

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "var(--font-inter)" }}>
      {!isBookNow && <CustomerTopBar user={user} city={city} onCityChange={() => {}} />}
      <main className="w-full max-w-screen-xl mx-auto pb-20 md:pb-8 md:px-8 lg:px-16">
        <Outlet context={{ user, city, setCity }} />
      </main>
      {/* Bottom nav only on mobile */}
      <div className="md:hidden">
        <CustomerBottomNav />
      </div>
    </div>
  );
}