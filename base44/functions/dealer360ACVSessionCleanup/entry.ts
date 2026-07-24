/**
 * dealer360ACVSessionCleanup
 *
 * Scheduled job (every 10 minutes) — expires orphaned ACV viewer sessions.
 * Targets sessions that are still active but either:
 *   1. expires_at <= now (max 60-min duration exceeded)
 *   2. last_activity_at older than 15 minutes (idle timeout)
 *   3. started_at older than 60 minutes with no last_activity_at (legacy/orphan)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;  // 15 minutes
const MAX_SESSION_MS  = 60 * 60 * 1000;  // 60 minutes

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isCron = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
    const isScheduled = req.headers.get('x-base44-scheduled-function') === 'true';
    if (!isCron && !isScheduled) {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }
    }

    const allActive = await base44.asServiceRole.entities.ACVViewerSession.filter({ status: 'active' });
    const now = Date.now();
    const nowIso = new Date().toISOString();
    let expiredCount = 0;

    for (const session of allActive) {
      const maxExpired = session.expires_at && new Date(session.expires_at).getTime() <= now;

      const lastActivity = session.last_activity_at || session.started_at;
      const idleExpired = lastActivity
        ? (now - new Date(lastActivity).getTime()) >= IDLE_TIMEOUT_MS
        : (now - new Date(session.started_at || 0).getTime()) >= MAX_SESSION_MS;

      if (maxExpired || idleExpired) {
        await base44.asServiceRole.entities.ACVViewerSession.update(session.id, {
          status: 'expired',
          ended_at: nowIso,
        });
        expiredCount++;
      }
    }

    return Response.json({
      ok: true,
      checked: allActive.length,
      expired_count: expiredCount,
      ran_at: nowIso,
    });

  } catch (error) {
    console.error('[dealer360ACVSessionCleanup]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});