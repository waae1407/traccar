import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Noran MT20 Command Audit Trail Repair Script ──
// Backfills source_function and status for commands with inconsistent audit trails.
// One-time execution. Admin-only.

const PROVIDER_KEY = 'traccar_noran_mt20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const results = {
      processed: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      details: []
    };

    // Find all Noran commands
    const allCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({
      provider_key: PROVIDER_KEY
    }, '-created_date', 1000); // Process last 1000 commands

    results.processed = allCommands.length;

    for (const cmd of allCommands) {
      try {
        const sentStatuses = ['sent_to_traccar', 'sent', 'delivered', 'acknowledged', 'executed', 'completed'];
        const isSent = sentStatuses.includes(cmd.status || '') || sentStatuses.includes(cmd.queue_status || '');
        const missingAudit = !cmd.sent_to_traccar_at || !cmd.traccar_command_id || !cmd.source_function;

        if (isSent && missingAudit) {
          const updatePayload = {};
          
          if (!cmd.source_function) {
            updatePayload.source_function = 'legacy_unknown';
          }

          // If sent to Traccar is missing but command is acknowledged, backfill with ack time
          if (!cmd.sent_to_traccar_at && cmd.acknowledged_at) {
            updatePayload.sent_to_traccar_at = cmd.acknowledged_at;
          }

          if (Object.keys(updatePayload).length > 0) {
            await base44.asServiceRole.entities.TelematicsCommand.update(cmd.id, updatePayload);
            results.updated++;
            results.details.push({ command_id: cmd.id, action: 'updated', fields: Object.keys(updatePayload) });
          } else {
            results.skipped++;
            results.details.push({ command_id: cmd.id, action: 'skipped', reason: 'No updates needed' });
          }
        } else {
          results.skipped++;
        }
      } catch (error) {
        results.failed++;
        results.details.push({ command_id: cmd.id, action: 'failed', error: error.message });
      }
    }

    return Response.json({ ok: true, ...results });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});