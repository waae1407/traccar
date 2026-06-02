import React, { useState } from 'react';
import { Activity, AlertTriangle, Lightbulb, Loader2, Lock, MapPin, Power, RefreshCw, Unlock, Volume2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const ICONS = { locate: MapPin, status: Activity, lock: Lock, unlock: Unlock, horn: Volume2, lights: Lightbulb, disable_starter: Power, restore_starter: RefreshCw };
const CONFIRM_TEXT = { disable_starter: 'DISABLE STARTER', restore_starter: 'RESTORE STARTER' };

export default function CommandButtonGrid({ commands, execution, onSend, sending }) {
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
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}