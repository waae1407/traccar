import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import DeviceLookupCard from '@/components/telematics/command-test/DeviceLookupCard';
import DeviceSummaryCard from '@/components/telematics/command-test/DeviceSummaryCard';
import CommandButtonGrid from '@/components/telematics/command-test/CommandButtonGrid';
import CommandHistoryPanel from '@/components/telematics/command-test/CommandHistoryPanel';
import { ShieldCheck } from 'lucide-react';

export default function AdminTelematicsCommandTest() {
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState('');
  const [lookupData, setLookupData] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [sending, setSending] = useState('');
  const [sentCommands, setSentCommands] = useState({});

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
      setLookupError('');
      setSentCommands({});
      queryClient.invalidateQueries({ queryKey: ['admin-command-test-history', data.device?.id] });
    },
    onError: (error) => setLookupError(error?.response?.data?.error || error.message)
  });

  useEffect(() => {
    if (!lookupData?.session?.id) return undefined;
    const unsubscribe = base44.entities.TelematicsDeviceTestSession.subscribe((event) => {
      const updatedSession = event?.data;
      if (updatedSession?.id === lookupData.session.id) {
        setLookupData((prev) => prev ? ({ ...prev, session: updatedSession }) : prev);
      }
    });
    return unsubscribe;
  }, [lookupData?.session?.id]);


  const sendCommand = async (commandType, isStarter) => {
    setSending(commandType);
    setLookupError('');
    setSentCommands((prev) => ({ ...prev, [commandType]: true }));
    try {
      await base44.functions.invoke('sendTelematicsCommand', {
        command_type: commandType,
        telematics_device_id: lookupData.device.id,
        admin_device_command_test: true,
        admin_starter_override: !!isStarter
      });
    } catch (error) {
      setLookupError(error?.response?.data?.error || error.message);
    }
    setSending('');
    history.refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-primary">Admin → Telematics → Command Verification</p>
          <h1 className="mt-2 text-3xl font-black text-white md:text-4xl">Telematics Command Verification</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/55">Admin-only verification for device connectivity, supported commands, and confirmed vehicle responses.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />
          <div>
            <p className="font-bold text-white">Production ready — change locked</p>
            <p className="mt-1 text-emerald-100/75">This command verification page and related telematics command behavior are approved as working. Any future changes require owner approval before implementation.</p>
          </div>
        </div>
      </div>

      <DeviceLookupCard identifier={identifier} setIdentifier={setIdentifier} onLookup={() => lookup.mutate()} loading={lookup.isPending} error={lookupError} />
      <DeviceSummaryCard data={lookupData} />

      {lookupData?.device && (
        <>
          <CommandButtonGrid commands={lookupData.supported_commands} execution={lookupData.execution} onSend={sendCommand} sending={sending} session={lookupData.session} sentCommands={sentCommands} commandHistory={history.data} />
          <CommandHistoryPanel commands={history.data} onRefresh={history.refetch} loading={history.isFetching} />
        </>
      )}
    </div>
  );
}