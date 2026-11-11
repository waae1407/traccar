import React, { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { DoorOpen, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';

const POLL_MS = 5000;

const VERDICT_STYLES = {
  verified: { wrap: 'border-green-500/30 bg-green-500/10', text: 'text-green-400', Icon: CheckCircle2 },
  partial: { wrap: 'border-amber-500/30 bg-amber-500/10', text: 'text-amber-400', Icon: AlertTriangle },
  stuck_open: { wrap: 'border-amber-500/30 bg-amber-500/10', text: 'text-amber-400', Icon: AlertTriangle },
  blind: { wrap: 'border-red-500/30 bg-red-500/10', text: 'text-red-400', Icon: XCircle },
};

function clock(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function age(seconds) {
  if (seconds === null || seconds === undefined) return 'no packets';
  if (seconds < 90) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

export default function DoorInputVerificationCard({ uniqueId = '' }) {
  const [readout, setReadout] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fleet, setFleet] = useState(null);
  const [fleetLoading, setFleetLoading] = useState(false);

  const load = useCallback(async () => {
    if (!uniqueId) { setReadout(null); return; }
    try {
      const res = await base44.functions.invoke('getDoorInputReadout', { unique_id: uniqueId });
      setReadout(res.data);
      setError('');
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  }, [uniqueId]);

  useEffect(() => {
    if (!uniqueId) return;
    setLoading(true);
    load().finally(() => setLoading(false));
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [uniqueId, load]);

  const checkFleet = async () => {
    setFleetLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('getDoorInputReadout', { fleet: true });
      setFleet(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
    setFleetLoading(false);
  };

  const style = readout ? VERDICT_STYLES[readout.verdict] || VERDICT_STYLES.blind : null;
  const Icon = style?.Icon || Radar;

  return (
    <div className="rounded-2xl border border-sky-500/25 bg-sky-500/5 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-sky-500/20 bg-sky-500/8">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20">
          <DoorOpen className="h-4 w-4 text-sky-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Door Input — Live Verification</p>
          <p className="text-xs text-muted-foreground">Status bit 4 of bEnable, read from live 0x0032 packets</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-sky-400 ml-auto shrink-0" />}
      </div>

      <div className="p-5 space-y-4">
        {!uniqueId && (
          <p className="text-xs text-white/50">Look up a device above to read its door input.</p>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {readout && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className={`rounded-xl border p-3 text-center ${readout.live.door_open ? 'border-amber-500/40 bg-amber-500/10' : 'border-white/10 bg-black/20'}`}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Door</p>
                <p className={`text-sm font-black mt-1 ${readout.live.door_open ? 'text-amber-400' : 'text-white'}`}>
                  {readout.live.door_open ? 'Open' : 'Closed'}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Lock</p>
                <p className="text-sm font-black mt-1 text-white capitalize">{readout.live.lock_state}</p>
              </div>
              <div className={`rounded-xl border p-3 text-center ${readout.live.packets_stale ? 'border-red-500/30 bg-red-500/10' : 'border-white/10 bg-black/20'}`}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Last packet</p>
                <p className={`text-sm font-black mt-1 ${readout.live.packets_stale ? 'text-red-400' : 'text-white'}`}>
                  {age(readout.live.packet_age_seconds)}
                </p>
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${style.wrap}`}>
              <div className="flex items-start gap-2">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.text}`} />
                <div>
                  <p className={`text-xs font-semibold ${style.text}`}>{readout.verdict_label}</p>
                  <p className="text-xs text-white/55 mt-1 leading-relaxed">{readout.verdict_note}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">Run the test</p>
              <p className="text-xs text-white/55 leading-relaxed">
                Unlock the car, open the driver door, then close it again. Each flip should appear below within
                about 30 seconds. If nothing appears while the door is physically open, the wire is not reporting.
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">
                Recorded flips ({readout.evidence.opened_count} open · {readout.evidence.closed_count} closed)
              </p>
              {readout.recent?.length ? (
                <div className="space-y-1">
                  {readout.recent.map((r, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-black/25 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${r.door_open ? 'bg-amber-400' : 'bg-green-400'}`} />
                        <span className="text-xs font-semibold text-white capitalize">{r.change}</span>
                        <span className="text-[10px] text-white/35 capitalize">lock: {r.lock_state}</span>
                      </div>
                      <span className="text-[10px] font-mono text-white/40 shrink-0">{clock(r.at)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/35">No flips recorded yet.</p>
              )}
            </div>
          </>
        )}

        <div className="border-t border-white/10 pt-4">
          <div className="flex gap-2">
            <Button
              onClick={checkFleet}
              disabled={fleetLoading}
              variant="outline"
              className="gap-2 h-10 flex-1 border-sky-500/30 text-sky-300 hover:bg-sky-500/10"
            >
              {fleetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Which vehicles can be armed
            </Button>
          </div>

          {fleet?.summary && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {[
                  ['Verified', fleet.summary.verified, 'text-green-400'],
                  ['Partial', fleet.summary.partial, 'text-amber-400'],
                  ['Stuck', fleet.summary.stuck_open, 'text-amber-400'],
                  ['Blind', fleet.summary.blind, 'text-red-400'],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-lg bg-black/25 p-2 text-center">
                    <p className={`text-base font-black ${color}`}>{value}</p>
                    <p className="text-[10px] text-white/40">{label}</p>
                  </div>
                ))}
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {fleet.fleet.map((row) => (
                  <div key={row.device_id} className="flex items-center justify-between rounded-lg bg-black/25 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{row.unique_id || row.device_id}</p>
                      <p className="text-[10px] text-white/35">{row.verdict_label}</p>
                    </div>
                    <span className="text-[10px] font-mono text-white/40 shrink-0">
                      {row.evidence.last_flip_at ? clock(row.evidence.last_flip_at) : 'never'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}