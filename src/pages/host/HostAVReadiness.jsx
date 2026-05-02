import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Zap, Car, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function HostAVReadiness() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({
    queryKey: ["host-vehicles", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Vehicle.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-vehicles"] }),
  });

  const avReady = vehicles.filter(v => v.autonomous_capable);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white font-syne">AV Readiness</h1>
        <p className="text-white/40 text-sm mt-1">Future-proof your fleet for autonomous vehicle deployment</p>
      </div>

      {/* Info Banner */}
      <div className="p-6 rounded-2xl border border-primary/20 bg-primary/5">
        <div className="flex items-start gap-4">
          <Zap className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-white mb-2">Autonomous Vehicle Integration</h3>
            <p className="text-sm text-white/50 mb-3">As Waymo, Tesla Robotaxi, and other AV platforms expand into your market, uRide will connect your AV-capable vehicles directly to their deployment programs. Flag your vehicles now to be first in queue.</p>
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { label: "AV-Ready Vehicles", value: avReady.length },
                { label: "Potential Passive Income", value: "24/7" },
                { label: "Target Markets", value: "2028+" },
              ].map((s, i) => (
                <div key={i} className="p-3 rounded-xl bg-white/[0.05]">
                  <p className="text-lg font-black text-primary font-syne">{s.value}</p>
                  <p className="text-xs text-white/40">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Vehicle AV Config */}
      <div className="rounded-2xl border border-white/[0.08] glass overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h3 className="font-bold text-white">Configure Your Fleet</h3>
          <p className="text-xs text-white/40 mt-1">Set AV capabilities for each vehicle</p>
        </div>
        {vehicles.length === 0 ? (
          <div className="text-center py-12">
            <Car className="h-8 w-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">Add vehicles to configure AV readiness</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {vehicles.map(v => (
              <div key={v.id} className="px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{v.year} {v.make} {v.model}</p>
                    <p className="text-xs text-white/40">{v.city}, {v.state}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {v.autonomous_capable ? (
                      <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/20 px-2 py-1 rounded-full"><CheckCircle2 className="h-3 w-3" /> AV Ready</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-white/40 bg-white/10 px-2 py-1 rounded-full"><Clock className="h-3 w-3" /> Not Configured</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-white/40 mb-1.5">AV Platform</p>
                    <Select value={v.av_platform || "none"} onValueChange={val => updateMutation.mutate({ id: v.id, data: { av_platform: val, autonomous_capable: val !== "none" } })}>
                      <SelectTrigger className="h-8 rounded-lg bg-white/[0.06] border-white/10 text-white text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[hsl(222,28%,12%)] border-white/10 text-white text-xs">
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="waymo">Waymo</SelectItem>
                        <SelectItem value="tesla">Tesla</SelectItem>
                        <SelectItem value="zoox">Zoox</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1.5">Telematics</p>
                    <Select value={v.telematics_provider || "none"} onValueChange={val => updateMutation.mutate({ id: v.id, data: { telematics_provider: val } })}>
                      <SelectTrigger className="h-8 rounded-lg bg-white/[0.06] border-white/10 text-white text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[hsl(222,28%,12%)] border-white/10 text-white text-xs">
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="moovetrax">Moovetrax</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1.5">Deployment</p>
                    <Select value={v.deployment_type || "human"} onValueChange={val => updateMutation.mutate({ id: v.id, data: { deployment_type: val } })}>
                      <SelectTrigger className="h-8 rounded-lg bg-white/[0.06] border-white/10 text-white text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[hsl(222,28%,12%)] border-white/10 text-white text-xs">
                        <SelectItem value="human">Human</SelectItem>
                        <SelectItem value="av">Autonomous</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-sm text-white/40 leading-relaxed">
        <p className="font-semibold text-white/60 mb-2">🔮 What happens next?</p>
        When major AV platforms expand to your market, uRide will automatically match your AV-configured vehicles with their fleet programs. You'll be notified first and can opt in with one click — no tech expertise required. Your vehicle earns while parked.
      </div>
    </div>
  );
}