import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Battery, Loader2, CheckCircle2, XCircle, Zap, ZapOff, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RelayPowerSaveCard({ prefillDeviceId = '' }) {
  const [loading, setLoading] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleBulk = async (powerSaveMode) => {
    const label = powerSaveMode ? 'ENABLE power-save (X=0)' : 'DISABLE power-save (X=1)';
    if (!window.confirm(
      `Send ${label} to ALL Noran MT20 devices via Traccar?\n\n` +
      `This sends the properly wrapped 68-byte MT20 packet (command 019) through Traccar's /api/commands/send to every online Noran device.`
    )) return;
    setLoading(`bulk_${powerSaveMode}`);
    setResult(null);
    setError('');
    try {
      const res = await base44.functions.invoke('bulkSendNoranRelayPowerSave', {
        power_save_mode: powerSaveMode,
        bulk: true,
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
          <p className="text-xs text-muted-foreground">Sent via Traccar — full 68-byte wrapped packet, no SMS required</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">How it works</p>
          <ul className="text-xs text-white/60 space-y-1">
            <li>• <span className="text-emerald-400 font-semibold">Power-save ON (X=0):</span> Relay releases 60s after ACC off → ~0mA relay draw when parked</li>
            <li>• <span className="text-orange-400 font-semibold">Power-save OFF (X=1):</span> Relay stays energized 24/7 → ~150-200mA continuous draw</li>
            <li>• Starter kill still works instantly when ACC turns on (relay re-engages in ~5-20ms)</li>
            <li>• <span className="text-sky-400 font-semibold">Freshness gate:</span> Only sends to devices with a fresh heartbeat (≤10s). Offline devices wait up to 30s for their next heartbeat, then are skipped if still stale.</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => handleBulk(true)}
            disabled={!!loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 flex-1 h-11"
          >
            {loading === 'bulk_true' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ZapOff className="h-4 w-4" />}
            Enable Power-Save (All Devices)
          </Button>
          <Button
            onClick={() => handleBulk(false)}
            disabled={!!loading}
            variant="outline"
            className="gap-2 flex-1 h-11 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
          >
            {loading === 'bulk_false' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Disable (All)
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
            <div className="flex items-start gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-green-400">
                  Bulk push complete — {result.power_save_mode ? 'Power-save ENABLED' : 'Power-save DISABLED'}
                </p>
                <p className="text-xs text-green-300/60 mt-0.5">Sent via Traccar /api/commands/send (68-byte MT20 wrapped packet) — freshness gate applied</p>
              </div>
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