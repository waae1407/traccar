import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Repair Noran Commands Affected by Dispatch Bug ──
// Marks commands that expired_no_heartbeat despite valid heartbeats arriving
// Does NOT resend old commands - only marks them for diagnostic purposes

const PROVIDER_KEY = 'traccar_noran_mt20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }
    
    const body = await req.json().catch(() => ({}));
    const deviceUniqueId = body.device_unique_id || 'NR09G51902';
    const dryRun = body.dry_run !== false; // Default to dry run
    
    console.log(`[REPAIR_START] device_unique_id=${deviceUniqueId} dry_run=${dryRun}`);
    
    // Find all expired commands for this device
    const expiredCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({
      provider_key: PROVIDER_KEY,
      device_unique_id: deviceUniqueId,
      status: 'expired_no_heartbeat'
    }, '-created_date', 50);
    
    console.log(`[REPAIR_FOUND] total_expired_commands=${expiredCommands.length}`);
    
    // Get heartbeat events for this device
    const heartbeatEvents = await base44.asServiceRole.entities.TelematicsEvent.filter({
      provider_key: PROVIDER_KEY,
      event_type: 'mt20_heartbeat_forwarded_log'
    }, '-created_at', 100);
    
    const deviceHeartbeats = heartbeatEvents.filter(h => 
      (h.raw_payload?.device_unique_id || h.raw_payload?.unique_id) === deviceUniqueId
    );
    
    console.log(`[REPAIR_HEARTBEATS] total_heartbeats_found=${deviceHeartbeats.length}`);
    
    const results = {
      total_commands: expiredCommands.length,
      marked_as_dispatch_bug: 0,
      already_has_heartbeat: 0,
      no_heartbeat_found: 0,
      details: []
    };
    
    for (const cmd of expiredCommands) {
      const createdAt = new Date(cmd.created_at || cmd.created_date).getTime();
      const expiredAt = createdAt + 90000; // 90 seconds
      
      // Check if any heartbeat arrived within 90 seconds of command creation
      const heartbeatWithinWindow = deviceHeartbeats.find(h => {
        const hTime = new Date(h.created_at).getTime();
        return hTime > createdAt && hTime < expiredAt;
      });
      
      if (heartbeatWithinWindow || cmd.heartbeat_received_at) {
        // Heartbeat arrived but command still expired - this is the dispatch bug
        results.marked_as_dispatch_bug++;
        results.details.push({
          command_id: cmd.id,
          command_type: cmd.command_type,
          created_at: cmd.created_at,
          heartbeat_received_at: cmd.heartbeat_received_at,
          heartbeat_found_in_window: !!heartbeatWithinWindow,
          action: dryRun ? 'would_mark' : 'marked',
          failure_reason: 'expired_due_to_dispatch_bug'
        });
        
        if (!dryRun) {
          await base44.asServiceRole.entities.TelematicsCommand.update(cmd.id, {
            failure_reason: 'expired_due_to_dispatch_bug - heartbeat arrived within 90s but autoDispatchPendingCommands did not release command',
            diagnostic_heartbeat_event_id: heartbeatWithinWindow?.id || null,
            diagnostic_marked_at: new Date().toISOString()
          });
        }
      } else {
        // No heartbeat found - genuine expiration
        results.no_heartbeat_found++;
        results.details.push({
          command_id: cmd.id,
          command_type: cmd.command_type,
          created_at: cmd.created_at,
          action: 'no_action_needed',
          reason: 'no_heartbeat_arrived_within_90s'
        });
      }
    }
    
    console.log(`[REPAIR_COMPLETE] marked=${results.marked_as_dispatch_bug} no_heartbeat=${results.no_heartbeat_found} dry_run=${dryRun}`);
    
    return Response.json({
      ok: true,
      device_unique_id: deviceUniqueId,
      dry_run: dryRun,
      ...results
    });
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});