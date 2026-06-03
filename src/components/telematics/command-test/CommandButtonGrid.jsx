import React, { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Lightbulb, Loader2, Lock, MapPin, Power, RefreshCw, Unlock, Volume2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const ICONS = { locate: MapPin, status: Activity, lock: Lock, unlock: Unlock, horn: Volume2, lights: Lightbulb, horn_lights: Volume2, alarm_pulse: Volume2, disable_starter: Power, restore_starter: RefreshCw };
const CONFIRM_TEXT = { disable_starter: 'DISABLE STARTER', restore_starter: 'RESTORE STARTER' };

export default function CommandButtonGrid({ commands, execution, onSend, sending, session, onMark }) {
  const [checked, setChecked] = useState({});
  const [typed, setTyped] = useState({});

  if (!commands?.length) return null;

  return (
    <Card className="glass border-white/10">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Command Test</p>
            <h2 className="mt-1 text-xl font-black text-white">Send one supported command at a time</h2>
          </div>
          <Badge className={execution?.dry_run ? 'bg-yellow-500 text-black' : 'bg-emerald-500 text-white'}>{execution?.dry_run ? 'Dry Run' : 'Live'}</Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {commands.map((command) => {
            const Icon = ICONS[command.key] || Activity;
            const isStarter = !!command.starter;
            const ready = !isStarter || (checked[command.key] && typed[command.key] === CONFIRM_TEXT[command.key]);
            return (
              <div key={command.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5" /></div>
                  <p className="font-black text-white">{command.label}</p>
                </div>
                {isStarter && (
                  <div className="mb-3 space-y-3 rounded-xl border border-red-500/25 bg-red-500/10 p-3">
                    <div className="flex gap-2 text-red-200"><AlertTriangle className="h-4 w-4 flex-shrink-0" /><p className="text-xs font-semibold">Use starter commands only on approved test vehicles. Do not test on active customer rentals.</p></div>
                    <label className="flex items-start gap-2 text-xs font-semibold text-white/80">
                      <input type="checkbox" checked={!!checked[command.key]} onChange={(event) => setChecked((prev) => ({ ...prev, [command.key]: event.target.checked }))} className="mt-0.5" />
                      I understand this affects vehicle starter control.
                    </label>
                    <Input value={typed[command.key] || ''} onChange={(event) => setTyped((prev) => ({ ...prev, [command.key]: event.target.value }))} placeholder={CONFIRM_TEXT[command.key]} className="h-9 bg-white/5 text-white placeholder:text-white/30" />
                  </div>
                )}
                <Button className="w-full" disabled={sending === command.key || !ready} onClick={() => onSend(command.key, isStarter)}>
                  {sending === command.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                  Send {command.label}
                </Button>

                {session && command.result_field && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white/45">Observed result: {session[command.result_field] || 'untested'}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant={session[command.result_field] === 'pass' ? 'default' : 'outline'} onClick={() => onMark(command.result_field, 'pass')} className={session[command.result_field] === 'pass' ? '' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}>
                        <CheckCircle2 className="h-4 w-4" /> Pass
                      </Button>
                      <Button size="sm" variant={session[command.result_field] === 'fail' ? 'destructive' : 'outline'} onClick={() => onMark(command.result_field, 'fail')} className={session[command.result_field] === 'fail' ? '' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}>
                        <XCircle className="h-4 w-4" /> Fail
                      </Button>
                    </div>
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