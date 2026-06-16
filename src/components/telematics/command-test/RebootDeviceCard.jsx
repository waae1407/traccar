import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { RotateCcw, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function RebootDeviceCard({ prefillDeviceId = '' }) {
  const [deviceId, setDeviceId] = useState(prefillDeviceId);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleReboot = async () => {
    const id = deviceId.trim().toUpperCase();
    if (!id) return;
    if (!window.confirm(`Send REBOOT command to device ${id}? The device will disconnect briefly.`)) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await base44.functions.invoke('restartTelematicsDevice', { unique_id: id });
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
    setLoading(false);
  };

  return (
    <div className="rounded-2xl border border-orange-500/25 bg-orange-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-orange-500/20 bg-orange-500/8">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/20">
          <RotateCcw className="h-4 w-4 text-orange-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Reboot Device</p>
          <p className="text-xs text-muted-foreground">Sends MT20 control code 099 — device will restart in 10–30 seconds</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex gap-3">
          <Input
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value.toUpperCase())}
            placeholder="Device ID, e.g. NR09G51902"
            className="font-mono bg-muted/30 border-border flex-1"
            disabled={loading}
            onKeyDown={(e) => { if (e.key === 'Enter') handleReboot(); }}
          />
          <Button
            onClick={handleReboot}
            disabled={loading || !deviceId.trim()}
            className="bg-orange-600 hover:bg-orange-700 text-white gap-2 shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Reboot
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {result && (
          <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
            <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-green-400">Reboot command sent</p>
              <p className="text-xs text-green-300 mt-0.5">{result.note}</p>
              <p className="text-xs font-mono text-green-300/60 mt-1">{result.ascii_command}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}