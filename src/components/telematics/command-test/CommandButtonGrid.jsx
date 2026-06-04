import React, { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Lightbulb, Loader2, Lock, MapPin, Power, RefreshCw, Unlock, Volume2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { businessText, commandLabel } from './businessLanguage';

const ICONS = { locate: MapPin, status: Activity, lock: Lock, unlock: Unlock, horn: Volume2, lights: Lightbulb, horn_lights: Volume2, alarm_pulse: Volume2, disable_starter: Power, restore_starter: RefreshCw };

const RESULT_STYLES = {
  pass: { badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25', icon: CheckCircle2, label: 'Verified' },
  acknowledged: { badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 glow-sm', icon: CheckCircle2, label: 'Acknowledged' },
  fail: { badge: 'bg-red-500/15 text-red-300 border border-red-500/25', icon: XCircle, label: 'Needs review' },
  ready: { badge: 'bg-white/10 text-white/60 border border-white/10', icon: Clock, label: 'Ready' },
  untested: { badge: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/25', icon: Clock, label: 'Awaiting response' },
  not_supported: { badge: 'bg-white/10 text-white/55 border border-white/10', icon: AlertTriangle, label: 'Not supported' }
};

const RESPONSE_STATUSES = new Set(['acknowledged', 'executed', 'confirmed']);
const CLOSED_STATUSES = new Set(['acknowledged', 'executed', 'confirmed', 'failed', 'expired']);

export default function CommandButtonGrid({ commands, execution, onSend, sending, session, sentCommands = {}, commandHistory = [] }) {
  const [checked, setChecked] = useState({});

  if (!commands?.length) return null;

  const latestCommandFor = (commandType) => (commandHistory || []).find((command) => command.command_type === commandType);
  const hasPendingCommand = commands.some((item) => {
    const value = session?.[item.result_field] || 'untested';
    const latestCommand = latestCommandFor(item.key);
    const status = latestCommand?.queue_status || latestCommand?.status;
    return sentCommands[item.key] && value === 'untested' && !CLOSED_STATUSES.has(status);
  });

  return (
    <Card className="glass border-white/10">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Command Verification</p>
            <h2 className="mt-1 text-xl font-black text-white">Verify one supported vehicle action at a time</h2>
          </div>
          <Badge className={execution?.dry_run ? 'bg-yellow-500 text-black' : 'bg-emerald-500 text-white'}>{execution?.dry_run ? 'Simulation Mode' : 'Live Actions'}</Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {commands.map((command) => {
            const Icon = ICONS[command.key] || Activity;
            const isStarter = !!command.starter;
            const ready = !isStarter || checked[command.key];
            const latestCommand = latestCommandFor(command.key);
            const commandStatus = latestCommand?.queue_status || latestCommand?.status;
            const detail = session?.result_details?.[command.result_field];
            const rawValue = session?.[command.result_field] || 'untested';
            const value = rawValue === 'fail' && detail?.command_id && latestCommand?.id && detail.command_id !== latestCommand.id
              ? 'untested'
              : rawValue;
            const derivedValue = value === 'untested' && RESPONSE_STATUSES.has(commandStatus)
              ? (commandStatus === 'acknowledged' ? 'acknowledged' : 'pass')
              : value;
            const wasSent = !!sentCommands[command.key] || value !== 'untested' || !!latestCommand;
            const displayValue = !wasSent && value === 'untested' ? 'ready' : derivedValue;
            const ackReason = latestCommand?.provider_response?.mt20_reply_evaluation?.reason;
            const displayLabel = commandLabel(command.key);
            const style = RESULT_STYLES[displayValue] || RESULT_STYLES.untested;
            const ResultIcon = style.icon;
            const isThisPending = sentCommands[command.key] && value === 'untested' && !CLOSED_STATUSES.has(commandStatus);
            return (
              <div key={command.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5" /></div>
                  <p className="font-black text-white">{displayLabel}</p>
                </div>
                {isStarter && (
                  <div className="mb-3 rounded-xl border border-red-500/25 bg-red-500/10 p-3">
                    <div className="flex gap-2 text-red-200 mb-3"><AlertTriangle className="h-4 w-4 flex-shrink-0" /><p className="text-xs font-semibold">Use starter controls only on approved vehicles. Do not run on active customer rentals.</p></div>
                    <label className="flex items-start gap-2 text-xs font-semibold text-white/80">
                      <input type="checkbox" checked={!!checked[command.key]} onChange={(event) => setChecked((prev) => ({ ...prev, [command.key]: event.target.checked }))} className="mt-0.5" />
                      I understand this affects vehicle starter control.
                    </label>
                  </div>
                )}
                <Button className={`w-full ${displayValue === 'acknowledged' || displayValue === 'pass' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`} disabled={!!sending || !ready || (hasPendingCommand && !isThisPending)} onClick={() => onSend(command.key, isStarter)}>
                  {sending === command.key || isThisPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                  Verify {displayLabel}
                </Button>

                {session && command.result_field && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white/45">Vehicle response</p>
                    <Badge className={style.badge}><ResultIcon className="mr-1 h-3.5 w-3.5" />{style.label}</Badge>
                    <p className="mt-2 text-xs text-white/55">{businessText(detail?.reason || ackReason || (displayValue === 'ready' ? 'Click Verify to check this vehicle action.' : 'Status updates automatically when the vehicle response is processed.'))}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}