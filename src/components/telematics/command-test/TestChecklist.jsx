import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

export default function TestChecklist({ session, commands, notes, setNotes, onComplete, completing }) {
  if (!session) return null;
  const supportedFields = commands.map((command) => command.result_field).filter(Boolean);
  const completeReady = supportedFields.every((field) => ['pass', 'fail'].includes(session[field]));
  return (
    <Card className="glass border-white/10">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Verification Summary</p>
            <h2 className="mt-1 text-xl font-black text-white">Complete vehicle device verification</h2>
          </div>
          <Badge className="bg-white/10 text-white">Session {session.status}</Badge>
        </div>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Verification notes" className="bg-white/5 text-white placeholder:text-white/35" />
        <Button onClick={onComplete} disabled={!completeReady || completing} className="w-full">Complete Verification</Button>
        {!completeReady && <p className="text-center text-xs text-white/45">Wait for all supported actions to receive a verified or needs-review result before completing.</p>}
      </CardContent>
    </Card>
  );
}