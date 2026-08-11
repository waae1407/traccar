import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Battery, BatteryLow, BatteryWarning, AlertTriangle, CheckCircle2, Zap, Clock, Activity } from 'lucide-react';

const SEVERITY_CONFIG = {
  healthy: { color: 'emerald', icon: CheckCircle2, label: 'Healthy', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  warning: { color: 'yellow', icon: BatteryWarning, label: 'Warning', badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  severe: { color: 'orange', icon: BatteryLow, label: 'Severe Drain', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  critical: { color: 'red', icon: AlertTriangle, label: 'Critical', badge: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

const HEALTH_LABEL_CONFIG = {
  excellent: 'text-emerald-400',
  good: 'text-emerald-400',
  fair: 'text-yellow-400',
  poor: 'text-orange-400',
  critical: 'text-red-400',
};

function Sparkline({ samples }) {
  if (!samples || samples.length < 2) return <div className="h-10 flex items-center text-xs text-muted-foreground">No trend data</div>;
  const volts = samples.map(s => s.v);
  const min = Math.min(...volts);
  const max = Math.max(...volts);
  const range = max - min || 1;
  const w = 120;
  const h = 36;
  const points = volts.map((v, i) => {
    const x = (i / (volts.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = volts[volts.length - 1] < 11.8 ? '#ef4444' : volts[volts.length - 1] < 12.2 ? '#eab308' : '#10b981';
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={h - ((volts[volts.length - 1] - min) / range) * h} r="3" fill={color} />
    </svg>
  );
}

export default function BatteryHealthScorecard({ scorecard, onClick, vehicle }) {
  const config = SEVERITY_CONFIG[scorecard.severity] || SEVERITY_CONFIG.healthy;
  const SevIcon = config.icon;
  const voltageColor = scorecard.resting_voltage < 11.8 ? 'text-red-400' : scorecard.resting_voltage < 12.2 ? 'text-yellow-400' : 'text-emerald-400';
  const vehicleLabel = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim().replace(/\s+/g, ' ') : '';
  const vehicleVin = vehicle?.vin || '';

  return (
    <Card
      className={`glass glass-hover cursor-pointer transition-all hover:-translate-y-0.5 ${onClick ? '' : ''} border-l-4 ${
        scorecard.severity === 'critical' ? 'border-l-red-500' :
        scorecard.severity === 'severe' ? 'border-l-orange-500' :
        scorecard.severity === 'warning' ? 'border-l-yellow-500' : 'border-l-emerald-500'
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-${config.color}-500/15`}>
              <SevIcon className={`h-4 w-4 text-${config.color}-400`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{vehicleLabel || scorecard.vehicle_name || scorecard.device_unique_id}</p>
              <p className="text-xs text-muted-foreground truncate">{vehicleVin || scorecard.device_unique_id}</p>
            </div>
          </div>
          <Badge className={config.badge}>{config.label}</Badge>
        </div>

        {/* Start status banner */}
        <div className={`rounded-lg px-3 py-2 flex items-center gap-2 ${
          scorecard.will_start === false
            ? 'bg-red-500/10 border border-red-500/20'
            : scorecard.relay_state === 'closed'
              ? 'bg-emerald-500/10 border border-emerald-500/20'
              : 'bg-amber-500/10 border border-amber-500/20'
        }`}>
          {scorecard.will_start === false ? (
            <>
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-red-300">⚠ Won't Start</p>
                <p className="text-[10px] text-red-400/70 truncate">
                  {scorecard.relay_state === 'open' ? 'GPS relay OPEN — not mechanical' : (scorecard.no_start_reason || 'Unknown')}
                </p>
              </div>
            </>
          ) : scorecard.relay_state === 'closed' ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-300">✓ Will Start</p>
                <p className="text-[10px] text-emerald-400/60">Relay closed · battery OK</p>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-300">Likely OK</p>
                <p className="text-[10px] text-amber-400/60">Relay state unknown — awaiting sync</p>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-black/20 p-2 text-center">
            <Battery className="h-3 w-3 mx-auto text-muted-foreground mb-1" />
            <p className={`text-base font-black ${voltageColor}`}>{scorecard.resting_voltage?.toFixed(1) || '—'}</p>
            <p className="text-xs text-muted-foreground">Volts</p>
          </div>
          <div className="rounded-lg bg-black/20 p-2 text-center">
            <Activity className="h-3 w-3 mx-auto text-muted-foreground mb-1" />
            <p className={`text-base font-black ${scorecard.drain_rate_v_per_hr > 0.5 ? 'text-red-400' : scorecard.drain_rate_v_per_hr > 0.2 ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {scorecard.drain_rate_v_per_hr?.toFixed(2) || '0.00'}
            </p>
            <p className="text-xs text-muted-foreground">V/hr</p>
          </div>
          <div className="rounded-lg bg-black/20 p-2 text-center">
            <Clock className="h-3 w-3 mx-auto text-muted-foreground mb-1" />
            <p className={`text-base font-black ${scorecard.projected_hours_to_dead !== null && scorecard.projected_hours_to_dead < 4 ? 'text-red-400' : 'text-white'}`}>
              {scorecard.projected_hours_to_dead !== null ? `${scorecard.projected_hours_to_dead.toFixed(0)}h` : '∞'}
            </p>
            <p className="text-xs text-muted-foreground">To dead</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkline samples={scorecard.voltage_samples_30min} />
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">Health Score</p>
            <p className={`text-lg font-black ${HEALTH_LABEL_CONFIG[scorecard.battery_health_label] || 'text-white'}`}>
              {scorecard.battery_health_score || '—'}
            </p>
          </div>
        </div>

        {(scorecard.auto_remediated || scorecard.power_save_active) && (
          <div className="flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-2 py-1.5">
            <Zap className="h-3 w-3 text-sky-400 shrink-0" />
            <p className="text-xs text-sky-300">
              {scorecard.remediation_verified ? 'Power-save verified ✓' : scorecard.auto_remediated ? 'Power-save auto-applied' : 'Power-save active'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}