import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, Mail, MessageSquare, Bell, CheckCircle, XCircle, Clock, TrendingUp, TrendingDown } from 'lucide-react';

const CATEGORY_CONFIG = {
  bookings: { label: 'Bookings', color: 'bg-blue-500' },
  payments: { label: 'Payments', color: 'bg-green-500' },
  payouts: { label: 'Payouts', color: 'bg-purple-500' },
  gps: { label: 'GPS/Telematics', color: 'bg-orange-500' },
  compliance: { label: 'Compliance', color: 'bg-yellow-500' },
  maintenance: { label: 'Maintenance', color: 'bg-gray-500' },
  telematics: { label: 'Telematics', color: 'bg-red-500' },
  system: { label: 'System', color: 'bg-slate-500' },
};

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: 'bg-red-500', icon: AlertTriangle },
  warning: { label: 'Warning', color: 'bg-yellow-500', icon: AlertTriangle },
  info: { label: 'Info', color: 'bg-blue-500', icon: Bell },
  success: { label: 'Success', color: 'bg-green-500', icon: CheckCircle },
};

export default function AdminNotificationMetrics() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['notification-metrics'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      const [notifications, deliveryLogs, operationalAlerts] = await Promise.all([
        base44.entities.Notification.filter({ created_date: { $gte: todayStr } }, '-created_date', 500),
        base44.entities.NotificationDeliveryLog.filter({ attempted_at: { $gte: todayStr } }, '-attempted_at', 500),
        base44.entities.PaymentOperationalAlert.filter({ 
          status: { $in: ['new', 'notified', 'in_progress'] },
          created_date: { $gte: todayStr }
        }, '-created_date', 200),
      ]);

      const now = new Date();
      const unreadCritical = notifications.filter(n => !n.is_read && n.severity === 'critical').length;
      const unresolvedAlerts = operationalAlerts.filter(a => !['resolved', 'dismissed', 'closed'].includes(a.status)).length;

      // Channel breakdown
      const emailsSent = deliveryLogs.filter(l => l.channel === 'email' && l.success).length;
      const smsSent = deliveryLogs.filter(l => l.channel === 'sms' && l.success).length;
      const pushSent = deliveryLogs.filter(l => l.channel === 'push' && l.success).length;
      const inappSent = deliveryLogs.filter(l => l.channel === 'inapp' && l.success).length;
      const failedDeliveries = deliveryLogs.filter(l => !l.success).length;

      // Category breakdown
      const byCategory = {};
      notifications.forEach(n => {
        const cat = n.category || 'system';
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      });

      // Severity breakdown
      const bySeverity = {};
      notifications.forEach(n => {
        const sev = n.severity || 'info';
        bySeverity[sev] = (bySeverity[sev] || 0) + 1;
      });

      // Delivery success rate
      const totalAttempts = deliveryLogs.length;
      const successRate = totalAttempts > 0 ? Math.round((totalAttempts - failedDeliveries) / totalAttempts * 100) : 100;

      return {
        notifications_created_today: notifications.length,
        failed_deliveries: failedDeliveries,
        emails_sent: emailsSent,
        sms_sent: smsSent,
        push_sent: pushSent,
        inapp_sent: inappSent,
        unread_critical_alerts: unreadCritical,
        unresolved_operational_alerts: unresolvedAlerts,
        delivery_success_rate: successRate,
        by_category: byCategory,
        by_severity: bySeverity,
        total_delivery_attempts: totalAttempts,
      };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const StatCard = ({ title, value, icon: Icon, color, trend }) => (
    <Card className="glass-hover">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {trend && (
          <div className={`flex items-center text-xs mt-1 ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
            {trend > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
            {Math.abs(trend)}% from yesterday
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-syne)' }}>Notification Delivery Metrics</h1>
          <p className="text-muted-foreground mt-1">Real-time monitoring of notification delivery across all channels</p>
        </div>
        <Badge variant="outline" className="text-xs">
          <Clock className="h-3 w-3 mr-1" />
          Live
        </Badge>
      </div>

      {/* KEY METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Notifications Created Today"
          value={metrics?.notifications_created_today || 0}
          icon={Bell}
          color="text-blue-500"
        />
        <StatCard
          title="Failed Deliveries"
          value={metrics?.failed_deliveries || 0}
          icon={XCircle}
          color="text-red-500"
        />
        <StatCard
          title="Delivery Success Rate"
          value={`${metrics?.delivery_success_rate || 100}%`}
          icon={CheckCircle}
          color="text-green-500"
        />
        <StatCard
          title="Unread Critical Alerts"
          value={metrics?.unread_critical_alerts || 0}
          icon={AlertTriangle}
          color="text-orange-500"
        />
      </div>

      {/* SECONDARY METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Emails Sent"
          value={metrics?.emails_sent || 0}
          icon={Mail}
          color="text-purple-500"
        />
        <StatCard
          title="SMS Sent"
          value={metrics?.sms_sent || 0}
          icon={MessageSquare}
          color="text-cyan-500"
        />
        <StatCard
          title="Push Notifications"
          value={metrics?.push_sent || 0}
          icon={Bell}
          color="text-pink-500"
        />
        <StatCard
          title="In-App Notifications"
          value={metrics?.inapp_sent || 0}
          icon={Activity}
          color="text-indigo-500"
        />
      </div>

      {/* ALERTS STATUS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-hover border-red-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" />
              Unresolved Operational Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-red-500">{metrics?.unresolved_operational_alerts || 0}</div>
            <p className="text-sm text-muted-foreground mt-2">
              Alerts requiring admin action
            </p>
          </CardContent>
        </Card>

        <Card className="glass-hover border-orange-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-500">
              <Bell className="h-5 w-5" />
              Unread Critical Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-orange-500">{metrics?.unread_critical_alerts || 0}</div>
            <p className="text-sm text-muted-foreground mt-2">
              Critical notifications not yet read
            </p>
          </CardContent>
        </Card>
      </div>

      {/* BREAKDOWN TABS */}
      <Tabs defaultValue="category" className="space-y-4">
        <TabsList>
          <TabsTrigger value="category">By Category</TabsTrigger>
          <TabsTrigger value="severity">By Severity</TabsTrigger>
          <TabsTrigger value="channels">By Channel</TabsTrigger>
        </TabsList>

        <TabsContent value="category" className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(metrics?.by_category || {}).map(([cat, count]) => (
              <Card key={cat} className="glass-hover">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{CATEGORY_CONFIG[cat]?.label || cat}</p>
                      <p className="text-2xl font-bold mt-1">{count}</p>
                    </div>
                    <div className={`h-10 w-10 rounded-full ${CATEGORY_CONFIG[cat]?.color || 'bg-gray-500'} flex items-center justify-center`}>
                      <Bell className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="severity" className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(metrics?.by_severity || {}).map(([sev, count]) => {
              const Config = SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.info;
              const Icon = Config.icon || Bell;
              return (
                <Card key={sev} className="glass-hover">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{Config.label}</p>
                        <p className="text-2xl font-bold mt-1">{count}</p>
                      </div>
                      <div className={`h-10 w-10 rounded-full ${Config.color} flex items-center justify-center`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="channels" className="space-y-2">
          <Card className="glass-hover">
            <CardContent className="pt-6">
              <div className="space-y-4">
                {[
                  { label: 'Email', value: metrics?.emails_sent || 0, color: 'bg-purple-500', icon: Mail },
                  { label: 'SMS', value: metrics?.sms_sent || 0, color: 'bg-cyan-500', icon: MessageSquare },
                  { label: 'Push', value: metrics?.push_sent || 0, color: 'bg-pink-500', icon: Bell },
                  { label: 'In-App', value: metrics?.inapp_sent || 0, color: 'bg-indigo-500', icon: Activity },
                  { label: 'Failed', value: metrics?.failed_deliveries || 0, color: 'bg-red-500', icon: XCircle },
                ].map(channel => (
                  <div key={channel.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full ${channel.color} flex items-center justify-center`}>
                        <channel.icon className="h-5 w-5 text-white" />
                      </div>
                      <span className="font-medium">{channel.label}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold">{channel.value}</span>
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${channel.color}`}
                          style={{ width: `${Math.min(100, (channel.value / Math.max(1, metrics?.total_delivery_attempts || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DELIVERY LOG TABLE */}
      <Card className="glass-hover">
        <CardHeader>
          <CardTitle>Recent Delivery Attempts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Showing last 500 delivery attempts. Use NotificationDeliveryLog entity for full audit.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}