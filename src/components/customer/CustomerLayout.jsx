import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import CustomerBottomNav from "./CustomerBottomNav";
import CustomerTopBar from "./CustomerTopBar";
import { useAuth } from "@/lib/AuthContext";
import CityPicker from "./CityPicker";

export default function CustomerLayout() {
  const { user } = useAuth();
  const [city, setCity] = useState(user?.preferred_city || "");
  const [cityPickerOpen, setCityPickerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "var(--font-inter)" }}>
      <CustomerTopBar user={user} city={city} onCityChange={() => setCityPickerOpen(true)} />
      <main className="max-w-lg mx-auto pb-20">
        <Outlet context={{ user, city, setCity }} />
      </main>
      <CustomerBottomNav />
      <CityPicker
        open={cityPickerOpen}
        onClose={() => setCityPickerOpen(false)}
        onSelect={(c) => setCity(c)}
        selected={city}
      />
    </div>
  );
}