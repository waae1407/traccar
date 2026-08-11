import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Battery, Activity, Clock, Zap, CheckCircle2, AlertTriangle, Gauge } from 'lucide-react';

const SEVERITY_BADGE = {
  healthy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  severe: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
};

function DetailRow({ icon: Icon, label, value, valueClass }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className={`text-sm font-bold ${valueClass || 'text-white'}`}>{value}</span>
    </div>
  );
}

export default function BatteryHealthDetailDrawer({ scorecard, open, onOpenChange }) {
  if (!scorecard) return null;
  const samples = scorecard.voltage_samples_30min || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Battery className="h-5 w-5 text-primary" />
            {scorecard.vehicle_name || scorecard.device_unique_id}
          </SheetTitle>
          <SheetDescription>Parasite draw analysis & battery health</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Badge className={SEVERITY_BADGE[scorecard.severity] || SEVERITY_BADGE.healthy}>
            {scorecard.severity?.toUpperCase() || 'HEALTHY'}
          </Badge>

          {/* Relay & Start Status */}
          <div className="rounded-xl border border-border p-3 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Relay & Start Status</p>
            <div className="flex items-center gap-2">
              {scorecard.will_start === false ? (
                <AlertTriangle className="h-5 w-5 text-red-400" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              )}
              <span className={`text-sm font-bold ${scorecard.will_start === false ? 'text-red-400' : 'text-emerald-400'}`}>
                {scorecard.will_start === false ? "Vehicle Won't Start" : 'Vehicle Will Start'}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Relay state</span>
              <span className={`text-sm font-bold ml-auto ${
                scorecard.relay_state === 'open' && scorecard.will_start === false
                  ? 'text-red-400'
                  : scorecard.relay_state === 'open'
                    ? 'text-sky-400'
                    : scorecard.relay_state === 'closed'
                      ? 'text-emerald-400'
                      : 'text-muted-foreground'
              }`}>
                {String(scorecard.relay_state || 'unknown').toUpperCase()}
              </span>
            </div>
            {scorecard.relay_state === 'open' && scorecard.will_start !== false && (
              <div className="rounded-lg bg-sky-500/5 border border-sky-500/20 px-3 py-2">
                <p className="text-xs text-sky-300">Power-save active — relay will auto-close when ignition turns on. This does NOT prevent starting.</p>
              </div>
            )}
            {scorecard.no_start_reason && (
              <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2">
                <p className="text-xs text-red-300">{scorecard.no_start_reason}</p>
              </div>
            )}
            {scorecard.last_relay_command && (
              <p className="text-xs text-muted-foreground">
                Last command: {scorecard.last_relay_command === 'power_save' ? 'Power-save (019,0) → relay open while parked (auto-closes on ignition)' : 'Restore starter (007,1,0) → relay closed'}
                {scorecard.last_relay_command_at && ` · ${new Date(scorecard.last_relay_command_at).toLocaleString()}`}
              </p>
            )}
          </div>

          {/* Key metrics */}
          <div className="space-y-2">
            <DetailRow icon={Battery} label="Resting voltage" value={`${scorecard.resting_voltage?.toFixed(2) || '—'} V`}
              valueClass={scorecard.resting_voltage < 11.8 ? 'text-red-400' : scorecard.resting_voltage < 12.2 ? 'text-yellow-400' : 'text-emerald-400'} />
            <DetailRow icon={Activity} label="Drain rate" value={`${scorecard.drain_rate_v_per_hr?.toFixed(2) || '0.00'} V/hr`}
              valueClass={scorecard.drain_rate_v_per_hr > 0.5 ? 'text-red-400' : scorecard.drain_rate_v_per_hr > 0.2 ? 'text-yellow-400' : 'text-emerald-400'} />
            <DetailRow icon={Clock} label="Projected time to dead" value={scorecard.projected_hours_to_dead !== null ? `${scorecard.projected_hours_to_dead.toFixed(1)} hours` : 'No drain'}
              valueClass={scorecard.projected_hours_to_dead !== null && scorecard.projected_hours_to_dead < 4 ? 'text-red-400' : 'text-white'} />
            <DetailRow icon={Gauge} label="Battery health score" value={`${scorecard.battery_health_score || '—'} / 100`}
              valueClass={scorecard.battery_health_score >= 75 ? 'text-emerald-400' : scorecard.battery_health_score >= 60 ? 'text-yellow-400' : 'text-red-400'} />
          </div>

          {/* Voltage chart */}
          {samples.length >= 2 && (
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Voltage trend (30 min)</p>
              <VoltageChart samples={samples} />
            </div>
          )}

          {/* Remediation status */}
          {(scorecard.auto_remediated || scorecard.power_save_active) && (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-sky-400">Remediation</p>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-sky-400" />
                <span className="text-sm text-sky-300">
                  {scorecard.auto_remediated ? 'Power-save auto-applied' : 'Power-save active'}
                  {scorecard.auto_remediated_at && ` · ${new Date(scorecard.auto_remediated_at).toLocaleTimeString()}`}
                </span>
              </div>
              {scorecard.remediation_verified ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm text-emerald-300">Drain stopped — remediation verified</span>
                </div>
              ) : scorecard.auto_remediated ? (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  <span className="text-sm text-yellow-300">Verifying drain has stopped…</span>
                </div>
              ) : null}
            </div>
          )}

          {/* Device info */}
          <div className="rounded-xl border border-border p-3 space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Device</p>
            <p className="text-sm text-white">{scorecard.device_unique_id}</p>
            {scorecard.host_name && <p className="text-xs text-muted-foreground">Host: {scorecard.host_name}</p>}
            <div className="flex gap-3 pt-1">
              <span className="text-xs text-muted-foreground">Ignition: <span className="text-white">{scorecard.ignition_status}</span></span>
              <span className="text-xs text-muted-foreground">Online: <span className="text-white">{scorecard.online_status}</span></span>
            </div>
            {scorecard.last_analysis_at && (
              <p className="text-xs text-muted-foreground pt-1">Last analysis: {new Date(scorecard.last_analysis_at).toLocaleString()}</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VoltageChart({ samples }) {
  const volts = samples.map(s => s.v);
  const min = Math.min(...volts, 10);
  const max = Math.max(...volts, 13);
  const range = max - min || 1;
  const w = 280;
  const h = 100;
  const points = volts.map((v, i) => {
    const x = (i / Math.max(volts.length - 1, 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastV = volts[volts.length - 1];
  const color = lastV < 11.8 ? '#ef4444' : lastV < 12.2 ? '#eab308' : '#10b981';

  return (
    <svg width={w} height={h} className="w-full">
      <line x1="0" y1={h - ((DEAD_VOLTAGE - min) / range) * h} x2={w} y2={h - ((DEAD_VOLTAGE - min) / range) * h} stroke="#ef4444" strokeWidth="1" strokeDasharray="4,4" opacity="0.3" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={h - ((lastV - min) / range) * h} r="4" fill={color} />
    </svg>
  );
}

const DEAD_VOLTAGE = 10.5;