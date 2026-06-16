import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Mail, CheckCircle2, XCircle, TrendingUp } from 'lucide-react';

function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}

export default function NotificationEmailAnalytics() {
  const today = startOfToday();

  const { data: events = [] } = useQuery({
    queryKey: ['notif-email-events'],
    queryFn: () => base44.entities.ActivityEvent.filter({ actor_id: 'sendCriticalNotification' }, '-created_date', 500),
    staleTime: 30000,
  });

  const emailEvents = events.filter(e => e.metadata?.channel === 'email');
  const todayEmail = emailEvents.filter(e => e.created_date >= today);
  const sentToday = todayEmail.filter(e => e.metadata?.provider_status === 'sent');
  const failedToday = todayEmail.filter(e => e.metadata?.provider_status === 'failed');
  const successRate = sentToday.length + failedToday.length > 0
    ? Math.round((sentToday.length / (sentToday.length + failedToday.length)) * 100)
    : 100;

  // By event type
  const byType = {};
  sentToday.forEach(e => {
    const type = e.metadata?.source_event || 'other';
    byType[type] = (byType[type] || 0) + 1;
  });
  const sortedTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]);

  const allFailed = emailEvents.filter(e => e.metadata?.provider_status === 'failed').slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass border-white/10">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <Mail className="h-5 w-5 text-cyan-400" />
              <span className="text-xs text-white/50 font-semibold uppercase tracking-wider">Sent Today</span>
            </div>
            <div className="text-3xl font-black text-cyan-400">{sentToday.length}</div>
          </CardContent>
        </Card>
        <Card className="glass border-white/10">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <XCircle className="h-5 w-5 text-red-400" />
              <span className="text-xs text-white/50 font-semibold uppercase tracking-wider">Failed Today</span>
            </div>
            <div className="text-3xl font-black text-red-400">{failedToday.length}</div>
          </CardContent>
        </Card>
        <Card className="glass border-white/10">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
              <span className="text-xs text-white/50 font-semibold uppercase tracking-wider">Success Rate</span>
            </div>
            <div className="text-3xl font-black text-emerald-400">{successRate}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass border-white/10">
          <CardContent className="p-5">
            <h3 className="text-sm font-black text-white mb-4">Emails by Event Type (Today)</h3>
            {sortedTypes.length === 0 ? (
              <div className="text-center py-6 text-white/30 text-sm">No emails sent today</div>
            ) : (
              <div className="space-y-2">
                {sortedTypes.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <span className="text-sm text-white/70 capitalize">{type.replace(/_/g, ' ')}</span>
                    <span className="text-sm font-bold text-cyan-400">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-white/10">
          <CardContent className="p-5">
            <h3 className="text-sm font-black text-white mb-4">Recent Email Failures</h3>
            {allFailed.length === 0 ? (
              <div className="text-center py-6 text-white/30 text-sm">No email failures</div>
            ) : (
              <div className="space-y-2">
                {allFailed.map((e, i) => (
                  <div key={i} className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2">
                    <div className="text-xs font-semibold text-white">{e.metadata?.recipient_email || e.user_email}</div>
                    <div className="text-xs text-red-300/70">{e.metadata?.failure_reason || 'Unknown error'}</div>
                    <div className="text-xs text-white/30">{e.created_date ? new Date(e.created_date).toLocaleString() : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}