import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Bell, MapPin } from "lucide-react";
import { getVehicleDisplayName } from "@/lib/vehicleDisplayName";

const ACTIVE_STATUSES = new Set(["open", "escalated"]);

export default function HostAlarmAttentionBanner({ host }) {
  const { data: safetyEvents = [] } = useQuery({
    queryKey: ["host-urgent-safety-events", host?.id],
    queryFn: () => base44.entities.TelematicsSafetyEvent.filter({ host_id: host.id }),
    enabled: !!host?.id,
    refetchInterval: 15_000,
  });

  const activeEvents = safetyEvents
    .filter((event) => ACTIVE_STATUSES.has(event.status))
    .sort((a, b) => new Date(b.started_at || b.created_date || 0) - new Date(a.started_at || a.created_date || 0));

  const urgentEvents = activeEvents.filter((event) => event.severity === "critical" || event.shock_detected);
  const eventsToShow = urgentEvents.length ? urgentEvents : activeEvents;

  const { data: vehicles = [] } = useQuery({
    queryKey: ["host-alarm-banner-vehicles", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id && eventsToShow.length > 0,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["host-alarm-banner-devices", host?.id],
    queryFn: () => base44.entities.TelematicsDevice.filter({ host_id: host.id }),
    enabled: !!host?.id && eventsToShow.length > 0,
  });

  if (!eventsToShow.length) return null;

  const primary = eventsToShow[0];
  const vehicle = vehicles.find((item) => item.id === primary.vehicle_id);
  const device = devices.find((item) => item.id === primary.telematics_device_id);
  const title = primary.shock_detected ? "Shock alarm needs attention" : "Vehicle safety alert needs attention";
  const vehicleName = getVehicleDisplayName(vehicle, device);

  return (
    <Link
      to="/host/telematics"
      className="block rounded-3xl border-2 border-red-300 bg-red-600 p-1 shadow-2xl shadow-red-500/30 animate-pulse"
    >
      <div className="rounded-[1.35rem] bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 p-4 text-white">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-black uppercase tracking-widest">Urgent Telematics Alarm</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-red-700">
                  {eventsToShow.length} active
                </span>
              </div>
              <h2 className="mt-1 text-xl font-black">{title}</h2>
              <p className="mt-1 text-sm text-white/90">
                {vehicleName || "Assigned vehicle"}{device?.unique_id ? ` · Device ${device.unique_id}` : ""}
              </p>
              {primary.last_known_location && (
                <p className="mt-1 flex items-center gap-1 text-xs text-white/80">
                  <MapPin className="h-3 w-3" /> {primary.last_known_location}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-red-700 shadow-lg">
            <Bell className="h-4 w-4" /> Review Now
          </div>
        </div>
      </div>
    </Link>
  );
}