import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Legacy payment retry workflow intentionally disabled.
 * Payment-based starter disable/restore authority now belongs only to processGracePeriod.
 * This function must not retry Stripe payments and must not send MooveTrax kill/unkill commands.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'payment.legacy_retry_skipped',
      actor_id: 'retryFailedPayments',
      actor_email: 'automation@uridehub.com',
      actor_role: 'automation',
      target_entity: 'BookingRequest',
      target_id: '',
      summary: 'retryFailedPayments exited safely; processGracePeriod is the authoritative payment enforcement workflow.',
      metadata: {
        disabled_reason: '2-hour payment enforcement policy active',
        authoritative_workflow: 'processGracePeriod',
        sends_kill_or_unkill: false
      },
      source: 'legacy_function',
      user_email: 'automation',
      event_title: 'Legacy retry workflow skipped',
      event_status: 'success'
    });

    return Response.json({
      ok: true,
      skipped: true,
      message: 'retryFailedPayments is disabled. processGracePeriod is the single authoritative payment enforcement workflow.',
      sends_kill_or_unkill: false
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});