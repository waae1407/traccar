import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Activity, AlertTriangle, CheckCircle2, Mail, MessageSquare, Bell, Shield, RefreshCw, Inbox } from 'lucide-react';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function HealthScore({ score }) {
  const label = score >= 90 ? 'Healthy' : score >= 70 ? 'Warning' : 'Critical';
  const color = score >= 90 ? 'text-emerald-400' : score >= 70 ? 'text-yellow-400' : 'text-red-400';
  const bg = score >= 90 ? 'bg-emerald-500/15 border-emerald-500/25' : score >= 70 ? 'bg-yellow-500/15 border-yellow-500/25' : 'bg-red-500/15 border-red-500/25';
  return (
    <Card className={`glass border ${bg}`}>
      <CardContent className="p-6 text-center">
        <Shield className={`h-10 w-10 mx-auto mb-3 ${color}`} />
        <div className={`text-5xl font-black ${color}`}>{score}</div>
        <div className="text-white/60 text-sm mt-1">Notification Health Score</div>
        <Badge className={`mt-3 ${bg} ${color} border`}>{label}</Badge>
        <p className="text-xs text-white/40 mt-3">Based on failed %, dead letters, retry backlog</p>
      </CardContent>
    </Card>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color = 'text-white' }) {
  return (
    <Card className="glass border-white/10">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center">
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <span className="text-xs text-white/50 font-semibold uppercase tracking-wider">{label}</span>
        </div>
        <div className={`text-3xl font-black ${color}`}>{value}</div>
        {sub && <div className="text-xs text-white/40 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function NotificationDeliveryOverview() {
  const today = startOfToday();

  const { data: allEvents = [] } = useQuery({
    queryKey: ['notif-overview-events'],
    queryFn: () => base44.entities.ActivityEvent.filter({ actor_id: 'sendCriticalNotification' }, '-created_date', 500),
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: failures = [] } = useQuery({
    queryKey: ['notif-overview-failures'],
    queryFn: () => base44.entities.NotificationDeliveryFailure.filter({ resolved: false }, '-first_failed_at', 200),
    staleTime: 30000,
  });

  const { data: deadLetters = [] } = useQuery({
    queryKey: ['notif-overview-deadletters'],
    queryFn: () => base44.entities.NotificationDeadLetter.filter({ archived: false }, '-created_date', 100),
    staleTime: 30000,
  });

  const todayEvents = allEvents.filter(e => e.created_date >= today);
  const sentToday = todayEvents.filter(e => e.metadata?.provider_status === 'sent');
  const failedToday = todayEvents.filter(e => e.metadata?.provider_status === 'failed');
  const smsToday = sentToday.filter(e => e.metadata?.channel === 'sms');
  const emailToday = sentToday.filter(e => e.metadata?.channel === 'email');
  const inappToday = sentToday.filter(e => e.metadata?.channel === 'inapp');
  const dedupedToday = todayEvents.filter(e => e.summary?.includes('deduped') || e.metadata?.provider_status === 'deduped');

  const totalSent = sentToday.length;
  const totalFailed = failedToday.length;
  const successRate = totalSent + totalFailed > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 100;

  // Health score formula
  const failedPct = totalSent + totalFailed > 0 ? (totalFailed / (totalSent + totalFailed)) * 100 : 0;
  const deadPct = Math.min((deadLetters.length / 10) * 5, 20);
  const retryPct = Math.min((failures.length / 20) * 5, 10);
  const healthScore = Math.max(0, Math.round(100 - failedPct - deadPct - retryPct));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <HealthScore score={healthScore} />
        <MetricCard icon={CheckCircle2} label="Sent Today" value={totalSent} sub={`${successRate}% success rate`} color="text-emerald-400" />
        <MetricCard icon={AlertTriangle} label="Failed Today" value={totalFailed} sub={`${failures.length} unresolved`} color={totalFailed > 0 ? 'text-red-400' : 'text-white/60'} />
        <MetricCard icon={RefreshCw} label="Deduped Today" value={dedupedToday.length} sub="Duplicate prevention" color="text-blue-400" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={MessageSquare} label="SMS Today" value={smsToday.length} color="text-purple-400" />
        <MetricCard icon={Mail} label="Email Today" value={emailToday.length} color="text-cyan-400" />
        <MetricCard icon={Bell} label="In-App Today" value={inappToday.length} color="text-pink-400" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass border-white/10">
          <CardContent className="p-5">
            <h3 className="text-sm font-black text-white mb-4">Retry Backlog</h3>
            {failures.length === 0 ? (
              <div className="text-center py-6 text-white/40 text-sm">No pending retries</div>
            ) : (
              <div className="space-y-2">
                {failures.slice(0, 5).map(f => (
                  <div key={f.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <div>
                      <div className="text-xs font-semibold text-white">{f.recipient}</div>
                      <div className="text-xs text-white/40">{f.channel} · attempt {f.retry_count + 1}/5</div>
                    </div>
                    <Badge className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/25 text-xs">
                      {f.next_retry_at ? `Retry ${new Date(f.next_retry_at).toLocaleTimeString()}` : 'Pending'}
                    </Badge>
                  </div>
                ))}
                {failures.length > 5 && <div className="text-xs text-white/40 text-center pt-1">+{failures.length - 5} more</div>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-white/10">
          <CardContent className="p-5">
            <h3 className="text-sm font-black text-white mb-4">Dead Letter Queue</h3>
            {deadLetters.length === 0 ? (
              <div className="text-center py-6 text-white/40 text-sm">No dead letters</div>
            ) : (
              <div className="space-y-2">
                {deadLetters.slice(0, 5).map(d => (
                  <div key={d.id} className="flex items-center justify-between rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2">
                    <div>
                      <div className="text-xs font-semibold text-white">{d.recipient}</div>
                      <div className="text-xs text-white/40">{d.channel} · {d.source_event}</div>
                    </div>
                    <Badge className="bg-red-500/20 text-red-300 border border-red-500/30 text-xs">{d.retry_count} attempts</Badge>
                  </div>
                ))}
                {deadLetters.length > 5 && <div className="text-xs text-white/40 text-center pt-1">+{deadLetters.length - 5} more</div>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}