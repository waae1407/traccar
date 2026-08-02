import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import BatteryHealthScorecard from '@/components/telematics/battery/BatteryHealthScorecard';
import BatteryHealthDetailDrawer from '@/components/telematics/battery/BatteryHealthDetailDrawer';
import { Battery, AlertTriangle, Activity, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminBatteryHealth() {
  const [selected, setSelected] = useState(null);
  const [sevFilter, setSevFilter] = useState('all');

  const { data: scorecards = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['battery-health-scorecards'],
    queryFn: () => base44.entities.BatteryHealthScorecard.list('-updated_date', 500),
    refetchInterval: 60_000,
  });

  const stats = {
    total: scorecards.length,
    healthy: scorecards.filter(s => s.severity === 'healthy').length,
    warning: scorecards.filter(s => s.severity === 'warning').length,
    severe: scorecards.filter(s => s.severity === 'severe').length,
    critical: scorecards.filter(s => s.severity === 'critical').length,
    autoRemediated: scorecards.filter(s => s.auto_remediated).length,
  };

  const filtered = sevFilter === 'all' ? scorecards : scorecards.filter(s => s.severity === sevFilter);
  const sorted = [...filtered].sort((a, b) => {
    const order = { critical: 0, severe: 1, warning: 2, healthy: 3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4) || (b.drain_rate_v_per_hr || 0) - (a.drain_rate_v_per_hr || 0);
  });

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-primary uppercase tracking-widest">Fleet Health</p>
          <h1 className="text-2xl font-black">Parasite Draw Monitor</h1>
          <p className="text-sm text-muted-foreground">Real-time battery drain detection across all vehicles. Auto-remediation active.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total" value={stats.total} icon={Battery} active={sevFilter === 'all'} onClick={() => setSevFilter('all')} />
        <StatCard label="Healthy" value={stats.healthy} icon={Activity} color="emerald" active={sevFilter === 'healthy'} onClick={() => setSevFilter(sevFilter === 'healthy' ? 'all' : 'healthy')} />
        <StatCard label="Warning" value={stats.warning} icon={AlertTriangle} color="yellow" active={sevFilter === 'warning'} onClick={() => setSevFilter(sevFilter === 'warning' ? 'all' : 'warning')} />
        <StatCard label="Severe" value={stats.severe} icon={AlertTriangle} color="orange" active={sevFilter === 'severe'} onClick={() => setSevFilter(sevFilter === 'severe' ? 'all' : 'severe')} />
        <StatCard label="Critical" value={stats.critical} icon={AlertTriangle} color="red" active={sevFilter === 'critical'} onClick={() => setSevFilter(sevFilter === 'critical' ? 'all' : 'critical')} />
        <StatCard label="Auto-Remediated" value={stats.autoRemediated} icon={Activity} color="sky" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading battery health data…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-border p-8 text-center text-muted-foreground">
          <Battery className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No vehicles with telematics data available.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map(sc => (
            <BatteryHealthScorecard key={sc.id} scorecard={sc} onClick={() => setSelected(sc)} />
          ))}
        </div>
      )}

      <BatteryHealthDetailDrawer scorecard={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color = 'primary', active, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="text-left disabled:cursor-default">
      <div className={`glass rounded-xl p-3 transition-all ${active ? 'ring-1 ring-primary/40 border-primary/50' : onClick ? 'hover:border-primary/30' : ''}`}>
        <Icon className={`h-4 w-4 mb-1 text-${color}-400`} />
        <p className="text-xl font-black">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </button>
  );
}