import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

export default function ProductionCommandActivationCard({ device, compact = false }) {
  const queryClient = useQueryClient();
  const [understood, setUnderstood] = useState(false);
  const [starterConfirmation, setStarterConfirmation] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [scope, setScope] = useState(device?.production_command_scope || 'non_starter_only');
  const [message, setMessage] = useState('');
  const enabled = device?.production_commands_enabled === true;
  const isNoran = device?.provider_key === 'traccar_noran_mt20';

  const activation = useMutation({
    mutationFn: (enabledValue) => base44.functions.invoke('setNoranProductionCommands', {
      device_id: device.id,
      enabled: enabledValue,
      production_command_scope: scope,
      understood,
      confirmation_text: confirmationText,
      starter_confirmation: starterConfirmation
    }),
    onSuccess: (res) => {
      setMessage(res.data?.device?.production_commands_enabled ? 'Production commands enabled for this device.' : 'Production commands disabled for this device.');
      queryClient.invalidateQueries({ queryKey: ['traccar-devices'] });
      queryClient.invalidateQueries({ queryKey: ['telematics-devices'] });
      queryClient.invalidateQueries({ queryKey: ['admin-command-test-history', device.id] });
    },
    onError: (error) => setMessage(error?.response?.data?.error || error.message)
  });

  if (!device || !isNoran) return null;

  const canEnable = understood && confirmationText === 'ENABLE LIVE COMMANDS' && (scope !== 'all_supported_commands' || starterConfirmation);

  return (
    <Card className={`${compact ? 'bg-white/[0.03]' : 'glass'} border-red-500/30`}>
      <CardHeader className={compact ? 'p-4 pb-2' : undefined}>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-red-400" /> Enable Production Commands
          <Badge className={enabled ? 'bg-emerald-500 text-white' : 'bg-yellow-500 text-black'}>{enabled ? 'Enabled' : 'Off'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className={`${compact ? 'p-4 pt-2' : ''} space-y-3`}>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>Live vehicle commands will be sent to Traccar and the physical vehicle. Confirm this device is installed and tested.</p>
          </div>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <label className="rounded-xl border border-border p-3">
            <input type="radio" name={`scope-${device.id}`} checked={scope === 'non_starter_only'} onChange={() => setScope('non_starter_only')} className="mr-2" />
            Non-starter commands only
          </label>
          <label className="rounded-xl border border-border p-3">
            <input type="radio" name={`scope-${device.id}`} checked={scope === 'all_supported_commands'} onChange={() => setScope('all_supported_commands')} className="mr-2" />
            All supported commands including starter control
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-1" />
          I understand this will send live vehicle commands.
        </label>
        {scope === 'all_supported_commands' && (
          <label className="flex items-start gap-2 text-sm text-yellow-200">
            <input type="checkbox" checked={starterConfirmation} onChange={(e) => setStarterConfirmation(e.target.checked)} className="mt-1" />
            I understand starter disable/restore is admin-only and physically affects vehicle operation.
          </label>
        )}
        <Input value={confirmationText} onChange={(e) => setConfirmationText(e.target.value)} placeholder="Type ENABLE LIVE COMMANDS" />
        <div className="flex flex-wrap gap-2">
          <Button disabled={enabled || !canEnable || activation.isPending} onClick={() => activation.mutate(true)} className="bg-red-600 hover:bg-red-700">Enable Production Commands</Button>
          <Button variant="outline" disabled={!enabled || activation.isPending} onClick={() => activation.mutate(false)}>Disable</Button>
        </div>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}