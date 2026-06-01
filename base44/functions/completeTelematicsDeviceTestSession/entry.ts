import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const RESULT_FIELDS = [
  'locate_result',
  'status_result',
  'lock_result',
  'unlock_result',
  'horn_result',
  'lights_result',
  'starter_disable_result',
  'starter_restore_result'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const sessionId = String(body.session_id || '').trim();
    if (!sessionId) return Response.json({ error: 'session_id is required' }, { status: 400 });

    const sessions = await base44.asServiceRole.entities.TelematicsDeviceTestSession.filter({ id: sessionId });
    const session = sessions[0];
    if (!session) return Response.json({ error: 'Test session not found' }, { status: 404 });

    const unfinished = RESULT_FIELDS.filter((field) => !['pass', 'fail', 'not_supported'].includes(session[field]));
    if (unfinished.length) return Response.json({ error: 'All supported commands must be marked pass or fail before completion.', unfinished }, { status: 400 });

    const failed = RESULT_FIELDS.filter((field) => session[field] === 'fail');
    const status = failed.length ? 'failed' : 'passed';
    const completed = await base44.asServiceRole.entities.TelematicsDeviceTestSession.update(session.id, {
      status,
      completed_at: new Date().toISOString(),
      notes: body.notes ?? session.notes ?? ''
    });

    if (failed.length) {
      await base44.asServiceRole.entities.OperationalAlert.create({
        alert_type: 'command_failed',
        severity: 'warning',
        status: 'new',
        title: 'Telematics device command test failed',
        message: `Device ${session.unique_id || session.device_id} failed command testing: ${failed.join(', ')}.`,
        recommended_action: 'Review the command history and keep the device out of live-ready status until resolved.',
        domain: 'telematics',
        source_entity_type: 'TelematicsDeviceTestSession',
        source_entity_id: session.id,
        provider_key: session.provider_key,
        telematics_device_id: session.device_id,
        metadata: { failed_tests: failed, tested_by: user.email }
      });
    }

    return Response.json({ ok: true, status, session: completed, failed_tests: failed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});