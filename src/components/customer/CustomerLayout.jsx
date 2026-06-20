import React, { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import CustomerBottomNav from "./CustomerBottomNav";
import CustomerTopBar from "./CustomerTopBar";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import FloatingAIAssistant from "@/components/shared/FloatingAIAssistant";

const ACTIVE_RENTAL_STATUSES = ["active", "approved", "confirmed", "payment_due", "grace_period", "return_pending_host_review", "under_review"];

export default function CustomerLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isBookNow = location.pathname === "/book-now";
  const isMyVehicle = location.pathname === "/my-vehicle" || location.pathname === "/vehicle-command-center";
  const [city, setCity] = useState(user?.preferred_city || "");

  // Fetch bookings to check for active rental
  const { data: bookings = [] } = useQuery({
    queryKey: ["customer-layout-bookings", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user?.email }),
    enabled: !!user?.email,
    staleTime: 30_000,
  });

  // Redirect to /my-vehicle if user has active paid booking and not already there
  useEffect(() => {
    if (!user || !bookings.length) return;
    
    const hasActiveRental = bookings.some(b => 
      ACTIVE_RENTAL_STATUSES.includes(b.booking_status) && 
      b.payment_status === "paid" &&
      !b.rental_ended_at
    );
    
    // Only redirect if on root paths, not if user explicitly navigated elsewhere
    const isRootPath = location.pathname === "/" || location.pathname === "/book-now";
    const isMyVehicle = location.pathname === "/my-vehicle" || location.pathname === "/vehicle-command-center";
    
    if (hasActiveRental && isRootPath && !isMyVehicle) {
      navigate("/vehicle-command-center", { replace: true });
    }
  }, [bookings, user, location.pathname, navigate]);

  return (
    <div className="min-h-screen" style={{ background: "#f8f8fa", fontFamily: "var(--font-inter)" }}>
      {!isBookNow && !isMyVehicle && <CustomerTopBar user={user} city={city} onCityChange={() => {}} />}
      <main className={isMyVehicle ? "w-full max-w-2xl mx-auto md:pb-12" : "w-full max-w-2xl mx-auto pb-28 md:pb-12"}>
        <Outlet context={{ user, city, setCity }} />
      </main>
      {/* Bottom nav only on mobile, hidden on MyVehicle page */}
      <div className="md:hidden">
        {!isMyVehicle && <CustomerBottomNav />}
      </div>
      <FloatingAIAssistant
        agentName="renter_assistant"
        displayName="Personal Assistant"
        role="customer"
      />
    </div>
  );
}