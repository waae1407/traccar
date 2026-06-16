import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Inbox, ArchiveX, Trash2, RefreshCw } from 'lucide-react';

export default function NotificationDeadLetterQueue() {
  const qc = useQueryClient();

  const { data: letters = [], isLoading } = useQuery({
    queryKey: ['notif-dead-letters'],
    queryFn: () => base44.entities.NotificationDeadLetter.filter({ archived: false }, '-created_date', 100),
    staleTime: 30000,
  });

  const archive = useMutation({
    mutationFn: (id) => base44.entities.NotificationDeadLetter.update(id, { archived: true, archived_at: new Date().toISOString() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-dead-letters'] }),
  });

  const del = useMutation({
    mutationFn: (id) => base44.entities.NotificationDeadLetter.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-dead-letters'] }),
  });

  if (isLoading) return <div className="text-center py-12 text-white/40">Loading dead letters...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-white">{letters.length} Dead Letters</h3>
          <p className="text-xs text-white/40">Notifications that exhausted all retry attempts</p>
        </div>
      </div>

      {letters.length === 0 ? (
        <Card className="glass border-white/10">
          <CardContent className="py-16 text-center">
            <Inbox className="h-10 w-10 text-white/20 mx-auto mb-3" />
            <p className="text-white font-semibold">Dead letter queue is empty</p>
            <p className="text-sm text-white/40 mt-1">All notifications resolved within retry window</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {letters.map(d => (
            <Card key={d.id} className="glass border-red-500/25">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge className="bg-red-500/20 text-red-300 border border-red-500/30 text-xs">{d.channel}</Badge>
                      <Badge className="bg-white/5 text-white/60 border border-white/10 text-xs">{d.provider || 'unknown'}</Badge>
                      <Badge className="bg-orange-500/15 text-orange-300 border border-orange-500/25 text-xs">{d.retry_count} attempts</Badge>
                    </div>
                    <div className="text-sm font-semibold text-white">{d.recipient}</div>
                    <div className="text-xs text-white/40 mt-0.5">{d.source_event} · {d.source_entity_type}</div>
                    <div className="text-xs text-red-300/70 mt-1">{d.failure_reason}</div>
                    <div className="text-xs text-white/30 mt-1">{d.created_date ? new Date(d.created_date).toLocaleString() : ''}</div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => archive.mutate(d.id)}>
                      <ArchiveX className="h-3 w-3" /> Archive
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs gap-1 border-red-500/30 text-red-300 hover:bg-red-500/10" onClick={() => del.mutate(d.id)}>
                      <Trash2 className="h-3 w-3" /> Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}