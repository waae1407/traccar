import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SCANNER_IP = '198.71.50.237';

Deno.serve(async (req) => {
  try {
    // Auth check
    const cronSecret = String(Deno.env.get('CRON_SECRET') || '').trim();
    const providedSecret = String(req.headers.get('x-cron-secret') || '').trim();
    if (!cronSecret || providedSecret !== cronSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    // Delete ALL scanner-generated ActivityEvents in one call (1 credit vs 500)
    const result = await base44.asServiceRole.entities.ActivityEvent.deleteMany({
      "metadata.ip": SCANNER_IP
    });

    return Response.json({
      ok: true,
      deleted: result?.deleted_count || result?.count || 'unknown',
      scanner_ip: SCANNER_IP
    });
  } catch (error) {
    console.error('[cleanupScannerEvents] CRITICAL:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});