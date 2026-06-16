import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Activity, Mail, MessageSquare } from 'lucide-react';

function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}

function ProviderCard({ name, icon: Icon, sent, failed, color }) {
  const total = sent + failed;
  const rate = total > 0 ? Math.round((sent / total) * 100) : 100;
  const status = rate >= 95 ? 'Healthy' : rate >= 80 ? 'Degraded' : 'Outage';
  const statusColor = rate >= 95 ? 'text-emerald-400' : rate >= 80 ? 'text-yellow-400' : 'text-red-400';
  const statusBg = rate >= 95 ? 'bg-emerald-500/15 border-emerald-500/25' : rate >= 80 ? 'bg-yellow-500/15 border-yellow-500/25' : 'bg-red-500/15 border-red-500/25';
  const StatusIcon = rate >= 95 ? CheckCircle2 : rate >= 80 ? AlertTriangle : XCircle;

  return (
    <Card className={`glass border ${rate < 95 ? 'border-yellow-500/25' : 'border-white/10'}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${statusBg}`}>
              <Icon className={`h-5 w-5 ${statusColor}`} />
            </div>
            <div>
              <div className="text-base font-black text-white">{name}</div>
              <div className="text-xs text-white/40">{total} total events today</div>
            </div>
          </div>
          <Badge className={`${statusBg} ${statusColor} border flex items-center gap-1`}>
            <StatusIcon className="h-3 w-3" /> {status}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/5 p-3 text-center">
            <div className={`text-2xl font-black ${statusColor}`}>{rate}%</div>
            <div className="text-xs text-white/40 mt-0.5">Success Rate</div>
          </div>
          <div className="rounded-xl bg-emerald-500/10 p-3 text-center">
            <div className="text-2xl font-black text-emerald-400">{sent}</div>
            <div className="text-xs text-white/40 mt-0.5">Delivered</div>
          </div>
          <div className="rounded-xl bg-red-500/10 p-3 text-center">
            <div className="text-2xl font-black text-red-400">{failed}</div>
            <div className="text-xs text-white/40 mt-0.5">Failed</div>
          </div>
        </div>

        {rate < 95 && (
          <div className="mt-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-3">
            <p className="text-xs text-yellow-300">
              {rate < 80 ? '🔴 Provider outage detected. Admin alert has been generated.' : '⚠️ Success rate below 95%. Monitor closely.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function NotificationProviderMonitor() {
  const today = startOfToday();

  const { data: events = [] } = useQuery({
    queryKey: ['notif-provider-events'],
    queryFn: () => base44.entities.ActivityEvent.filter({ actor_id: 'sendCriticalNotification' }, '-created_date', 500),
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const todayEvents = events.filter(e => e.created_date >= today);

  const resendSent = todayEvents.filter(e => e.metadata?.provider === 'resend' && e.metadata?.provider_status === 'sent').length;
  const resendFailed = todayEvents.filter(e => e.metadata?.provider === 'resend' && e.metadata?.provider_status === 'failed').length;
  const twilioSent = todayEvents.filter(e => e.metadata?.provider === 'twilio' && e.metadata?.provider_status === 'sent').length;
  const twilioFailed = todayEvents.filter(e => e.metadata?.provider === 'twilio' && e.metadata?.provider_status === 'failed').length;
  const base44Sent = todayEvents.filter(e => e.metadata?.provider === 'base44' && e.metadata?.provider_status === 'sent').length;
  const base44Failed = todayEvents.filter(e => e.metadata?.provider === 'base44' && e.metadata?.provider_status === 'failed').length;

  // Recent failures for audit trail
  const recentFailures = todayEvents.filter(e => e.metadata?.provider_status === 'failed').slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <ProviderCard name="Resend (Email)" icon={Mail} sent={resendSent} failed={resendFailed} />
        <ProviderCard name="Twilio (SMS)" icon={MessageSquare} sent={twilioSent} failed={twilioFailed} />
        <ProviderCard name="Base44 (In-App)" icon={Activity} sent={base44Sent} failed={base44Failed} />
      </div>

      <Card className="glass border-white/10">
        <CardContent className="p-5">
          <h3 className="text-sm font-black text-white mb-4">Notification Audit Trail (Today's Failures)</h3>
          {recentFailures.length === 0 ? (
            <div className="text-center py-8 text-white/30 text-sm">No delivery failures today</div>
          ) : (
            <div className="space-y-2">
              {recentFailures.map((e, i) => (
                <div key={i} className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className="bg-white/5 text-white/60 border border-white/10 text-xs">{e.metadata?.provider}</Badge>
                        <Badge className="bg-white/5 text-white/60 border border-white/10 text-xs">{e.metadata?.channel}</Badge>
                        <span className="text-xs text-white/40">{e.metadata?.source_event}</span>
                      </div>
                      <div className="text-sm text-white">{e.metadata?.recipient_email || e.user_email}</div>
                      <div className="text-xs text-red-300/80 mt-0.5">{e.metadata?.failure_reason}</div>
                    </div>
                    <span className="text-xs text-white/30 flex-shrink-0">{e.created_date ? new Date(e.created_date).toLocaleTimeString() : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}