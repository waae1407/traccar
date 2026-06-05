import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, BarChart3, CheckCircle2, HelpCircle, Router, Wifi, WifiOff } from "lucide-react";
import TelematicsMetricCard from "@/components/telematics/TelematicsMetricCard";
import { getTelematicsDeviceStats } from "@/lib/telematics/telematicsReporting";

function avg(values) {
  const valid = values.filter(v => Number.isFinite(Number(v)));
  return valid.length ? Math.round(valid.reduce((sum, v) => sum + Number(v), 0) / valid.length) : 0;
}

export default function TelematicsRolloutDashboard() {
  const { data: devices = [] } = useQuery({ queryKey: ["rollout-devices"], queryFn: () => base44.entities.TelematicsDevice.list("-updated_date", 500), refetchInterval: 60000 });
  const { data: commands = [] } = useQuery({ queryKey: ["rollout-commands"], queryFn: () => base44.entities.TelematicsCommand.list("-created_date", 500), refetchInterval: 60000 });
  const { data: installs = [] } = useQuery({ queryKey: ["rollout-installs"], queryFn: () => base44.entities.TelematicsInstallRecord.list("-updated_date", 500), refetchInterval: 60000 });
  const providers = [...new Set(devices.map(d => d.provider_key).filter(Boolean))];
  const deviceStats = getTelematicsDeviceStats(devices);
  const completedInstalls = installs.filter(i => i.install_status === "completed" || i.qa_status === "approved").length;
  const installRate = installs.length ? Math.round((completedInstalls / installs.length) * 100) : 0;
  const successfulCommands = commands.filter(c => ["acknowledged", "executed"].includes(c.queue_status || c.status)).length;
  const commandRate = commands.length ? Math.round((successfulCommands / commands.length) * 100) : 0;
  const knownStatusCount = deviceStats.online + deviceStats.offline;
  const offlineRate = knownStatusCount ? Math.round((deviceStats.offline / knownStatusCount) * 100) : 0;

  return <div className="p-4 sm:p-6 space-y-5">
    <div><p className="text-xs font-bold text-primary uppercase tracking-widest">Phase A Reporting</p><h1 className="text-2xl font-black">Telematics Rollout Dashboard</h1><p className="text-sm text-muted-foreground">Production readiness metrics for the first 100-device rollout.</p></div>
    <div className="grid md:grid-cols-6 gap-3">
      <TelematicsMetricCard label="Total devices" value={deviceStats.total} icon={Router} />
      <TelematicsMetricCard label="Active devices" value={deviceStats.active} icon={Activity} />
      <TelematicsMetricCard label="Online" value={deviceStats.online} icon={Wifi} tone="text-green-400" />
      <TelematicsMetricCard label="Offline" value={deviceStats.offline} icon={WifiOff} tone="text-red-400" />
      <TelematicsMetricCard label="Unknown" value={deviceStats.unknown} icon={HelpCircle} tone="text-yellow-400" />
      <TelematicsMetricCard label="Install completion" value={`${installRate}%`} icon={CheckCircle2} tone="text-green-400" />
      <TelematicsMetricCard label="Command success" value={`${commandRate}%`} icon={Activity} />
      <TelematicsMetricCard label="Provider count" value={providers.length} icon={Router} />
      <TelematicsMetricCard label="Avg ack latency" value={`${avg(commands.map(c => c.delivery_latency_ms))}ms`} icon={BarChart3} />
      <TelematicsMetricCard label="Avg execution latency" value={`${avg(commands.map(c => c.execution_latency_ms))}ms`} icon={BarChart3} />
      <TelematicsMetricCard label="Offline rate" value={`${offlineRate}%`} icon={WifiOff} tone="text-red-400" />
    </div>
    <Card className="glass"><CardHeader><CardTitle className="text-base">Provider success rate</CardTitle></CardHeader><CardContent className="space-y-3">{providers.map(provider => { const providerCommands = commands.filter(c => c.provider_key === provider); const failed = providerCommands.filter(c => ["failed", "expired"].includes(c.queue_status || c.status)).length; const rate = providerCommands.length ? Math.round(((providerCommands.length - failed) / providerCommands.length) * 100) : 100; return <div key={provider} className="rounded-xl border border-border p-3 flex justify-between text-sm"><span>{provider}</span><b>{rate}%</b></div>; })}</CardContent></Card>
  </div>;
}