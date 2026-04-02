import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import BookingSearchBox from "@/components/customer/BookingSearchBox";
import ServiceCards from "@/components/customer/ServiceCards";
import VehicleCarousel from "@/components/customer/VehicleCarousel";
import PromoBanner from "@/components/customer/PromoBanner";
import VehicleDetailSheet from "@/components/customer/VehicleDetailSheet";
import { Sparkles } from "lucide-react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

export default function BookNow() {
  const context = useOutletContext() || {};
  const { user, city = "", setCity } = context;

  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [searchParams, setSearchParams] = useState(null);
  const [bookingType, setBookingType] = useState("Weekly");

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles-public"],
    queryFn: () => base44.entities.Vehicle.list(),
  });

  const available = vehicles.filter((v) => v.status === "Available");
  const rtoEligible = vehicles.filter((v) => v.rent_to_own_eligible && v.status === "Available");
  const byCity = city ? available.filter((v) => v.current_city?.toLowerCase().includes(city.toLowerCase())) : available;
  const displayVehicles = byCity.length > 0 ? byCity : available;

  const handleSearch = (params) => {
    setSearchParams(params);
    setBookingType(params.bookingType);
  };

  const handleBook = (vehicle) => {
    setSelectedVehicle(null);
    // TODO: open full booking flow
    alert(`Booking flow for ${vehicle.year} ${vehicle.make} ${vehicle.model} — coming next!`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero banner */}
      <div className="relative px-4 pt-5 pb-12"
        style={{ background: "linear-gradient(160deg, hsl(338 90% 18%) 0%, hsl(265 80% 20%) 100%)" }}>
        {/* Radial glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 h-48 w-48 rounded-full"
            style={{ background: "radial-gradient(circle, hsl(338 90% 56% / 0.25) 0%, transparent 70%)" }} />
        </div>

        {user ? (
          <div className="relative mb-1">
            <p className="text-pink-300 text-sm font-medium">Welcome back,</p>
            <h1 className="text-white text-2xl font-bold font-syne">{user.full_name?.split(" ")[0]} 👋</h1>
          </div>
        ) : (
          <div className="relative mb-1">
            <p className="text-pink-300/80 text-sm">Premium car rentals, your way</p>
            <h1 className="text-white text-2xl font-bold font-syne">Find Your Ride 🚗</h1>
          </div>
        )}
        <p className="text-white/50 text-xs mt-1 relative">Daily · Weekly · Monthly · Rent-to-Own</p>
      </div>

      {/* Search box floats over hero */}
      <BookingSearchBox
        onSearch={handleSearch}
        city={city}
        setCity={setCity}
      />

      {/* Service cards */}
      <ServiceCards onSelect={(type) => setBookingType(type)} />

      {/* Promo banner */}
      <PromoBanner />

      {/* Available now */}
      <VehicleCarousel
        title="Available Now"
        subtitle={city ? `In ${city}` : "Across all cities"}
        vehicles={displayVehicles.slice(0, 8)}
        isLoading={isLoading}
        onSelectVehicle={setSelectedVehicle}
        onViewAll={() => {}}
      />

      {/* Weekly value picks */}
      <VehicleCarousel
        title="Best Weekly Value"
        subtitle="Lowest weekly rates"
        vehicles={[...available].sort((a, b) => (a.weekly_rate || 9999) - (b.weekly_rate || 9999)).slice(0, 6)}
        isLoading={isLoading}
        onSelectVehicle={setSelectedVehicle}
      />

      {/* Rent-to-Own eligible */}
      {rtoEligible.length > 0 && (
        <VehicleCarousel
          title="Rent-to-Own"
          subtitle="Drive it. Own it."
          vehicles={rtoEligible.slice(0, 6)}
          isLoading={isLoading}
          onSelectVehicle={setSelectedVehicle}
          onViewAll={() => {}}
        />
      )}

      {/* AI recommendation pill */}
      <div className="mx-4 mt-6 mb-4">
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-purple-200 bg-purple-50">
          <div className="h-10 w-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="font-semibold text-purple-900 text-sm">Smart Recommendations</p>
            <p className="text-xs text-purple-600 mt-0.5">Sign in to get personalized car picks based on your history.</p>
          </div>
        </div>
      </div>

      {/* Bottom spacer for nav */}
      <div className="h-4" />

      {/* Vehicle detail sheet */}
      <VehicleDetailSheet
        vehicle={selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        onBook={handleBook}
        user={user}
      />
    </div>
  );
}