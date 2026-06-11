import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ShieldAlert, Monitor, Ban, RefreshCw, Loader2, User, Clock } from 'lucide-react';
import { toast } from 'sonner';

function SessionRow({ session, onRevoke }) {
  const isActive = session.status === 'active';
  const started = session.started_at ? new Date(session.started_at).toLocaleString() : '—';
  const expires = session.expires_at ? new Date(session.expires_at).toLocaleString() : '—';

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-card/30 p-3">
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{session.user_email}</span>
          <Badge className={`text-xs capitalize ${
            session.status === 'active' ? 'bg-green-500/20 text-green-400' :
            session.status === 'revoked' ? 'bg-red-500/20 text-red-400' :
            'bg-secondary text-muted-foreground'
          }`}>{session.status}</Badge>
          {session.user_role === 'admin' && <Badge className="text-xs bg-purple-500/20 text-purple-400">admin</Badge>}
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
          <span><Clock className="h-3 w-3 inline mr-0.5" />{started}</span>
          {isActive && <span>Expires: {expires}</span>}
          {session.vin_copied && <span className="font-mono">VIN: {session.vin_copied}</span>}
          {session.revoked_by && <span>Revoked by: {session.revoked_by}</span>}
        </div>
      </div>
      {isActive && (
        <Button size="sm" variant="destructive" className="shrink-0 text-xs" onClick={() => onRevoke(session.id)}>
          <Ban className="h-3.5 w-3.5 mr-1" />Revoke
        </Button>
      )}
    </div>
  );
}

export default function ACVAdminSettings() {
  const qc = useQueryClient();
  const [toggling, setToggling] = useState(false);

  // Viewer enabled state from PlatformSetting
  const { data: settings = [] } = useQuery({
    queryKey: ['platform_setting_acv_viewer'],
    queryFn: () => base44.entities.PlatformSetting.filter({ key: 'acv_viewer_enabled' }),
  });
  const viewerSetting = settings[0];
  const viewerEnabled = viewerSetting?.value_boolean ?? false;

  // Sessions
  const [cleanupResult, setCleanupResult] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  const { data: sessionsData, isLoading: sessionsLoading, refetch: refetchSessions } = useQuery({
    queryKey: ['acv_viewer_sessions'],
    queryFn: () => base44.functions.invoke('acvViewerSession', { action: 'list_sessions' }).then(r => r.data?.sessions || []),
  });
  const sessions = sessionsData || [];
  const activeSessions = sessions.filter(s => s.status === 'active');
  const expiredSessions = sessions.filter(s => s.status === 'expired');
  const revokedSessions = sessions.filter(s => s.status === 'revoked');

  // Orphaned: active sessions past expires_at
  const now = Date.now();
  const orphanedSessions = activeSessions.filter(s => s.expires_at && new Date(s.expires_at).getTime() <= now);

  async function handleCleanup() {
    setCleanupLoading(true);
    const res = await base44.functions.invoke('acvViewerSession', { action: 'cleanup_sessions' });
    if (res.data?.success) {
      setCleanupResult(res.data);
      toast.success(`Cleanup complete — ${res.data.expired_count} session(s) expired`);
      refetchSessions();
    } else {
      toast.error('Cleanup failed');
    }
    setCleanupLoading(false);
  }

  async function handleToggle(enabled) {
    setToggling(true);
    const res = await base44.functions.invoke('acvViewerSession', { action: 'toggle_viewer', enabled });
    if (res.data?.success) {
      qc.invalidateQueries(['platform_setting_acv_viewer']);
      toast.success(`ACV viewer ${enabled ? 'enabled' : 'disabled'}`);
    } else {
      toast.error('Failed to update viewer setting');
    }
    setToggling(false);
  }

  async function handleRevoke(sessionId) {
    const res = await base44.functions.invoke('acvViewerSession', { action: 'revoke_session', session_id: sessionId });
    if (res.data?.success) {
      toast.success('Session revoked');
      refetchSessions();
    } else {
      toast.error('Failed to revoke session');
    }
  }

  async function handleEmergencyDisable() {
    setToggling(true);
    // Disable viewer + revoke all active sessions
    await base44.functions.invoke('acvViewerSession', { action: 'toggle_viewer', enabled: false });
    for (const s of activeSessions) {
      await base44.functions.invoke('acvViewerSession', { action: 'revoke_session', session_id: s.id }).catch(() => {});
    }
    qc.invalidateQueries(['platform_setting_acv_viewer']);
    refetchSessions();
    toast.warning('Emergency disable: ACV viewer disabled and all active sessions revoked.');
    setToggling(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Monitor className="h-4 w-4 text-cyan-400" />ACV Viewer Settings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Control host access to the ACV read-only auction viewer</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetchSessions()} className="text-xs">
          <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
        </Button>
      </div>

      {/* Credential display (masked, never real values) */}
      <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Credentials (Server-Side Only)</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Username</span><span className="font-mono tracking-widest">••••••••</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Password</span><span className="font-mono tracking-widest">••••••••</span></div>
        </div>
        <p className="text-xs text-muted-foreground">Credentials are stored as backend secrets and never transmitted to the frontend.</p>
      </div>

      {/* Enable/Disable toggle */}
      <div className="rounded-xl border border-border/50 bg-card/40 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Viewer Access</p>
          <p className="text-xs text-muted-foreground">Allow approved hosts to open the ACV read-only viewer</p>
        </div>
        <div className="flex items-center gap-3">
          {toggling && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch
            checked={viewerEnabled}
            onCheckedChange={handleToggle}
            disabled={toggling}
          />
          <Badge className={viewerEnabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
            {viewerEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
      </div>

      {/* Session stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active', count: activeSessions.length, color: 'text-green-400' },
          { label: 'Expired', count: expiredSessions.length, color: 'text-muted-foreground' },
          { label: 'Revoked', count: revokedSessions.length, color: 'text-red-400' },
          { label: 'Orphaned', count: orphanedSessions.length, color: orphanedSessions.length > 0 ? 'text-yellow-400' : 'text-muted-foreground' },
        ].map(({ label, count, color }) => (
          <div key={label} className="rounded-lg border border-border/40 bg-card/30 p-3 text-center">
            <p className={`text-xl font-bold ${color}`}>{count}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Cleanup controls */}
      <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Session Cleanup</p>
            <p className="text-xs text-muted-foreground">Expire orphaned and idle sessions (runs automatically every 10 minutes)</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleCleanup} disabled={cleanupLoading} className="text-xs shrink-0">
            {cleanupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Run Now
          </Button>
        </div>
        {cleanupResult && (
          <p className="text-xs text-muted-foreground">
            Last run: {cleanupResult.expired_count} expired out of {cleanupResult.checked} checked.
          </p>
        )}
      </div>

      {/* Active sessions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Active Sessions <span className="text-muted-foreground font-normal">({activeSessions.length})</span></p>
          {activeSessions.length > 0 && (
            <Button size="sm" variant="destructive" className="text-xs" onClick={handleEmergencyDisable} disabled={toggling}>
              <ShieldAlert className="h-3.5 w-3.5 mr-1" />Emergency Disable All
            </Button>
          )}
        </div>
        {sessionsLoading && <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>}
        {!sessionsLoading && activeSessions.length === 0 && (
          <p className="text-xs text-muted-foreground py-3 text-center">No active sessions.</p>
        )}
        <div className="space-y-2">
          {activeSessions.map(s => <SessionRow key={s.id} session={s} onRevoke={handleRevoke} />)}
        </div>
      </div>

      {/* Recent session history */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Recent Session History</p>
        {!sessionsLoading && sessions.filter(s => s.status !== 'active').slice(0, 10).map(s => (
          <SessionRow key={s.id} session={s} onRevoke={handleRevoke} />
        ))}
        {!sessionsLoading && sessions.filter(s => s.status !== 'active').length === 0 && (
          <p className="text-xs text-muted-foreground py-3 text-center">No session history yet.</p>
        )}
      </div>
    </div>
  );
}