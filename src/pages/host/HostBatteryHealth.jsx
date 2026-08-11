import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import BatteryHealthScorecard from '@/components/telematics/battery/BatteryHealthScorecard';
import BatteryHealthDetailDrawer from '@/components/telematics/battery/BatteryHealthDetailDrawer';
import { Battery, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HostBatteryHealth() {
  const { user } = useAuth();
  const [selected, setSelected] = useState(null);

  const { data: hosts = [] } = useQuery({
    queryKey: ['host-battery-host', user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: scorecards = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['host-battery-health', host?.id],
    queryFn: () => base44.entities.BatteryHealthScorecard.filter({ host_id: host.id }),
    enabled: !!host?.id,
    refetchInterval: 60_000,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['host-battery-vehicles', host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });
  const vehicleMap = React.useMemo(() => {
    const map = new Map();
    for (const v of vehicles) if (v.id) map.set(v.id, v);
    return map;
  }, [vehicles]);

  // Only show scorecards for devices that are installed AND production-enabled
  const { data: devices = [] } = useQuery({
    queryKey: ['host-battery-devices', host?.id],
    queryFn: () => base44.entities.TelematicsDevice.filter({ host_id: host.id, provider_key: 'traccar_noran_mt20' }),
    enabled: !!host?.id,
  });
  const productionDeviceIds = React.useMemo(() => {
    const set = new Set();
    for (const d of devices) {
      if (d.install_status === 'installed' && d.production_commands_enabled) set.add(d.id);
    }
    return set;
  }, [devices]);

  const [analyzing, setAnalyzing] = useState(false);
  const handleRefresh = async () => {
    setAnalyzing(true);
    try {
      await base44.functions.invoke('detectParasiteDraw', {});
    } catch { /* ignore */ }
    await refetch();
    setAnalyzing(false);
  };

  const productionScorecards = scorecards.filter(s => productionDeviceIds.has(s.telematics_device_id));

  const sorted = [...productionScorecards].sort((a, b) => {
    const order = { critical: 0, severe: 1, warning: 2, healthy: 3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4) || (b.drain_rate_v_per_hr || 0) - (a.drain_rate_v_per_hr || 0);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black text-pink-600 uppercase tracking-widest">Battery Health</p>
          <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: 'var(--font-syne)' }}>Parasite Draw Monitor</h1>
          <p className="text-sm text-gray-500">Battery drain detection for your vehicles. Auto-remediation active.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={analyzing || isFetching} className="gap-2">
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {analyzing ? 'Analyzing…' : 'Refresh'}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-3xl bg-white border border-gray-100 p-8 text-center text-gray-500">
          <Battery className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>No battery health data yet. Data appears once your telematics devices report voltage.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map(sc => (
            <BatteryHealthScorecard key={sc.id} scorecard={sc} vehicle={sc.vehicle_id ? vehicleMap.get(sc.vehicle_id) : null} onClick={() => setSelected(sc)} />
          ))}
        </div>
      )}

      <BatteryHealthDetailDrawer scorecard={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}