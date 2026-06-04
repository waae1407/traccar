import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Satellite, Router, Activity, Upload } from "lucide-react";
import DeviceProvisioningPanel from "@/components/telematics/DeviceProvisioningPanel";

import UnassignedDevicesQueue from "@/components/telematics/UnassignedDevicesQueue";
import TelematicsDeviceAssignmentPanel from "@/components/telematics/TelematicsDeviceAssignmentPanel";
import CommandTestWorkspace from "@/components/telematics/command-test/CommandTestWorkspace";
import ExpandableSection from "@/components/shared/ExpandableSection";

export default function AdminTelematicsCenter() {
  const qc = useQueryClient();
  const { data: devices = [], refetch: refetchDevices } = useQuery({ queryKey: ["telematics-devices"], queryFn: () => base44.entities.TelematicsDevice.list("-updated_date", 300) });
  const { data: providers = [] } = useQuery({ queryKey: ["telematics-providers"], queryFn: () => base44.entities.TelematicsProviderConfig.list("provider_key", 100) });
  const { data: vehicles = [] } = useQuery({ queryKey: ["telematics-setup-vehicles"], queryFn: () => base44.entities.Vehicle.list("-updated_date", 500) });

  return <div className="p-4 sm:p-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div><p className="text-xs font-bold text-primary uppercase tracking-widest">Setup Console</p><h1 className="text-2xl font-black">Telematics Setup</h1><p className="text-sm text-muted-foreground">Provision devices, assign vehicles, configure providers, enable production commands, and set safety rules.</p></div>
      <div className="flex flex-wrap gap-2"><Badge className="w-fit bg-primary/15 text-primary border-primary/30"><Satellite className="h-3 w-3 mr-1" /> Provider Agnostic</Badge><a href="/admin/telematics-operations" className="text-xs rounded-full border border-border px-3 py-1 text-muted-foreground hover:text-foreground">Operations</a><a href="/admin/telematics-rollout" className="text-xs rounded-full border border-border px-3 py-1 text-muted-foreground hover:text-foreground">Rollout Dashboard</a></div>
    </div>
    <div className="grid md:grid-cols-4 gap-3">
      <Stat label="Devices" value={devices.length} icon={Router} />
      <Stat label="Providers" value={providers.length || 1} icon={Satellite} />
      <Stat label="Online" value={devices.filter(d => d.online_status === "online").length} icon={Activity} />
      <Stat label="Unassigned" value={devices.filter(d => d.assigned_status === "unassigned").length} icon={Upload} />
    </div>
    <DeviceProvisioningPanel devices={devices} providers={providers} />
    <ExpandableSection title="Unassigned Devices Queue">
      <UnassignedDevicesQueue devices={devices} vehicles={vehicles} providers={providers} role="admin" onChanged={async () => { await refetchDevices(); qc.invalidateQueries({ queryKey: ["telematics-setup-vehicles"] }); }} />
    </ExpandableSection>
    <ExpandableSection title="Vehicle Device Assignments">
      <div className="grid gap-3 xl:grid-cols-2">{vehicles.map(vehicle => <TelematicsDeviceAssignmentPanel key={vehicle.id} vehicle={vehicle} devices={devices} providers={providers} role="admin" onChanged={async () => { await refetchDevices(); qc.invalidateQueries({ queryKey: ["telematics-setup-vehicles"] }); }} />)}</div>
    </ExpandableSection>
    <ExpandableSection title="Provider Configs">
      <div className="grid md:grid-cols-3 gap-3">{providers.length ? providers.map(p => <div key={p.id} className="rounded-xl border border-border p-3"><p className="font-bold">{p.provider_name}</p><p className="text-xs text-muted-foreground">{p.provider_key} · {p.provider_type}</p><Badge variant="outline" className="mt-2">{p.is_active ? "Active" : "Inactive"}</Badge></div>) : <div className="text-sm text-muted-foreground">Default MooveTrax compatibility is active. Add provider records for Traccar or generic APIs.</div>}</div>
    </ExpandableSection>
    <ExpandableSection title="Device Registry" defaultOpen>
      <CommandTestWorkspace showHeader={false} />
    </ExpandableSection>
  </div>;
}
function Stat({ label, value, icon: Icon }) { return <Card className="glass"><CardContent className="p-4"><Icon className="h-5 w-5 text-primary mb-2" /><p className="text-2xl font-black">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>; }