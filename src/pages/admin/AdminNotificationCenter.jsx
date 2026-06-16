import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NotificationDeliveryOverview from '@/components/notifications/NotificationDeliveryOverview';
import NotificationFailedDeliveries from '@/components/notifications/NotificationFailedDeliveries';
import NotificationSMSAnalytics from '@/components/notifications/NotificationSMSAnalytics';
import NotificationEmailAnalytics from '@/components/notifications/NotificationEmailAnalytics';
import NotificationDeadLetterQueue from '@/components/notifications/NotificationDeadLetterQueue';
import NotificationProviderMonitor from '@/components/notifications/NotificationProviderMonitor';

export default function AdminNotificationCenter() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.3em] text-primary">Admin → Notification System</p>
        <h1 className="mt-2 text-3xl font-black text-white">Notification Center</h1>
        <p className="mt-1 text-sm text-white/55">Delivery monitoring, failure management, retry engine, and SMS cost tracking.</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-white/5 border border-white/10 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview">Delivery Overview</TabsTrigger>
          <TabsTrigger value="failures">Failed Deliveries</TabsTrigger>
          <TabsTrigger value="deadletter">Dead Letter Queue</TabsTrigger>
          <TabsTrigger value="sms">SMS Analytics</TabsTrigger>
          <TabsTrigger value="email">Email Analytics</TabsTrigger>
          <TabsTrigger value="providers">Provider Monitor</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6"><NotificationDeliveryOverview /></TabsContent>
        <TabsContent value="failures" className="mt-6"><NotificationFailedDeliveries /></TabsContent>
        <TabsContent value="deadletter" className="mt-6"><NotificationDeadLetterQueue /></TabsContent>
        <TabsContent value="sms" className="mt-6"><NotificationSMSAnalytics /></TabsContent>
        <TabsContent value="email" className="mt-6"><NotificationEmailAnalytics /></TabsContent>
        <TabsContent value="providers" className="mt-6"><NotificationProviderMonitor /></TabsContent>
      </Tabs>
    </div>
  );
}