import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * acvViewerSession
 *
 * Validates the requesting user is an approved host or admin,
 * checks ACV_VIEWER_ENABLED, logs the session, and returns only
 * the viewer_session_url. Credentials are NEVER returned.
 *
 * Actions:
 *   start_session    — initiate a viewer session
 *   end_session      — mark a session as ended
 *   ping_session     — update last_activity_at (idle timeout heartbeat)
 *   list_sessions    — admin: list active/recent sessions
 *   revoke_session   — admin: revoke a specific session by id
 *   toggle_viewer    — admin: enable/disable viewer (updates PlatformSetting)
 *   cleanup_sessions — admin/scheduler: expire orphaned/idle sessions
 */

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;   // 15 minutes
const MAX_SESSION_MS  = 60 * 60 * 1000;    // 60 minutes

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = user.role === 'admin';
    const body = await req.json().catch(() => ({}));
    const { action = 'start_session', session_id } = body;

    // ── ADMIN-ONLY ACTIONS ──────────────────────────────────────────────────
    if (['list_sessions', 'revoke_session', 'toggle_viewer', 'cleanup_sessions'].includes(action)) {
      if (!isAdmin) {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }

      if (action === 'toggle_viewer') {
        const { enabled } = body;
        const settings = await base44.asServiceRole.entities.PlatformSetting.filter({ key: 'acv_viewer_enabled' });
        const payload = {
          key: 'acv_viewer_enabled',
          value_boolean: !!enabled,
          label: 'ACV Viewer Enabled',
          description: 'Controls whether hosts can access the ACV read-only auction viewer',
          updated_by: user.email,
          updated_at: new Date().toISOString(),
        };
        if (settings.length > 0) {
          await base44.asServiceRole.entities.PlatformSetting.update(settings[0].id, payload);
        } else {
          await base44.asServiceRole.entities.PlatformSetting.create(payload);
        }
        return Response.json({ success: true, enabled: !!enabled });
      }

      if (action === 'list_sessions') {
        const sessions = await base44.asServiceRole.entities.ACVViewerSession.list('-created_date', 100);
        return Response.json({ sessions });
      }

      if (action === 'revoke_session') {
        if (!session_id) return Response.json({ error: 'session_id required' }, { status: 400 });
        await base44.asServiceRole.entities.ACVViewerSession.update(session_id, {
          status: 'revoked',
          ended_at: new Date().toISOString(),
          revoked_by: user.email,
        });
        return Response.json({ success: true });
      }

      if (action === 'cleanup_sessions') {
        // Expire sessions where:
        //   1. expires_at <= now (max duration exceeded)
        //   2. last_activity_at <= now - 15min (idle timeout)
        // Both for sessions still marked active
        const allActive = await base44.asServiceRole.entities.ACVViewerSession.filter({ status: 'active' });
        const now = Date.now();
        let expiredCount = 0;

        for (const session of allActive) {
          const maxExpired = session.expires_at && new Date(session.expires_at).getTime() <= now;
          const idleExpired = session.last_activity_at
            ? (now - new Date(session.last_activity_at).getTime()) >= IDLE_TIMEOUT_MS
            : (now - new Date(session.started_at || 0).getTime()) >= IDLE_TIMEOUT_MS;

          if (maxExpired || idleExpired) {
            await base44.asServiceRole.entities.ACVViewerSession.update(session.id, {
              status: 'expired',
              ended_at: new Date().toISOString(),
            });
            expiredCount++;
          }
        }

        return Response.json({ success: true, expired_count: expiredCount, checked: allActive.length });
      }
    }

    // ── END SESSION ─────────────────────────────────────────────────────────
    if (action === 'end_session') {
      if (!session_id) return Response.json({ error: 'session_id required' }, { status: 400 });
      await base44.asServiceRole.entities.ACVViewerSession.update(session_id, {
        status: 'ended',
        ended_at: new Date().toISOString(),
      });
      return Response.json({ success: true });
    }

    // ── PING SESSION (idle timeout heartbeat) ────────────────────────────────
    if (action === 'ping_session') {
      if (!session_id) return Response.json({ error: 'session_id required' }, { status: 400 });

      const sessions = await base44.asServiceRole.entities.ACVViewerSession.filter({ id: session_id });
      const session = sessions[0];
      if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

      // Check if session should be expired
      const now = Date.now();
      const maxExpired = session.expires_at && new Date(session.expires_at).getTime() <= now;
      const lastActivity = session.last_activity_at || session.started_at;
      const idleExpired = lastActivity
        ? (now - new Date(lastActivity).getTime()) >= IDLE_TIMEOUT_MS
        : false;

      if (session.status !== 'active' || maxExpired || idleExpired) {
        if (session.status === 'active') {
          await base44.asServiceRole.entities.ACVViewerSession.update(session_id, {
            status: 'expired',
            ended_at: new Date().toISOString(),
          });
        }
        return Response.json({ active: false, code: idleExpired ? 'SESSION_IDLE_TIMEOUT' : 'SESSION_EXPIRED' });
      }

      // Still valid — update last_activity_at
      await base44.asServiceRole.entities.ACVViewerSession.update(session_id, {
        last_activity_at: new Date().toISOString(),
      });
      return Response.json({ active: true, expires_at: session.expires_at });
    }

    // ── START SESSION ────────────────────────────────────────────────────────
    // Check viewer enabled via DB setting first, fallback to env secret
    const settingRows = await base44.asServiceRole.entities.PlatformSetting.filter({ key: 'acv_viewer_enabled' });
    const dbEnabled = settingRows.length > 0 ? settingRows[0].value_boolean : null;
    const envEnabled = Deno.env.get('ACV_VIEWER_ENABLED') === 'true';
    const viewerEnabled = dbEnabled !== null ? dbEnabled : envEnabled;

    if (!viewerEnabled) {
      return Response.json({ error: 'ACV viewer is currently disabled.', code: 'VIEWER_DISABLED' }, { status: 503 });
    }

    // Verify host is approved (or admin)
    if (!isAdmin) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ email: user.email });
      const host = hosts[0];
      if (!host || host.status !== 'approved') {
        return Response.json({ error: 'Approved host account required to access the ACV viewer.', code: 'HOST_NOT_APPROVED' }, { status: 403 });
      }
    }

    const startUrl = Deno.env.get('ACV_START_URL');
    if (!startUrl) {
      return Response.json({ error: 'Viewer configuration incomplete. Contact support.', code: 'CONFIG_ERROR' }, { status: 503 });
    }

    // Create session record
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MAX_SESSION_MS);
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const hosts = isAdmin ? [] : await base44.asServiceRole.entities.Host.filter({ email: user.email });
    const hostRecord = hosts[0];

    const sessionRecord = await base44.asServiceRole.entities.ACVViewerSession.create({
      user_id: user.id,
      user_email: user.email,
      user_role: user.role,
      host_id: hostRecord?.id || null,
      host_email: hostRecord?.email || null,
      status: 'active',
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      last_activity_at: now.toISOString(),
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return Response.json({
      success: true,
      viewer_session_url: startUrl,
      session_id: sessionRecord.id,
      expires_at: expiresAt.toISOString(),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});