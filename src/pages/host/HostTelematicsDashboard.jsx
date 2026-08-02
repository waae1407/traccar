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
import SafetyEventsPanel from "@/components/telematics/safety/SafetyEventsPanel";
import { getVehicleDisplayName } from "@/lib/vehicleDisplayName";
import { businessText, commandLabel, statusLabel } from "@/components/telematics/command-test/businessLanguage";
import InstallerLocatorCTA from "@/components/installers/InstallerLocatorCTA";
import { getDeviceFreshness } from "@/lib/telematics/telematicsReporting";

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
    <div><p className="text-xs font-black text-pink-600 uppercase tracking-widest">Telematics</p><h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>Fleet Controls</h1><p className="text-sm text-gray-500">Near-real-time vehicle location, device health, and approved actions for your vehicles.</p></div>
      <a href="/host/battery-health" className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">🔋 Battery Health Monitor</a>
    <InstallerLocatorCTA source="telematics_setup" title="Need an Installer?" description="Find a verified installer near you." />
    <TelematicsMap role="host" devices={devices} vehicles={vehicles} hosts={host ? [host] : []} bookings={bookings} providers={providers} height={520} showFilters showRefresh refreshLabel="Refresh My Fleet" onRefresh={refetchDevices} />
    <SafetyEventsPanel role="host" title="Safety Events" />
    {devices.some(d => !d.vehicle_id) && <UnassignedDevicesQueue devices={devices.filter(d => !d.vehicle_id)} vehicles={vehicles} providers={providers} role="host" onChanged={async () => { await refetchDevices(); await refetchVehicles(); }} />}
    <div className="grid gap-4">
      {devices.map(device => {
        const vehicle = vehicles.find(v => v.id === device.vehicle_id);
        const recent = commands.filter(c => c.telematics_device_id === device.id).slice(0, 3);
        const ready = (["live_ready", "live_enabled", "installation_completed", "installation_completed_unlinked"].includes(device.lifecycle_status) || device.install_status === "installed") && !["suspended", "retired"].includes(device.lifecycle_status);
        const df = getDeviceFreshness(device);
        const BADGE_STYLES = {
          online:  'bg-emerald-50 text-emerald-700 border-emerald-200',
          recent:  'bg-blue-50 text-blue-700 border-blue-200',
          stale:   'bg-yellow-50 text-yellow-700 border-yellow-200',
          offline: 'bg-red-50 text-red-700 border-red-200',
          unknown: 'bg-gray-100 text-gray-500 border-gray-200',
        };
        const badgeCls = BADGE_STYLES[df.status] || BADGE_STYLES.unknown;
        const badgeTxt = df.label + (df.status === 'online' ? '' : df.ageMinutes !== null ? ` (${df.ageMinutes}m)` : '');
        return <Card key={device.id} className="border-gray-100 shadow-sm overflow-hidden"><CardContent className="p-5 space-y-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="h-12 w-12 rounded-2xl bg-pink-50 flex items-center justify-center"><Car className="h-6 w-6 text-pink-600" /></div><div><p className="font-black text-gray-900">{getVehicleDisplayName(vehicle, device)}</p><p className="text-xs text-gray-500">Telematics Network · {device.unique_id}</p></div></div><Badge className={badgeCls}><Wifi className="h-3 w-3 mr-1" />{badgeTxt}</Badge></div><div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs"><Info label="Lifecycle" value={device.lifecycle_status || "inventory"} /><Info label="Install" value={device.install_status || "not_started"} /><Info label="Last heartbeat" value={device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "—"} /><Info label="Ignition" value={device.ignition_status || "unknown"} /><Info label="Readiness" value={ready ? "Ready" : "Not ready"} /></div>{vehicle && <TelematicsDeviceAssignmentPanel vehicle={vehicle} devices={devices} providers={providers} role="host" onChanged={async () => { await refetchDevices(); await refetchVehicles(); }} />}{vehicle && <TelematicsCommandButtons vehicleId={vehicle.id} device={device} provider={providers.find(p => p.provider_key === device.provider_key)} role="host" allowStarter={host?.telematics_starter_control_enabled === true && device.host_starter_control_enabled === true} />}{recent.length > 0 && <div className="pt-2 border-t border-gray-100"><p className="text-xs font-bold text-gray-400 mb-2">Action history</p>{recent.map(c => <p key={c.id} className="text-xs text-gray-500 flex justify-between gap-3"><span>{commandLabel(c.command_type)}</span><span>{statusLabel(c.queue_status || c.status)}{c.failure_reason ? ` · ${businessText(c.failure_reason)}` : ""}</span></p>)}</div>}</CardContent></Card>;
      })}
      {devices.length === 0 && <div className="rounded-3xl bg-white border border-gray-100 p-8 text-center text-gray-500"><Gauge className="h-8 w-8 mx-auto mb-2 text-gray-300" /><p>No telematics devices assigned yet.</p><div className="mt-4"><InstallerLocatorCTA source="telematics_setup" title="Need help installing your GPS device?" description="Find a nearby installer." /></div></div>}
    </div>
  </div>;
}
function Info({ label, value }) { return <div className="rounded-2xl bg-gray-50 p-3"><p className="text-gray-400">{label}</p><p className="font-bold text-gray-800 truncate">{value}</p></div>; }