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
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "var(--font-inter)" }}>
      {!isBookNow && <CustomerTopBar user={user} city={city} onCityChange={() => {}} />}
      <main className="w-full max-w-2xl mx-auto pb-24 md:pb-12">
        <Outlet context={{ user, city, setCity }} />
      </main>
      {/* Bottom nav only on mobile */}
      <div className="md:hidden">
        <CustomerBottomNav />
      </div>
    </div>
  );
}