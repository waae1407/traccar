import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import HomeTopBar from "@/components/customer/HomeTopBar";
import BookingSearchBar from "@/components/customer/BookingSearchBar";
import QuickActions from "@/components/customer/QuickActions";
import PopularVehicles from "@/components/customer/PopularVehicles";
import RtoBanner from "@/components/customer/RtoBanner";
import RecommendedVehicles from "@/components/customer/RecommendedVehicles";
import CityInsightCard from "@/components/customer/CityInsightCard";
import VehicleDetailSheet from "@/components/customer/VehicleDetailSheet";

export default function BookNow() {
  const context = useOutletContext() || {};
  const { user, city = "", setCity } = context;

  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [bookingType, setBookingType] = useState("Weekly");

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles-public"],
    queryFn: () => base44.entities.Vehicle.list(),
    staleTime: 60_000,
  });

  const available = vehicles.filter((v) => v.status === "Available");
  const byCity = city ? available.filter((v) => v.current_city?.toLowerCase().includes(city.toLowerCase())) : available;
  const displayVehicles = byCity.length > 0 ? byCity : available;
  const rtoEligible = vehicles.filter((v) => v.rent_to_own_eligible && v.status === "Available");

  const handleBook = (vehicle) => {
    setSelectedVehicle(null);
    alert(`Booking flow for ${vehicle.year} ${vehicle.make} ${vehicle.model} — coming soon!`);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Top Bar */}
      <HomeTopBar user={user} city={city} onCityChange={() => {}} />

      {/* Hero + Search */}
      <div
        className="relative px-4 pt-5 pb-16"
        style={{ background: "linear-gradient(150deg, #1a0a12 0%, #130920 60%, #0d0718 100%)" }}
      >
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 h-56 w-56 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(338 90% 56% / 0.18) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(265 80% 62% / 0.12) 0%, transparent 70%)" }} />

        {/* Greeting */}
        <div className="relative mb-5">
          {user ? (
            <>
              <p className="text-pink-400/80 text-sm font-medium">Good day,</p>
              <h1 className="text-white text-[26px] font-bold leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
                {user.full_name?.split(" ")[0]} 👋
              </h1>
            </>
          ) : (
            <>
              <p className="text-pink-400/80 text-sm">Premium rentals, your way</p>
              <h1 className="text-white text-[26px] font-bold leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
                Find Your Ride 🚗
              </h1>
            </>
          )}
          <p className="text-white/35 text-xs mt-1">Daily · Weekly · Monthly · Rent-to-Own</p>
        </div>

        {/* Floating Search Bar */}
        <BookingSearchBar
          bookingType={bookingType}
          onBookingTypeChange={setBookingType}
          onTap={() => {}}
        />
      </div>

      {/* Quick Actions */}
      <div className="-mt-2 bg-white pt-5 pb-1 shadow-sm">
        <QuickActions onSelect={setBookingType} />
      </div>

      {/* Popular Near You */}
      <PopularVehicles
        vehicles={displayVehicles}
        isLoading={isLoading}
        city={city}
        onSelect={setSelectedVehicle}
      />

      {/* RTO Banner */}
      {rtoEligible.length > 0 && <RtoBanner count={rtoEligible.length} />}

      {/* Recommended */}
      <RecommendedVehicles
        vehicles={[...available].sort((a, b) => (a.weekly_rate || 9999) - (b.weekly_rate || 9999)).slice(0, 6)}
        isLoading={isLoading}
        user={user}
        onSelect={setSelectedVehicle}
      />

      {/* City Insight */}
      <CityInsightCard vehicles={available} city={city} />

      {/* Vehicle sheet */}
      <VehicleDetailSheet
        vehicle={selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        onBook={handleBook}
        user={user}
      />
    </div>
  );
}