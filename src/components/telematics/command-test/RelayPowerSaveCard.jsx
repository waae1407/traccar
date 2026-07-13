import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Battery, Loader2, CheckCircle2, XCircle, Zap, ZapOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function RelayPowerSaveCard({ prefillDeviceId = '' }) {
  const [deviceId, setDeviceId] = useState(prefillDeviceId);
  const [loading, setLoading] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSingle = async (powerSaveMode) => {
    const id = deviceId.trim().toUpperCase();
    if (!id) return;
    const label = powerSaveMode ? 'ENABLE power-save' : 'DISABLE power-save';
    if (!window.confirm(`Send ${label} relay command to device ${id}?`)) return;
    setLoading(`single_${powerSaveMode}`);
    setResult(null);
    setError('');
    try {
      const res = await base44.functions.invoke('sendNoranSmsCommand', {
        unique_id: id,
        command: 'set_relay_power_save',
        power_save_mode: powerSaveMode
      });
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
    setLoading(null);
  };

  const handleBulk = async (powerSaveMode) => {
    const label = powerSaveMode ? 'ENABLE power-save' : 'DISABLE power-save';
    if (!window.confirm(`Push ${label} relay command to ALL Noran MT20 devices?\n\nThis will send an SMS to every device with a stored phone number.`)) return;
    setLoading(`bulk_${powerSaveMode}`);
    setResult(null);
    setError('');
    try {
      const res = await base44.functions.invoke('sendNoranSmsCommand', {
        command: 'set_relay_power_save',
        power_save_mode: powerSaveMode,
        bulk: true
      });
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
    setLoading(null);
  };

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-emerald-500/20 bg-emerald-500/8">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20">
          <Battery className="h-4 w-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Relay Power-Save Mode (MT20 Command 019)</p>
          <p className="text-xs text-muted-foreground">When ACC is off, kill relay releases after 60s — eliminates relay coil drain on parked vehicles</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">How it works</p>
          <ul className="text-xs text-white/60 space-y-1">
            <li>• <span className="text-emerald-400 font-semibold">Power-save ON (X=0):</span> Relay releases 60s after ACC off → ~0mA relay draw when parked</li>
            <li>• <span className="text-orange-400 font-semibold">Power-save OFF (X=1):</span> Relay stays energized 24/7 → ~150-200mA continuous draw</li>
            <li>• Starter kill still works instantly when ACC turns on (relay re-engages in ~5-20ms)</li>
          </ul>
        </div>

        <div className="border-t border-white/10 pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-white/50 mb-3">Single Device</p>
          <div className="flex gap-3 mb-3">
            <Input
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value.toUpperCase())}
              placeholder="Device ID, e.g. NR09G51902"
              className="font-mono bg-muted/30 border-border flex-1"
              disabled={!!loading}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSingle(true); }}
            />
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => handleSingle(true)}
              disabled={!!loading || !deviceId.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 flex-1"
            >
              {loading === 'single_true' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ZapOff className="h-4 w-4" />}
              Enable Power-Save
            </Button>
            <Button
              onClick={() => handleSingle(false)}
              disabled={!!loading || !deviceId.trim()}
              variant="outline"
              className="gap-2 flex-1 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
            >
              {loading === 'single_false' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Disable Power-Save
            </Button>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-white/50 mb-1">Bulk Push — All Noran Devices</p>
          <p className="text-xs text-white/40 mb-3">Sends SMS to every Noran MT20 device with a stored phone number.</p>
          <div className="flex gap-3">
            <Button
              onClick={() => handleBulk(true)}
              disabled={!!loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 flex-1"
            >
              {loading === 'bulk_true' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ZapOff className="h-4 w-4" />}
              Enable for All Devices
            </Button>
            <Button
              onClick={() => handleBulk(false)}
              disabled={!!loading}
              variant="outline"
              className="gap-2 flex-1 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
            >
              {loading === 'bulk_false' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Disable for All
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {result && !result.bulk && (
          <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
            <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-green-400">Command sent to {result.unique_id}</p>
              <p className="text-xs text-green-300 mt-0.5">{result.message}</p>
              <p className="text-xs font-mono text-green-300/60 mt-1">{result.sms_command}</p>
            </div>
          </div>
        )}

        {result && result.bulk && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
            <div className="flex items-start gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
              <p className="text-xs font-semibold text-green-400">Bulk push complete</p>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-lg bg-green-500/10 p-2 text-center">
                <p className="text-lg font-black text-green-400">{result.sent}</p>
                <p className="text-xs text-white/50">Sent</p>
              </div>
              <div className="rounded-lg bg-red-500/10 p-2 text-center">
                <p className="text-lg font-black text-red-400">{result.failed}</p>
                <p className="text-xs text-white/50">Failed</p>
              </div>
              <div className="rounded-lg bg-yellow-500/10 p-2 text-center">
                <p className="text-lg font-black text-yellow-400">{result.skipped}</p>
                <p className="text-xs text-white/50">Skipped</p>
              </div>
            </div>
            {result.results?.filter(r => r.status !== 'sent').length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-bold text-white/50">Devices needing attention:</p>
                {result.results.filter(r => r.status !== 'sent').map(r => (
                  <p key={r.device_id} className="text-xs text-white/50 font-mono">
                    {r.unique_id}: {r.status} — {r.reason || r.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}