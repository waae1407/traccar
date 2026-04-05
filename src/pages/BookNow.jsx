import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext, useNavigate } from "react-router-dom";
import VehicleDetailSheet from "@/components/customer/VehicleDetailSheet";
import ContinueBookingBanner from "@/components/customer/ContinueBookingBanner";
import BookNowHero from "@/components/customer/booknow/BookNowHero";
import BookNowQuickActions from "@/components/customer/booknow/BookNowQuickActions";
import BookNowVehicleGrid from "@/components/customer/booknow/BookNowVehicleGrid";
import BookNowRtoBanner from "@/components/customer/booknow/BookNowRtoBanner";
import HomeTopBar from "@/components/customer/HomeTopBar";

export default function BookNow() {
  const context = useOutletContext() || {};
  const { user, city = "", setCity } = context;
  const navigate = useNavigate();

  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [bookingType, setBookingType] = useState("Weekly");
  const [activeFilter, setActiveFilter] = useState("All");

  const companySlug = new URLSearchParams(window.location.search).get("company");
  const { data: tenantCompany } = useQuery({
    queryKey: ["company-by-slug", companySlug],
    queryFn: async () => {
      const results = await base44.entities.Company.filter({ slug: companySlug });
      return results[0] || null;
    },
    enabled: !!companySlug,
    staleTime: 5 * 60_000,
  });

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles-public", tenantCompany?.id],
    queryFn: () => tenantCompany?.id
      ? base44.entities.Vehicle.filter({ company_id: tenantCompany.id })
      : base44.entities.Vehicle.list(),
    staleTime: 60_000,
  });

  const available = vehicles.filter((v) => v.status === "Available");
  const byCity = city ? available.filter((v) => (v.city || v.current_city || "").toLowerCase().includes(city.toLowerCase())) : available;
  const displayVehicles = byCity.length > 0 ? byCity : available;
  const rtoEligible = vehicles.filter((v) => v.rent_to_own_eligible && v.status === "Available");

  // Filter logic
  const filtered = activeFilter === "RTO"
    ? displayVehicles.filter((v) => v.rent_to_own_eligible)
    : activeFilter === "Budget"
    ? [...displayVehicles].sort((a, b) => (a.weekly_rate || 9999) - (b.weekly_rate || 9999))
    : activeFilter === "Newest"
    ? [...displayVehicles].sort((a, b) => (b.year || 0) - (a.year || 0))
    : displayVehicles;

  const handleBook = (vehicle) => {
    setSelectedVehicle(null);
    const companyParam = companySlug ? `&company=${companySlug}` : "";
    navigate(`/checkout?vehicle=${vehicle.id}&type=${bookingType}${companyParam}`);
  };

  return (
    <div className="min-h-screen pb-28 bg-gray-50">
      <HomeTopBar user={user} city={city} onCityChange={() => {}} />

      {user && <ContinueBookingBanner user={user} />}

      {/* Hero */}
      <BookNowHero user={user} vehicleCount={available.length} />

      {/* Quick Actions */}
      <BookNowQuickActions
        bookingType={bookingType}
        onTypeChange={setBookingType}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        companySlug={companySlug}
      />

      {/* RTO Banner */}
      {rtoEligible.length > 0 && <BookNowRtoBanner count={rtoEligible.length} companySlug={companySlug} />}

      {/* Vehicle Grid */}
      <BookNowVehicleGrid
        vehicles={filtered}
        isLoading={isLoading}
        city={city}
        onSelect={setSelectedVehicle}
      />

      {/* Vehicle Detail Sheet */}
      <VehicleDetailSheet
        vehicle={selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        onBook={handleBook}
        user={user}
      />
    </div>
  );
}