import React from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getInstallerTip } from '@/lib/telematics/installerTroubleshooting';

const AUTO_TESTS = [
  ['device_online', 'Device Online'],
  ['power_voltage_test', 'Power'],
  ['gps_signal_test', 'GPS'],
  ['ignition_acc_test', 'Ignition'],
];

const COMMAND_TESTS = [
  ['lock_test', 'lock', 'Lock'],
  ['unlock_test', 'unlock', 'Unlock'],
  ['horn_test', 'horn', 'Horn'],
  ['lights_test', 'lights', 'Lights'],
  ['alarm_test', 'alarm_pulse', 'Alarm'],
  ['starter_disable_test', 'disable_starter', 'Disable'],
  ['starter_restore_test', 'restore_starter', 'Restore'],
];

function StatusBadge({ value }) {
  const pass = value === 'pass';
  const fail = value === 'fail';
  return <Badge className={`${pass ? 'bg-emerald-500' : fail ? 'bg-red-500' : 'bg-slate-300 text-slate-700'} rounded-full px-3 py-1 text-white`}>{pass ? 'PASS' : fail ? 'FAIL' : 'WAIT'}</Badge>;
}

export default function InstallerTestingStep({ form, update, capabilities, commandState, onSendCommand, onHelp }) {
  const autoChecks = capabilities.data?.auto_checks || {};
  const tests = capabilities.data?.tests || {};

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Step 4</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Test Device</h1>
      </div>

      <div className="grid gap-2">
        {AUTO_TESTS.map(([id, label]) => {
          const check = autoChecks[id] || { status: form[id] || '' };
          const value = check.status || form[id] || '';
          return (
            <div key={id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3"><h3 className="text-base font-black text-slate-950">{label}</h3><StatusBadge value={value} /></div>
              {value === 'fail' && <p className="mt-2 text-sm font-bold text-red-600">{check.tip || getInstallerTip(id)}</p>}
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5">
        {COMMAND_TESTS.filter(([id]) => tests[id] !== false).map(([id, command, label]) => {
          const value = form[id];
          const state = commandState[command]?.status || 'Ready';
          const sent = ['Sent', 'Failed'].includes(state);
          const failed = value === 'fail' || state === 'Failed';
          return (
            <div key={id} className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <div className="grid grid-cols-[72px_minmax(58px,1fr)_52px_52px] items-center gap-1.5">
                <h3 className="truncate text-sm font-black text-slate-950">{label}</h3>
                <Button type="button" onClick={() => onSendCommand(command, id)} disabled={state === 'Sending'} title={state} className="h-9 rounded-xl bg-slate-950 px-2 text-xs font-black text-white hover:bg-slate-800">
                  {state === 'Sending' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send
                </Button>
                <Button type="button" variant="outline" disabled={!sent} onClick={() => update(id, 'pass')} className={`h-9 rounded-xl px-2 text-xs font-black ${value === 'pass' ? 'border-emerald-500 bg-emerald-500 text-white' : 'bg-white text-slate-700'}`}>Pass</Button>
                <Button type="button" variant="outline" disabled={!sent} onClick={() => update(id, 'fail')} className={`h-9 rounded-xl px-2 text-xs font-black ${value === 'fail' ? 'border-red-500 bg-red-500 text-white' : 'bg-white text-slate-700'}`}>Fail</Button>
              </div>
              {failed && <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700"><span>{commandState[command]?.error || getInstallerTip(id)}</span><Button type="button" size="sm" variant="ghost" onClick={() => onHelp(id)} className="h-7 text-red-700"><MessageCircle className="h-4 w-4" /> Help</Button></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}