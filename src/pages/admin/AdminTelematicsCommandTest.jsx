import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DeviceLookupCard from '@/components/telematics/command-test/DeviceLookupCard';
import DeviceSummaryCard from '@/components/telematics/command-test/DeviceSummaryCard';
import CommandButtonGrid from '@/components/telematics/command-test/CommandButtonGrid';
import CommandHistoryPanel from '@/components/telematics/command-test/CommandHistoryPanel';
import TestChecklist from '@/components/telematics/command-test/TestChecklist';

export default function AdminTelematicsCommandTest() {
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState('');
  const [lookupData, setLookupData] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [sending, setSending] = useState('');
  const [latestResult, setLatestResult] = useState(null);
  const [notes, setNotes] = useState('');

  const history = useQuery({
    queryKey: ['admin-command-test-history', lookupData?.device?.id],
    queryFn: () => base44.entities.TelematicsCommand.filter({ telematics_device_id: lookupData.device.id }, '-created_date', 20),
    enabled: !!lookupData?.device?.id,
    refetchInterval: 10000,
    initialData: []
  });

  const lookup = useMutation({
    mutationFn: () => base44.functions.invoke('adminLookupTelematicsCommandTest', { identifier: identifier.trim() }).then((res) => res.data),
    onSuccess: (data) => {
      setLookupData(data);
      setNotes(data.session?.notes || '');
      setLookupError('');
      setLatestResult(null);
      queryClient.invalidateQueries({ queryKey: ['admin-command-test-history', data.device?.id] });
    },
    onError: (error) => setLookupError(error?.response?.data?.error || error.message)
  });

  const markMutation = useMutation({
    mutationFn: ({ field, value }) => base44.entities.TelematicsDeviceTestSession.update(lookupData.session.id, { [field]: value }),
    onSuccess: (session) => setLookupData((prev) => ({ ...prev, session }))
  });

  const completeMutation = useMutation({
    mutationFn: () => base44.functions.invoke('completeTelematicsDeviceTestSession', { session_id: lookupData.session.id, notes }).then((res) => res.data),
    onSuccess: (data) => setLookupData((prev) => ({ ...prev, session: data.session })),
    onError: (error) => setLatestResult({ error: error?.response?.data?.error || error.message })
  });

  const sendCommand = async (commandType, isStarter) => {
    setSending(commandType);
    setLatestResult(null);
    try {
      const response = await base44.functions.invoke('sendTelematicsCommand', {
        command_type: commandType,
        telematics_device_id: lookupData.device.id,
        admin_device_command_test: true,
        admin_starter_override: !!isStarter
      });
      setLatestResult(response.data);
    } catch (error) {
      setLatestResult(error?.response?.data || { error: error.message });
    }
    setSending('');
    history.refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-primary">Admin → Telematics → Command Test</p>
          <h1 className="mt-2 text-3xl font-black text-white md:text-4xl">Telematics Device Command Test</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/55">Controlled admin-only device testing. This does not change booking, payment, customer, host, payout, Stripe, or Traccar activation logic.</p>
        </div>
      </div>

      <DeviceLookupCard identifier={identifier} setIdentifier={setIdentifier} onLookup={() => lookup.mutate()} loading={lookup.isPending} error={lookupError} />
      <DeviceSummaryCard data={lookupData} />

      {latestResult && (
        <Card className="glass border-white/10">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-black text-white">Latest Command Result</h2><Badge className={latestResult.error ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}>{latestResult.queue_status || (latestResult.error ? 'failed' : 'sent')}</Badge></div>
            <pre className="max-h-72 overflow-auto rounded-2xl bg-black/30 p-4 text-xs text-white/70">{JSON.stringify(latestResult, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      {lookupData?.device && (
        <>
          <CommandButtonGrid commands={lookupData.supported_commands} execution={lookupData.execution} onSend={sendCommand} sending={sending} session={lookupData.session} onMark={(field, value) => markMutation.mutate({ field, value })} />
          <CommandHistoryPanel commands={history.data} onRefresh={history.refetch} loading={history.isFetching} />
          <TestChecklist session={lookupData.session} commands={lookupData.supported_commands} notes={notes} setNotes={setNotes} onMark={(field, value) => markMutation.mutate({ field, value })} onComplete={() => completeMutation.mutate()} completing={completeMutation.isPending} />
        </>
      )}
    </div>
  );
}