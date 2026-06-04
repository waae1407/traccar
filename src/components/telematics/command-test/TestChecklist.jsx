import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

const RESULT_STYLES = {
  pass: { badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25', icon: CheckCircle2, label: 'Pass' },
  fail: { badge: 'bg-red-500/15 text-red-300 border border-red-500/25', icon: XCircle, label: 'Fail' },
  ready: { badge: 'bg-white/10 text-white/60 border border-white/10', icon: Clock, label: 'Not sent' },
  untested: { badge: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/25', icon: Clock, label: 'Waiting' },
  not_supported: { badge: 'bg-white/10 text-white/55 border border-white/10', icon: AlertTriangle, label: 'Not supported' }
};

export default function TestChecklist({ session, commands, sentCommands = {}, notes, setNotes, onComplete, completing }) {
  if (!session) return null;
  const supportedFields = commands.map((command) => command.result_field).filter(Boolean);
  const completeReady = supportedFields.every((field) => ['pass', 'fail'].includes(session[field]));
  return (
    <Card className="glass border-white/10">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Test Checklist</p>
            <h2 className="mt-1 text-xl font-black text-white">Observed device behavior</h2>
          </div>
          <Badge className="bg-white/10 text-white">Session {session.status}</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {commands.map((command) => {
            const value = session[command.result_field] || 'untested';
            const wasSent = !!sentCommands[command.key] || value !== 'untested';
            const displayValue = !wasSent && value === 'untested' ? 'ready' : value;
            const detail = session.result_details?.[command.result_field];
            const style = RESULT_STYLES[displayValue] || RESULT_STYLES.untested;
            const ResultIcon = style.icon;
            return (
              <div key={command.key} className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div>
                  <p className="font-bold text-white">{command.label}</p>
                  <p className="mt-1 text-xs text-white/45">{detail?.reason || (displayValue === 'ready' ? 'Not sent in this session.' : 'Awaiting automated device reply.')}</p>
                </div>
                <Badge className={style.badge}><ResultIcon className="mr-1 h-3.5 w-3.5" />{style.label}</Badge>
              </div>
            );
          })}
        </div>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Session notes" className="bg-white/5 text-white placeholder:text-white/35" />
        <Button onClick={onComplete} disabled={!completeReady || completing} className="w-full">Complete Test Session</Button>
        {!completeReady && <p className="text-center text-xs text-white/45">Wait for all supported commands to receive an automated pass or fail before completing.</p>}
      </CardContent>
    </Card>
  );
}