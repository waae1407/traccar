import React from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import TelematicsMap from "@/components/telematics/TelematicsMap";

const ALLOWED_STATUSES = ["active", "approved", "confirmed", "pending_review"];

export default function FindMyVehicleMap({ booking }) {
  const canShow = ALLOWED_STATUSES.includes(booking.booking_status) &&
    booking.payment_status === "paid" &&
    !booking.starter_disabled &&
    !booking.moovetrax_kill_active;

  const { data: devices = [], refetch } = useQuery({
    queryKey: ["customer-find-vehicle", booking.vehicle_id, canShow],
    queryFn: () => base44.entities.TelematicsDevice.filter({ vehicle_id: booking.vehicle_id }),
    enabled: !!booking.vehicle_id && canShow,
    refetchInterval: 60_000,
  });

  if (!canShow) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-center">
        <MapPin className="mx-auto mb-2 h-5 w-5 text-gray-300" />
        <p className="text-xs font-semibold text-gray-500">Vehicle location is available only during an active rental.</p>
      </div>
    );
  }

  return (
    <TelematicsMap
      role="customer"
      devices={devices.slice(0, 1)}
      vehicles={[{ id: booking.vehicle_id, display_name: booking.vehicle_name, make: booking.vehicle_name, status: booking.booking_status }]}
      height={220}
      compact
      showFilters={false}
      refreshLabel="Refresh Vehicle Location"
      onRefresh={refetch}
    />
  );
}