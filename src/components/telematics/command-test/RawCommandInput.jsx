import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Terminal, Send, Loader2, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

const EXAMPLE_COMMANDS = [
  { label: 'ACC ON', value: '*HQ,{imei},ACC,1#' },
  { label: 'ACC OFF', value: '*HQ,{imei},ACC,0#' },
  { label: 'Engine Cut', value: '*HQ,{imei},RELAY,0#' },
  { label: 'Engine Restore', value: '*HQ,{imei},RELAY,1#' },
  { label: 'Location', value: '*HQ,{imei},R1#' },
  { label: 'Status', value: '*HQ,{imei},V1#' },
  { label: 'Reset', value: '*HQ,{imei},RESET#' },
  { label: 'SOS', value: '*HQ,{imei},SOS,A,{phone}#' },
];

export default function RawCommandInput({ device, onCommandSent }) {
  const [rawCommand, setRawCommand] = useState('');
  const [protocol, setProtocol] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [showExamples, setShowExamples] = useState(false);

  const imei = device?.imei || device?.device_id || '';

  const handleSend = async () => {
    if (!rawCommand.trim() || !device?.id) return;
    setLoading(true);
    setError('');
    setResult(null);
    const ts = new Date().toISOString();
    try {
      const res = await base44.functions.invoke('sendTelematicsCommand', {
        command_type: 'raw',
        telematics_device_id: device.id,
        raw_command: rawCommand.trim(),
        protocol: protocol !== 'auto' ? protocol : undefined,
        admin_device_command_test: true,
      });
      const data = res.data;
      setResult(data);
      setHistory((prev) => [{ command: rawCommand.trim(), protocol, result: data, ts, ok: true }, ...prev.slice(0, 9)]);
      onCommandSent?.();
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setError(msg);
      setHistory((prev) => [{ command: rawCommand.trim(), protocol, result: null, error: msg, ts, ok: false }, ...prev.slice(0, 9)]);
    }
    setLoading(false);
  };

  const injectExample = (template) => {
    const filled = template.replace('{imei}', imei).replace('{phone}', device?.phone || '');
    setRawCommand(filled);
    setShowExamples(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-card/80">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
          <Terminal className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Raw Command Input</p>
          <p className="text-xs text-muted-foreground">Send a custom protocol command directly to the device</p>
        </div>
        {device?.imei && (
          <Badge variant="outline" className="ml-auto text-xs font-mono text-muted-foreground">
            IMEI: {device.imei}
          </Badge>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Protocol selector + examples toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Protocol:</label>
            <select
              className="h-8 rounded-md border border-border bg-secondary text-foreground text-xs px-2 focus:outline-none focus:ring-1 focus:ring-ring"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
            >
              <option value="auto">Auto-detect</option>
              <option value="hqproto">HQ Protocol</option>
              <option value="traccar">Traccar</option>
              <option value="moovetrax">Moovetrax</option>
              <option value="gt06">GT06</option>
              <option value="at">AT Commands</option>
            </select>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground gap-1 h-8"
            onClick={() => setShowExamples((v) => !v)}
          >
            Examples
            {showExamples ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>

        {/* Example commands */}
        {showExamples && (
          <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/40 border border-border">
            {EXAMPLE_COMMANDS.map((ex) => (
              <button
                key={ex.label}
                onClick={() => injectExample(ex.value)}
                className="px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs font-mono text-foreground border border-border transition-colors"
              >
                {ex.label}
              </button>
            ))}
            {imei && (
              <p className="w-full text-xs text-muted-foreground mt-1">
                <span className="font-mono text-primary">{'{imei}'}</span> will be replaced with <span className="font-mono text-white">{imei}</span>
              </p>
            )}
          </div>
        )}

        {/* Command textarea */}
        <Textarea
          value={rawCommand}
          onChange={(e) => setRawCommand(e.target.value)}
          onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') handleSend(); }}
          placeholder={`Enter raw command, e.g. *HQ,${imei || '<imei>'},ACC,1#`}
          className="font-mono text-sm min-h-[80px] bg-muted/30 border-border resize-none"
          disabled={loading}
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Ctrl+Enter to send</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => { setRawCommand(''); setResult(null); setError(''); }}
              disabled={loading || !rawCommand}
            >
              Clear
            </Button>
            <Button
              size="sm"
              className="gap-2 text-xs"
              onClick={handleSend}
              disabled={loading || !rawCommand.trim() || !device?.id}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send Command
            </Button>
          </div>
        </div>

        {/* Result */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-xs font-semibold text-red-400 mb-1">Error</p>
            <p className="text-xs font-mono text-red-300">{error}</p>
          </div>
        )}
        {result && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
            <p className="text-xs font-semibold text-green-400 mb-1">Response</p>
            <pre className="text-xs font-mono text-green-300 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}

        {/* Mini history */}
        {history.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Recent
            </p>
            {history.map((entry, i) => (
              <div
                key={i}
                onClick={() => setRawCommand(entry.command)}
                className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/30 border border-border hover:bg-muted/50 cursor-pointer group"
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${entry.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-mono text-xs text-foreground truncate flex-1">{entry.command}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0 hidden group-hover:block">
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}