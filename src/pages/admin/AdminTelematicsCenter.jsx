import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Satellite, Router, Activity, Upload, WifiOff, HelpCircle } from "lucide-react";
import { getTelematicsDeviceStats } from "@/lib/telematics/telematicsReporting";
import DeviceProvisioningPanel from "@/components/telematics/DeviceProvisioningPanel";

import UnassignedDevicesQueue from "@/components/telematics/UnassignedDevicesQueue";
import TelematicsDeviceAssignmentPanel from "@/components/telematics/TelematicsDeviceAssignmentPanel";
import CommandTestWorkspace from "@/components/telematics/command-test/CommandTestWorkspace";
import ExpandableSection from "@/components/shared/ExpandableSection";

export default function AdminTelematicsCenter() {
  const qc = useQueryClient();
  const [scoreFilter, setScoreFilter] = useState("all");
  const { data: devices = [], isLoading: devicesLoading, error: devicesError, refetch: refetchDevices } = useQuery({ queryKey: ["telematics-devices"], queryFn: () => base44.entities.TelematicsDevice.list("-updated_date", 500) });
  const { data: providers = [], isLoading: providersLoading } = useQuery({ queryKey: ["telematics-providers"], queryFn: () => base44.entities.TelematicsProviderConfig.list("provider_key", 100) });
  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({ queryKey: ["telematics-setup-vehicles"], queryFn: () => base44.entities.Vehicle.list("-updated_date", 500) });
  
  if (devicesLoading || providersLoading || vehiclesLoading) return <div className="p-6 text-center text-muted-foreground">Loading telematics data...</div>;
  if (devicesError) return <div className="p-6 text-red-500">Error loading devices: {devicesError.message}</div>;
  
  const stats = getTelematicsDeviceStats(devices);
  const filteredDevices = scoreFilter === "online" ? devices.filter(d => d.online_status === "online") : scoreFilter === "offline" ? devices.filter(d => d.online_status === "offline") : scoreFilter === "unknown" ? devices.filter(d => !["online", "offline"].includes(d.online_status)) : scoreFilter === "unassigned" ? devices.filter(d => !d.vehicle_id && d.assigned_status !== "assigned") : devices;
  const filteredProviders = scoreFilter === "providers" ? providers : providers;

  return <div className="p-4 sm:p-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div><p className="text-xs font-bold text-primary uppercase tracking-widest">Setup Console</p><h1 className="text-2xl font-black">Telematics Setup</h1><p className="text-sm text-muted-foreground">Prepare vehicle devices, assign vehicles, enable approved live actions, and set safety rules.</p></div>
      <div className="flex flex-wrap gap-2"><Badge className="w-fit bg-primary/15 text-primary border-primary/30"><Satellite className="h-3 w-3 mr-1" /> Multi-Network Ready</Badge><a href="/admin/telematics-operations" className="text-xs rounded-full border border-border px-3 py-1 text-muted-foreground hover:text-foreground">Operations</a><a href="/admin/telematics-rollout" className="text-xs rounded-full border border-border px-3 py-1 text-muted-foreground hover:text-foreground">Rollout Dashboard</a></div>
    </div>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Devices" value={stats.total} icon={Router} active={scoreFilter === "all"} onClick={() => setScoreFilter("all")} />
      <Stat label="Online" value={stats.online} icon={Activity} active={scoreFilter === "online"} onClick={() => setScoreFilter(scoreFilter === "online" ? "all" : "online")} />
      <Stat label="Offline" value={stats.offline} icon={WifiOff} active={scoreFilter === "offline"} onClick={() => setScoreFilter(scoreFilter === "offline" ? "all" : "offline")} />
      <Stat label="Unknown" value={stats.unknown} icon={HelpCircle} active={scoreFilter === "unknown"} onClick={() => setScoreFilter(scoreFilter === "unknown" ? "all" : "unknown")} />
      <Stat label="Unassigned" value={stats.unassigned} icon={Upload} active={scoreFilter === "unassigned"} onClick={() => setScoreFilter(scoreFilter === "unassigned" ? "all" : "unassigned")} />
      <Stat label="Providers" value={providers.length || 1} icon={Satellite} active={scoreFilter === "providers"} onClick={() => setScoreFilter(scoreFilter === "providers" ? "all" : "providers")} />
    </div>
    {scoreFilter !== "all" && <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-2 text-sm font-semibold text-primary">Showing {scoreFilter} results <button onClick={() => setScoreFilter("all")} className="ml-3 text-xs underline text-muted-foreground hover:text-foreground">Clear</button></div>}
    <DeviceProvisioningPanel devices={filteredDevices} providers={filteredProviders} />
    <ExpandableSection title="Unassigned Devices Queue">
      <UnassignedDevicesQueue devices={scoreFilter === "providers" ? devices : filteredDevices} vehicles={vehicles} providers={filteredProviders} role="admin" onChanged={async () => { await refetchDevices(); qc.invalidateQueries({ queryKey: ["telematics-setup-vehicles"] }); }} />
    </ExpandableSection>
    <ExpandableSection title="Vehicle Device Assignments">
      <div className="grid gap-3 xl:grid-cols-2">{vehicles.map(vehicle => <TelematicsDeviceAssignmentPanel key={vehicle.id} vehicle={vehicle} devices={scoreFilter === "providers" ? devices : filteredDevices} providers={filteredProviders} role="admin" onChanged={async () => { await refetchDevices(); qc.invalidateQueries({ queryKey: ["telematics-setup-vehicles"] }); }} />)}</div>
    </ExpandableSection>
    <ExpandableSection title="Service Network Settings">
      <div className="grid md:grid-cols-3 gap-3">{filteredProviders.length ? filteredProviders.map(p => <div key={p.id} className="rounded-xl border border-border p-3"><p className="font-bold">{p.provider_name}</p><p className="text-xs text-muted-foreground">{p.provider_key} · {p.provider_type}</p><Badge variant="outline" className="mt-2">{p.is_active ? "Active" : "Inactive"}</Badge></div>) : <div className="text-sm text-muted-foreground">Default telematics compatibility is active. Add service network settings when needed.</div>}</div>
    </ExpandableSection>
    <ExpandableSection title="Device Registry" defaultOpen>
      <CommandTestWorkspace showHeader={false} />
    </ExpandableSection>
  </div>;
}
function Stat({ label, value, icon: Icon, active, onClick }) { return <button type="button" onClick={onClick} className="text-left"><Card className={`glass transition-all hover:border-primary/40 hover:-translate-y-0.5 ${active ? "border-primary/50 ring-1 ring-primary/30" : ""}`}><CardContent className="p-4"><Icon className="h-5 w-5 text-primary mb-2" /><p className="text-2xl font-black">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card></button>; }