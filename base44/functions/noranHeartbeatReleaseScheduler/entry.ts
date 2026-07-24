// ── DEPRECATED: Noran Heartbeat-Delay Command Release Scheduler ──
// This scheduler is DEPRECATED and DISABLED.
// Heartbeat-delay command gate was removed after Traccar decoder fix.
// Commands are now sent immediately via Traccar API (no heartbeat wait).
// This function is kept for historical audit only - it will NOT release commands.

const PROVIDER_KEY = 'traccar_noran_mt20';
const DEPRECATED_REASON = 'Heartbeat-delay command gate removed after Traccar decoder fix';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isCron = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
    const isScheduled = req.headers.get('x-base44-scheduled-function') === 'true';
    if (!isCron && !isScheduled) {
      const user = await base44.auth.me().catch(() => null);
      if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden: cron-secret, scheduled, or admin required' }, { status: 403 });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    console.log(`[SCHEDULER_DEPRECATED] This scheduler is disabled. ${DEPRECATED_REASON}`);

    // HISTORICAL CLEANUP ONLY: Mark old stuck commands as abandoned
    // Do NOT release any commands
    const oldPendingCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({
      provider_key: PROVIDER_KEY,
      queue_status: 'pending_waiting_for_next_heartbeat'
    }, '-created_date', 100);

    const markedCount = 0;
    for (const command of oldPendingCommands) {
      // Skip - do not modify historical records
      // Commands with old statuses will remain for audit purposes
    }

    return Response.json({ 
      ok: true, 
      deprecated: true, 
      reason: DEPRECATED_REASON,
      message: 'Heartbeat-delay scheduler disabled. Commands now sent immediately via Traccar API.',
      timestamp: nowIso 
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});