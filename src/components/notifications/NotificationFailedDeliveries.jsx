import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';

const CHANNEL_COLORS = {
  sms: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  email: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  inapp: 'bg-pink-500/15 text-pink-300 border-pink-500/25',
};

export default function NotificationFailedDeliveries() {
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(null);

  const { data: failures = [], isLoading } = useQuery({
    queryKey: ['notif-failures'],
    queryFn: () => base44.entities.NotificationDeliveryFailure.filter({ resolved: false }, '-first_failed_at', 100),
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const { data: resolved = [] } = useQuery({
    queryKey: ['notif-failures-resolved'],
    queryFn: () => base44.entities.NotificationDeliveryFailure.filter({ resolved: true }, '-resolved_at', 20),
    staleTime: 30000,
  });

  const resolve = useMutation({
    mutationFn: (id) => base44.entities.NotificationDeliveryFailure.update(id, { resolved: true, resolved_at: new Date().toISOString() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-failures'] }),
  });

  const triggerRetry = async () => {
    setRetrying('all');
    await base44.functions.invoke('retryFailedNotifications', {}).catch(() => {});
    qc.invalidateQueries({ queryKey: ['notif-failures'] });
    setRetrying(null);
  };

  if (isLoading) return <div className="text-center py-12 text-white/40">Loading failures...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-white">{failures.length} Unresolved Failures</h3>
          <p className="text-xs text-white/40">{resolved.length} resolved recently</p>
        </div>
        <Button onClick={triggerRetry} disabled={retrying === 'all' || failures.length === 0} size="sm" className="gap-2">
          {retrying === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Retry All
        </Button>
      </div>

      {failures.length === 0 ? (
        <Card className="glass border-white/10">
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-white font-semibold">No unresolved failures</p>
            <p className="text-sm text-white/40 mt-1">All notifications delivered successfully</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {failures.map(f => (
            <Card key={f.id} className="glass border-red-500/20">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge className={`border text-xs ${CHANNEL_COLORS[f.channel] || 'bg-white/10 text-white/60 border-white/10'}`}>{f.channel}</Badge>
                      <Badge className="bg-white/5 text-white/60 border border-white/10 text-xs">{f.provider}</Badge>
                      <span className="text-xs text-white/40">Attempt {f.retry_count + 1}/5</span>
                    </div>
                    <div className="text-sm font-semibold text-white truncate">{f.recipient}</div>
                    <div className="text-xs text-white/40 mt-0.5">{f.source_event || f.event_type}</div>
                    <div className="text-xs text-red-300 mt-1 break-words">{f.failure_reason}</div>
                    {f.next_retry_at && (
                      <div className="text-xs text-yellow-300/70 mt-1">Next retry: {new Date(f.next_retry_at).toLocaleString()}</div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => resolve.mutate(f.id)}>
                      Mark Resolved
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-black text-white/60 uppercase tracking-wider mb-3">Recently Resolved</h4>
          <div className="space-y-2">
            {resolved.map(f => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white/70">{f.recipient}</span>
                  <span className="text-xs text-white/30 ml-2">via {f.channel}</span>
                </div>
                <span className="text-xs text-white/30">{f.resolved_at ? new Date(f.resolved_at).toLocaleString() : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}