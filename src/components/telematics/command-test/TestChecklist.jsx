import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

export default function TestChecklist({ session, commands, notes, setNotes, onMark, onComplete, completing }) {
  if (!session) return null;
  const supportedFields = commands.map((command) => command.result_field);
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
            return (
              <div key={command.key} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div>
                  <p className="font-bold text-white">{command.label}</p>
                  <p className="text-xs text-white/40">{value}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant={value === 'pass' ? 'default' : 'outline'} onClick={() => onMark(command.result_field, 'pass')} className={value === 'pass' ? '' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}><CheckCircle2 className="h-4 w-4" /> Pass</Button>
                  <Button size="sm" variant={value === 'fail' ? 'destructive' : 'outline'} onClick={() => onMark(command.result_field, 'fail')} className={value === 'fail' ? '' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}><XCircle className="h-4 w-4" /> Fail</Button>
                </div>
              </div>
            );
          })}
        </div>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Session notes" className="bg-white/5 text-white placeholder:text-white/35" />
        <Button onClick={onComplete} disabled={!completeReady || completing} className="w-full">Complete Test Session</Button>
        {!completeReady && <p className="text-center text-xs text-white/45">Mark all supported commands pass or fail before completing.</p>}
      </CardContent>
    </Card>
  );
}