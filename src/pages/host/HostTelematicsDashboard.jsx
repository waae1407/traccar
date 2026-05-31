import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wifi, Car, Gauge } from "lucide-react";
import TelematicsCommandButtons from "@/components/telematics/TelematicsCommandButtons";
import TelematicsMap from "@/components/telematics/TelematicsMap";
import UnassignedDevicesQueue from "@/components/telematics/UnassignedDevicesQueue";
import TelematicsDeviceAssignmentPanel from "@/components/telematics/TelematicsDeviceAssignmentPanel";

export default function HostTelematicsDashboard() {
  const { user } = useAuth();
  const { data: hosts = [] } = useQuery({ queryKey: ["host-telematics-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user.email }), enabled: !!user?.email });
  const host = hosts[0];
  const { data: devices = [], refetch: refetchDevices } = useQuery({ queryKey: ["host-telematics-devices", host?.id], queryFn: () => base44.entities.TelematicsDevice.filter({ host_id: host.id }), enabled: !!host?.id, refetchInterval: 60_000 });
  const { data: vehicles = [], refetch: refetchVehicles } = useQuery({ queryKey: ["host-telematics-vehicles", host?.id], queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: commands = [] } = useQuery({ queryKey: ["host-telematics-commands", host?.id], queryFn: () => base44.entities.TelematicsCommand.filter({ host_id: host.id }), enabled: !!host?.id, refetchInterval: 30000 });
  const { data: providers = [] } = useQuery({ queryKey: ["host-telematics-providers"], queryFn: () => base44.entities.TelematicsProviderConfig.list("provider_key", 100) });
  const { data: bookings = [] } = useQuery({ queryKey: ["host-telematics-bookings", host?.id], queryFn: () => base44.entities.BookingRequest.filter({ host_id: host.id }), enabled: !!host?.id, refetchInterval: 60_000 });

  return <div className="space-y-5">
    <div><p className="text-xs font-black text-pink-600 uppercase tracking-widest">Telematics</p><h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>Fleet Controls</h1><p className="text-sm text-gray-500">Near-real-time cached GPS, device health, and safe commands for your vehicles.</p></div>
    <TelematicsMap role="host" devices={devices} vehicles={vehicles} bookings={bookings} height={520} showFilters showRefresh refreshLabel="Refresh My Fleet" onRefresh={refetchDevices} />
    {devices.some(d => !d.vehicle_id) && <UnassignedDevicesQueue devices={devices.filter(d => !d.vehicle_id)} vehicles={vehicles} providers={providers} role="host" onChanged={async () => { await refetchDevices(); await refetchVehicles(); }} />}
    <div className="grid gap-4">
      {devices.map(device => {
        const vehicle = vehicles.find(v => v.id === device.vehicle_id);
        const recent = commands.filter(c => c.telematics_device_id === device.id).slice(0, 3);
        const ready = ["approved", "live_enabled"].includes(device.lifecycle_status) && !["suspended", "retired"].includes(device.lifecycle_status);
        return <Card key={device.id} className="border-gray-100 shadow-sm overflow-hidden"><CardContent className="p-5 space-y-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="h-12 w-12 rounded-2xl bg-pink-50 flex items-center justify-center"><Car className="h-6 w-6 text-pink-600" /></div><div><p className="font-black text-gray-900">{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : device.unique_id}</p><p className="text-xs text-gray-500">{device.provider_key} · {device.unique_id}</p></div></div><Badge className="bg-emerald-50 text-emerald-700 border-emerald-200"><Wifi className="h-3 w-3 mr-1" />{device.online_status || "unknown"}</Badge></div><div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs"><Info label="Lifecycle" value={device.lifecycle_status || "inventory"} /><Info label="Install" value={device.install_status || "not_started"} /><Info label="Last heartbeat" value={device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "—"} /><Info label="Ignition" value={device.ignition_status || "unknown"} /><Info label="Readiness" value={ready ? "Ready" : "Not ready"} /></div>{vehicle && <TelematicsDeviceAssignmentPanel vehicle={vehicle} devices={devices} providers={providers} role="host" onChanged={async () => { await refetchDevices(); await refetchVehicles(); }} />}{vehicle && <TelematicsCommandButtons vehicleId={vehicle.id} device={device} provider={providers.find(p => p.provider_key === device.provider_key)} role="host" allowStarter={false} />}{recent.length > 0 && <div className="pt-2 border-t border-gray-100"><p className="text-xs font-bold text-gray-400 mb-2">Command history</p>{recent.map(c => <p key={c.id} className="text-xs text-gray-500 flex justify-between gap-3"><span>{c.command_type}</span><span>{c.queue_status || c.status}{c.failure_reason ? ` · ${c.failure_reason}` : ""}</span></p>)}</div>}</CardContent></Card>;
      })}
      {devices.length === 0 && <div className="rounded-3xl bg-white border border-gray-100 p-8 text-center text-gray-500"><Gauge className="h-8 w-8 mx-auto mb-2 text-gray-300" />No telematics devices assigned yet.</div>}
    </div>
  </div>;
}
function Info({ label, value }) { return <div className="rounded-2xl bg-gray-50 p-3"><p className="text-gray-400">{label}</p><p className="font-bold text-gray-800 truncate">{value}</p></div>; }