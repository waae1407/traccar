import React, { useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import NoranReplyCell from './NoranReplyCell';
import { businessText, commandLabel, statusLabel } from './businessLanguage';

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

export default function CommandHistoryPanel({ commands, onRefresh, loading }) {
  const [isOpen, setIsOpen] = useState(false);
  const ToggleIcon = isOpen ? ChevronDown : ChevronRight;

  return (
    <Card className="glass border-white/10">
      <CardContent className="p-5">
        <button type="button" onClick={() => setIsOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Action Activity</p>
            <h2 className="mt-1 text-xl font-black text-white">Recent vehicle actions</h2>
          </div>
          <ToggleIcon className="h-5 w-5 text-white/60" />
        </button>
        {isOpen && (
          <div className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" onClick={onRefresh} disabled={loading} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
                <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="border-white/10"><TableHead>Action</TableHead><TableHead>Status</TableHead><TableHead>Sent</TableHead><TableHead>Vehicle Response</TableHead><TableHead>Review Note</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(commands || []).map((command) => (
                    <TableRow key={command.id} className="border-white/10">
                      <TableCell className="font-semibold text-white">{commandLabel(command.command_type)}</TableCell>
                      <TableCell>
                        <Badge className={
                          (command.queue_status === 'failed' || command.queue_status === 'expired') ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                          command.queue_status === 'pending_waiting_for_fresh_session' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                          command.queue_status === 'queued_after_fresh_session' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                          'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                        }>
                          {command.queue_status === 'pending_waiting_for_fresh_session' ? '⏳ Waiting for heartbeat' :
                           command.queue_status === 'queued_after_fresh_session' ? '📡 Queued after heartbeat' :
                           statusLabel(command.queue_status || command.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-white/60">{formatDate(command.sent_at || command.created_at || command.created_date)}</TableCell>
                      <TableCell><NoranReplyCell command={command} /></TableCell>
                      <TableCell className="text-red-300">{businessText(command.failure_reason)}</TableCell>
                    </TableRow>
                  ))}
                  {!commands?.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-white/45">No action history yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}