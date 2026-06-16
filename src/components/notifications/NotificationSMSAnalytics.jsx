import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, DollarSign, TrendingUp } from 'lucide-react';

function startOf(unit) {
  const d = new Date();
  if (unit === 'today') { d.setHours(0, 0, 0, 0); }
  else if (unit === 'week') { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); }
  else if (unit === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); }
  return d.toISOString();
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

export default function NotificationSMSAnalytics() {
  const [period, setPeriod] = useState('today');

  const { data: costs = [] } = useQuery({
    queryKey: ['notif-sms-costs', period],
    queryFn: () => base44.entities.NotificationCost.filter({ channel: 'sms' }, '-sent_at', 500),
    staleTime: 30000,
  });

  const since = startOf(period);
  const periodCosts = costs.filter(c => (c.sent_at || c.created_date) >= since);

  const totalCount = periodCosts.length;
  const totalCost = periodCosts.reduce((s, c) => s + (c.estimated_cost_usd || 0), 0);
  const totalSegments = periodCosts.reduce((s, c) => s + (c.segment_count || 1), 0);

  // By category
  const byCategory = {};
  periodCosts.forEach(c => {
    const cat = c.category || c.event_type || 'other';
    if (!byCategory[cat]) byCategory[cat] = { count: 0, cost: 0 };
    byCategory[cat].count++;
    byCategory[cat].cost += c.estimated_cost_usd || 0;
  });
  const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1].count - a[1].count);

  // By host
  const byHost = {};
  periodCosts.forEach(c => {
    if (!c.host_id) return;
    if (!byHost[c.host_id]) byHost[c.host_id] = { count: 0, cost: 0 };
    byHost[c.host_id].count++;
    byHost[c.host_id].cost += c.estimated_cost_usd || 0;
  });
  const sortedHosts = Object.entries(byHost).sort((a, b) => b[1].cost - a[1].cost).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {['today', 'week', 'month'].map(p => (
          <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-xl text-sm font-bold capitalize transition-all ${period === p ? 'bg-primary text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
            {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={MessageSquare} label="SMS Sent" value={totalCount} sub={`${totalSegments} segments`} color="text-purple-400" />
        <MetricCard icon={DollarSign} label="Estimated Cost" value={`$${totalCost.toFixed(4)}`} sub="~$0.0079/SMS" color="text-emerald-400" />
        <MetricCard icon={TrendingUp} label="Avg Cost/SMS" value={totalCount > 0 ? `$${(totalCost / totalCount).toFixed(4)}` : '$0'} color="text-cyan-400" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass border-white/10">
          <CardContent className="p-5">
            <h3 className="text-sm font-black text-white mb-4">Top SMS Categories</h3>
            {sortedCategories.length === 0 ? (
              <div className="text-center py-6 text-white/30 text-sm">No SMS data for this period</div>
            ) : (
              <div className="space-y-2">
                {sortedCategories.map(([cat, data]) => (
                  <div key={cat} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-white capitalize">{cat.replace(/_/g, ' ')}</div>
                      <div className="text-xs text-white/40">{data.count} messages</div>
                    </div>
                    <span className="text-sm font-bold text-emerald-400">${data.cost.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-white/10">
          <CardContent className="p-5">
            <h3 className="text-sm font-black text-white mb-4">Top SMS Cost by Host</h3>
            {sortedHosts.length === 0 ? (
              <div className="text-center py-6 text-white/30 text-sm">No host SMS data</div>
            ) : (
              <div className="space-y-2">
                {sortedHosts.map(([hostId, data]) => (
                  <div key={hostId} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <div>
                      <div className="text-xs font-mono text-white/60 truncate max-w-[160px]">{hostId}</div>
                      <div className="text-xs text-white/40">{data.count} messages</div>
                    </div>
                    <span className="text-sm font-bold text-purple-400">${data.cost.toFixed(4)}</span>
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