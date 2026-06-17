import React from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getInstallerTip } from '@/lib/telematics/installerTroubleshooting';
import { businessText } from '@/components/telematics/command-test/businessLanguage';

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
  ['starter_disable_test', 'disable_starter', 'Disable Starter'],
  ['starter_restore_test', 'restore_starter', 'Restore Starter'],
];

function StatusBadge({ value }) {
  const pass = value === 'pass';
  const fail = value === 'fail';
  return <Badge className={`${pass ? 'bg-emerald-500' : fail ? 'bg-red-500' : 'bg-slate-300 text-slate-700'} rounded-full px-3 py-1 text-white`}>{pass ? 'Verified' : fail ? 'Needs Review' : 'Waiting'}</Badge>;
}

export default function InstallerTestingStep({ form, update, capabilities, commandState, activeCommand, onSendCommand, onHelp }) {
  const autoChecks = capabilities.data?.auto_checks || {};
  const tests = capabilities.data?.tests || {};
  const busy = !!activeCommand;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Step 4</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Verify Device</h1>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {AUTO_TESTS.map(([id, label]) => {
          const check = autoChecks[id] || { status: form[id] || '' };
          const value = check.status || form[id] || '';
          return (
            <div key={id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3"><h3 className="text-base font-black text-slate-950">{label}</h3><StatusBadge value={value} /></div>
              {check.message && <p className={`mt-2 text-sm font-bold ${check.installer_exception ? 'text-amber-700' : value === 'pass' ? 'text-emerald-700' : 'text-red-600'}`}>{check.message}</p>}
              {value === 'fail' && !check.message && <p className="mt-2 text-sm font-bold text-red-600">{check.tip || getInstallerTip(id)}</p>}
            </div>
          );
        })}
      </div>

      {busy && <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-black text-blue-700">One command is being processed. Other buttons are locked until it is safe to continue.</div>}

      <div className="space-y-2">
        {COMMAND_TESTS.map(([id, command, label]) => {
           const value = form[id];
           const state = commandState[command]?.status || 'Ready';
           const isCurrent = activeCommand === command;
           const locked = busy && !isCurrent;
           const sent = ['Sent', 'Failed'].includes(state);
           const failed = value === 'fail' || state === 'Failed';
           const buttonText = state === 'Waiting' ? 'Waiting' : state === 'Sending' ? 'Sending' : 'Verify';
           return (
            <div key={id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_minmax(180px,1fr)_64px_64px] xl:grid-cols-[190px_minmax(320px,1fr)_72px_72px] items-center">
                <h3 className="truncate text-sm font-black text-slate-950">{label}</h3>
                <Button type="button" onClick={() => onSendCommand(command, id)} disabled={locked || state === 'Sending' || state === 'Waiting'} title={state} className="h-11 rounded-xl bg-slate-950 px-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50">
                  {(state === 'Sending' || state === 'Waiting') && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {buttonText}
                </Button>
                <Button type="button" variant="outline" disabled={!sent} onClick={() => update(id, 'pass')} className={`h-11 rounded-xl px-3 text-sm font-black ${value === 'pass' ? 'border-emerald-500 bg-emerald-500 text-white' : 'bg-white text-slate-700'}`}>Pass</Button>
                <Button type="button" variant="outline" disabled={!sent} onClick={() => update(id, 'fail')} className={`h-11 rounded-xl px-3 text-sm font-black ${value === 'fail' ? 'border-red-500 bg-red-500 text-white' : 'bg-white text-slate-700'}`}>Fail</Button>
              </div>
              {state === 'Waiting' && <div className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">{businessText(commandState[command]?.error || 'Waiting before the next command.')}</div>}
              {state === 'Failed' && <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700"><span>{businessText(commandState[command]?.error || getInstallerTip(id))}</span><Button type="button" size="sm" variant="ghost" onClick={() => onHelp(id)} className="h-7 text-red-700"><MessageCircle className="h-4 w-4" /> Help</Button></div>}
            </div>
           );
        })}
      </div>
    </div>
  );
}