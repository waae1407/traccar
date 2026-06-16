import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import VehicleCommandHeader from "@/components/command-center/VehicleCommandHeader";
import VehicleSelectorPanel from "@/components/command-center/VehicleSelectorPanel";
import VehicleStatusCard from "@/components/command-center/VehicleStatusCard";
import VehicleCommandControls from "@/components/command-center/VehicleCommandControls";
import { DeviceHealthPanel, SafetyAlertsPanel } from "@/components/command-center/CommandCenterPanels";
import TelematicsMap from "@/components/telematics/TelematicsMap";
import CommandHistoryTimeline from "@/components/telematics/CommandHistoryTimeline";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LockKeyhole } from "lucide-react";

const ACTIVE_BOOKINGS = ["active", "approved", "confirmed"];

function isActiveCustomerBooking(booking) {
  if (!booking) return false;
  if (!ACTIVE_BOOKINGS.includes(booking.booking_status)) return false;
  if (booking.payment_status !== "paid") return false;
  if (booking.starter_disabled || booking.moovetrax_kill_active) return false;
  if (booking.end_date && Date.now() > new Date(`${booking.end_date}T23:59:59`).getTime()) return false;
  return true;
}

export default function VehicleCommandCenter({ mode = "admin" }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const isCustomer = mode === "customer";

  const { data: hosts = [] } = useQuery({ queryKey: ["vcc-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user.email }), enabled: !!user?.email && mode === "host" });
  const host = hosts.find((item) => item.email === user?.email || item.user_id === user?.id) || hosts[0];

  const { data: bookings = [], refetch: refetchBookings } = useQuery({
    queryKey: ["vcc-bookings", mode, user?.email, host?.id],
    queryFn: () => mode === "admin" ? base44.entities.BookingRequest.list("-updated_date", 500) : mode === "host" ? base44.entities.BookingRequest.filter({ host_id: host.id }) : base44.entities.BookingRequest.filter({ user_email: user.email }),
    enabled: mode === "admin" || (mode === "host" && !!host?.id) || (isCustomer && !!user?.email),
    refetchInterval: 60000,
  });

  const customerBooking = useMemo(() => bookings.find(isActiveCustomerBooking), [bookings]);

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vcc-vehicles", mode, host?.id, customerBooking?.vehicle_id],
    queryFn: () => mode === "admin" ? base44.entities.Vehicle.list("-updated_date", 500) : mode === "host" ? base44.entities.Vehicle.filter({ host_id: host.id }) : base44.entities.Vehicle.filter({ id: customerBooking.vehicle_id }),
    enabled: mode === "admin" || (mode === "host" && !!host?.id) || (!!customerBooking?.vehicle_id),
  });

  const { data: devices = [], refetch: refetchDevices } = useQuery({
    queryKey: ["vcc-devices", mode, host?.id, selectedVehicleId],
    queryFn: () => mode === "admin" ? base44.entities.TelematicsDevice.list("-updated_date", 500) : mode === "host" ? base44.entities.TelematicsDevice.filter({ host_id: host.id }) : base44.entities.TelematicsDevice.filter({ vehicle_id: selectedVehicleId }),
    enabled: mode === "admin" || (mode === "host" && !!host?.id) || (isCustomer && !!selectedVehicleId),
    refetchInterval: 30000,
  });

  const { data: providers = [] } = useQuery({ queryKey: ["vcc-providers", mode], queryFn: () => base44.entities.TelematicsProviderConfig.list("provider_key", 100), enabled: mode !== "customer" });

  useEffect(() => {
    if (isCustomer && customerBooking?.vehicle_id) setSelectedVehicleId(customerBooking.vehicle_id);
    else if (!selectedVehicleId && vehicles[0]?.id) setSelectedVehicleId(vehicles[0].id);
  }, [isCustomer, customerBooking?.vehicle_id, vehicles, selectedVehicleId]);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || vehicles[0];
  const selectedDevice = devices.find((device) => device.vehicle_id === selectedVehicle?.id || device.id === selectedVehicle?.telematics_device_id);
  const selectedBooking = isCustomer ? customerBooking : bookings.find((booking) => booking.vehicle_id === selectedVehicle?.id && ACTIVE_BOOKINGS.includes(booking.booking_status));
  const selectedProvider = mode === "customer" ? null : providers.find((provider) => provider.provider_key === selectedDevice?.provider_key);
  const hostOwnsVehicle = mode === "host" && !!host?.id && selectedVehicle?.host_id === host.id;
  const allowStarter = mode === "admin" || (mode === "host" && host?.telematics_starter_control_enabled === true && selectedDevice?.host_starter_control_enabled === true);

  const commandFilter = isCustomer && selectedBooking?.id ? { booking_id: selectedBooking.id } : selectedVehicle?.id ? { vehicle_id: selectedVehicle.id } : null;
  const { data: commands = [], refetch: refetchCommands } = useQuery({ queryKey: ["vcc-commands", mode, selectedVehicle?.id, selectedBooking?.id], queryFn: () => base44.entities.TelematicsCommand.filter(commandFilter, "-created_date", 30), enabled: !!commandFilter, refetchInterval: 10000, initialData: [] });
  const { data: positions = [] } = useQuery({ queryKey: ["vcc-positions", selectedDevice?.id], queryFn: () => base44.entities.TelematicsPositionHistory.filter({ device_id: selectedDevice.id }, "-timestamp", 5), enabled: !!selectedDevice?.id, refetchInterval: 30000, initialData: [] });
  const { data: safetyEvents = [] } = useQuery({ queryKey: ["vcc-safety", selectedVehicle?.id], queryFn: () => base44.entities.TelematicsSafetyEvent.filter({ vehicle_id: selectedVehicle.id }, "-started_at", 20), enabled: !!selectedVehicle?.id, refetchInterval: 30000, initialData: [] });
  const { data: alerts = [] } = useQuery({ queryKey: ["vcc-alerts", selectedVehicle?.id], queryFn: () => base44.entities.OperationalAlert.filter({ vehicle_id: selectedVehicle.id }, "-created_date", 20), enabled: !!selectedVehicle?.id, refetchInterval: 30000, initialData: [] });

  const refreshAfterCommand = async () => {
    await Promise.all([refetchCommands(), refetchDevices(), refetchBookings()]);
  };

  if (isCustomer && !user) return <LoginRequired />;
  if (isCustomer && bookings.length > 0 && !customerBooking) return <ExpiredAccess mode={mode} />;
  if (!selectedVehicle) return <EmptyCommandCenter mode={mode} />;

  return (
    <div className={`min-h-screen ${mode === "admin" ? "p-4 sm:p-6" : ""}`}>
      <div className="mx-auto max-w-7xl space-y-5">
        <VehicleCommandHeader mode={mode} />
        <VehicleSelectorPanel mode={mode} vehicles={vehicles} selectedVehicleId={selectedVehicle?.id} onSelect={setSelectedVehicleId} booking={selectedBooking} />
        <VehicleStatusCard mode={mode} vehicle={selectedVehicle} device={selectedDevice} provider={selectedProvider} booking={selectedBooking} hostOwnsVehicle={hostOwnsVehicle} allowStarter={allowStarter} />
        <section className="space-y-3">
          <h2 className="text-lg font-black text-slate-950">Live Map</h2>
          <TelematicsMap role={mode} devices={selectedDevice ? [selectedDevice] : []} vehicles={[selectedVehicle]} hosts={host ? [host] : []} bookings={selectedBooking ? [selectedBooking] : []} providers={mode === "customer" ? [] : providers} height={mode === "customer" ? 320 : 460} showFilters={false} refreshLabel="Refresh location" onRefresh={refetchDevices} />
        </section>
        <VehicleCommandControls mode={mode} vehicle={selectedVehicle} device={selectedDevice} provider={selectedProvider} booking={selectedBooking} hostOwnsVehicle={hostOwnsVehicle} allowStarter={allowStarter} onCommand={refreshAfterCommand} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-[1.75rem] border-border bg-card shadow-sm"><CardContent className="p-4"><h3 className="mb-4 text-lg font-black text-foreground">Command History</h3><CommandHistoryTimeline commands={commands} vehiclesById={{ [selectedVehicle.id]: selectedVehicle }} devicesById={selectedDevice ? { [selectedDevice.id]: selectedDevice } : {}} compact={mode === "customer"} /></CardContent></Card>
          <SafetyAlertsPanel safetyEvents={safetyEvents} alerts={alerts} />
        </div>
        <DeviceHealthPanel mode={mode} device={selectedDevice} position={positions[0]} />
      </div>
    </div>
  );
}

function LoginRequired() {
  return <div className="p-4"><Card className="rounded-[2rem] border-slate-200 bg-white"><CardContent className="p-8 text-center"><LockKeyhole className="mx-auto mb-3 h-8 w-8 text-slate-300" /><h2 className="text-2xl font-black text-slate-950">Login required</h2><p className="mt-2 text-sm text-slate-500">Sign in to access active rental vehicle controls.</p><Button className="mt-5" onClick={() => base44.auth.redirectToLogin(window.location.pathname)}>Sign in</Button></CardContent></Card></div>;
}

function ExpiredAccess() {
  return <div className="p-4"><Card className="rounded-[2rem] border-slate-200 bg-white"><CardContent className="p-8 text-center"><LockKeyhole className="mx-auto mb-3 h-8 w-8 text-slate-300" /><h2 className="text-2xl font-black text-slate-950">Vehicle access expired</h2><p className="mt-2 text-sm text-slate-500">Remote controls are available only during an active paid rental.</p><Button className="mt-5" onClick={() => { window.location.href = "/my-bookings"; }}>View bookings</Button></CardContent></Card></div>;
}

function EmptyCommandCenter({ mode }) {
  return <div className={mode === "admin" ? "p-6" : "p-4"}><VehicleCommandHeader mode={mode} /><Card className="mt-5 rounded-[2rem] border-slate-200 bg-white"><CardContent className="p-8 text-center text-slate-500">No eligible connected vehicle was found.</CardContent></Card></div>;
}