import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Monitor, ExternalLink, Plus, Copy, Check, AlertTriangle, Loader2, ShieldAlert, Eye } from 'lucide-react';
import { toast } from 'sonner';

/**
 * ACVViewerPanel
 *
 * Read-only ACV auction viewer integrated into HostDealer360.
 * - Never shows credentials
 * - Opens ACV in a new secure tab (no iframe — safer for cross-domain restrictions)
 * - Bridges to PurchaseRequestForm with auction_source=acv pre-filled
 */
export default function ACVViewerPanel({ onStartPurchaseRequest }) {
  const [state, setState] = useState('idle'); // idle | loading | active | error | disabled
  const [errorMsg, setErrorMsg] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [vin, setVin] = useState('');
  const [auctionLink, setAuctionLink] = useState('');
  const [vinCopied, setVinCopied] = useState(false);
  const sessionEndedRef = useRef(false);
  const pingIntervalRef = useRef(null);

  // Auto-end session on unmount
  useEffect(() => {
    return () => {
      if (sessionId && !sessionEndedRef.current) {
        sessionEndedRef.current = true;
        base44.functions.invoke('acvViewerSession', { action: 'end_session', session_id: sessionId }).catch(() => {});
      }
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [sessionId]);

  // Idle timeout ping: every 2 minutes, check/refresh last_activity_at
  useEffect(() => {
    if (!sessionId || state !== 'active') {
      if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
      return;
    }
    pingIntervalRef.current = setInterval(async () => {
      const res = await base44.functions.invoke('acvViewerSession', { action: 'ping_session', session_id: sessionId }).catch(() => null);
      const data = res?.data;
      if (!data?.active) {
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        setState('idle');
        setSessionId(null);
        setExpiresAt(null);
        const msg = data?.code === 'SESSION_IDLE_TIMEOUT'
          ? 'Session expired due to inactivity. Start a new session to continue.'
          : 'ACV viewer session expired. Start a new session to continue.';
        toast.info(msg);
      }
    }, 2 * 60 * 1000);
    return () => { if (pingIntervalRef.current) clearInterval(pingIntervalRef.current); };
  }, [sessionId, state]);

  // Auto-expire UI when session reaches max time
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return;
    const timer = setTimeout(() => {
      setState('idle');
      setSessionId(null);
      setExpiresAt(null);
      toast.info('ACV viewer session expired. Start a new session to continue.');
    }, ms);
    return () => clearTimeout(timer);
  }, [expiresAt]);

  async function handleOpenViewer() {
    setState('loading');
    setErrorMsg('');
    const res = await base44.functions.invoke('acvViewerSession', { action: 'start_session' });
    const data = res.data;

    if (!data?.success) {
      const code = data?.code;
      if (code === 'VIEWER_DISABLED') {
        setState('disabled');
      } else {
        setState('error');
        setErrorMsg(data?.error || 'Viewer unavailable. Please try again.');
      }
      return;
    }

    setSessionId(data.session_id);
    setExpiresAt(data.expires_at);
    setViewerUrl(data.viewer_session_url);
    setState('active');

    if (data.login_warning) {
      toast.warning(data.login_warning);
    }
  }

  async function handleEndSession() {
    if (sessionId) {
      sessionEndedRef.current = true;
      await base44.functions.invoke('acvViewerSession', { action: 'end_session', session_id: sessionId }).catch(() => {});
    }
    if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
    setState('idle');
    setSessionId(null);
    setExpiresAt(null);
    setViewerUrl(null);
    }

  function handleCopyVin() {
    if (!vin.trim()) return;
    navigator.clipboard.writeText(vin.trim());
    setVinCopied(true);
    // Log VIN copy + update last_activity_at
    if (sessionId) {
      base44.functions.invoke('acvViewerSession', { action: 'ping_session', session_id: sessionId }).catch(() => {});
      base44.asServiceRole?.entities?.ACVViewerSession?.update(sessionId, { vin_copied: vin.trim() }).catch(() => {});
    }
    toast.success('VIN copied to clipboard');
    setTimeout(() => setVinCopied(false), 2000);
  }

  function handleStartPurchaseRequest() {
    if (sessionId) {
      // Ping last_activity_at then end
      base44.functions.invoke('acvViewerSession', { action: 'ping_session', session_id: sessionId }).catch(() => {});
      base44.functions.invoke('acvViewerSession', { action: 'end_session', session_id: sessionId }).catch(() => {});
      sessionEndedRef.current = true;
      if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
    }
    onStartPurchaseRequest({
      auction_source: 'acv',
      vin: vin.trim() || undefined,
      auction_link: auctionLink.trim() || undefined,
    });
  }

  const minutesLeft = expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 60000)) : null;

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-2">
        <div className="flex items-start gap-3">
          <Eye className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-cyan-300">ACV Read-Only Viewer</p>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Browse ACV inventory in read-only mode. You cannot bid or buy here.
              To purchase a vehicle, copy the VIN and create a Dealer360 purchase request below.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <ShieldAlert className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
          <p className="text-xs text-yellow-300/80">
            Do not attempt to bid, purchase, access account settings, or change any profile/billing details in the ACV portal.
          </p>
        </div>
      </div>

      {/* Session state */}
      {state === 'idle' && (
        <Button onClick={handleOpenViewer} className="gradient-primary w-full">
          <Monitor className="h-4 w-4 mr-2" />Open ACV Viewer
          <ExternalLink className="h-3.5 w-3.5 ml-1.5 opacity-70" />
        </Button>
      )}

      {state === 'loading' && (
        <Button disabled className="w-full">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting viewer session…
        </Button>
      )}

      {state === 'active' && viewerUrl && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm text-green-400">
              <Monitor className="h-4 w-4" />
              <span>Viewer session active</span>
              <Badge className="text-xs bg-green-500/20 text-green-300">{minutesLeft}m remaining</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => window.open(viewerUrl, '_blank', 'noopener,noreferrer')} className="text-xs text-cyan-400 hover:text-cyan-300">
                <ExternalLink className="h-3 w-3 mr-1" />Pop Out
              </Button>
              <Button variant="ghost" size="sm" onClick={handleEndSession} className="text-xs text-red-400 hover:text-red-300">
                End Session
              </Button>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden border border-border/50" style={{ height: '600px' }}>
            <iframe
              src={viewerUrl}
              title="ACV Auctions Viewer"
              className="w-full h-full"
              allow="same-origin"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
          <div className="flex items-start gap-2 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{errorMsg || 'Auction viewer unavailable. Paste VIN or auction link into a purchase request.'}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setState('idle')}>Try Again</Button>
        </div>
      )}

      {state === 'disabled' && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm text-yellow-400 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>ACV viewer is currently disabled by your administrator. You can still create a purchase request manually.</span>
        </div>
      )}

      {/* Purchase request bridge */}
      <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-4">
        <p className="text-sm font-semibold">Start a Purchase Request from ACV</p>
        <p className="text-xs text-muted-foreground">
          Found a vehicle on ACV? Enter the VIN (and optionally the listing URL), then click below to open the purchase request form pre-filled with ACV as the source.
        </p>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={vin}
              onChange={e => setVin(e.target.value.toUpperCase())}
              placeholder="VIN (e.g. 1HGCV1F30LA123456)"
              className="font-mono text-sm bg-secondary/40 uppercase"
              maxLength={17}
            />
            <Button size="icon" variant="outline" onClick={handleCopyVin} disabled={!vin.trim()} title="Copy VIN">
              {vinCopied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Input
            value={auctionLink}
            onChange={e => setAuctionLink(e.target.value)}
            placeholder="ACV listing URL (optional)"
            className="text-sm bg-secondary/40"
          />
        </div>

        <Button
          className="gradient-primary w-full"
          onClick={handleStartPurchaseRequest}
        >
          <Plus className="h-4 w-4 mr-2" />Create Purchase Request
        </Button>
      </div>
    </div>
  );
}