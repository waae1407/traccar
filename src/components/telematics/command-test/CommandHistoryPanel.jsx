import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import NoranReplyCell from './NoranReplyCell';

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

export default function CommandHistoryPanel({ commands, onRefresh, loading }) {
  return (
    <Card className="glass border-white/10">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Command Activity</p>
            <h2 className="mt-1 text-xl font-black text-white">Recent device commands</h2>
          </div>
          <Button variant="outline" onClick={onRefresh} disabled={loading} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="border-white/10"><TableHead>Command</TableHead><TableHead>Status</TableHead><TableHead>Sent</TableHead><TableHead>Device Response</TableHead><TableHead>Review Note</TableHead></TableRow></TableHeader>
            <TableBody>
              {(commands || []).map((command) => (
                <TableRow key={command.id} className="border-white/10">
                  <TableCell className="font-semibold text-white">{command.command_type}</TableCell>
                  <TableCell><Badge className={command.queue_status === 'failed' || command.queue_status === 'expired' ? 'bg-red-500 text-white' : 'bg-emerald-500/15 text-emerald-300'}>{command.queue_status || command.status}</Badge></TableCell>
                  <TableCell className="text-white/60">{formatDate(command.sent_at || command.created_at || command.created_date)}</TableCell>
                  <TableCell><NoranReplyCell command={command} /></TableCell>
                  <TableCell className="text-red-300">{command.failure_reason || '—'}</TableCell>
                </TableRow>
              ))}
              {!commands?.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-white/45">No commands yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}