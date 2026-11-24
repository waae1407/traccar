import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

/**
 * Continuous feature discovery.
 *
 * Reads real operating signals (which platform events actually fire, which
 * alerts actually trigger) and asks the model to propose only capabilities
 * those signals evidence. Every candidate lands as verified:false /
 * enabled:false so nothing can be marketed until an administrator reviews and
 * verifies it against shipped functionality.
 */

const WINDOW_DAYS = 45;

function slug(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();

    const [eventRows, alertRows, features] = await Promise.all([
      base44.asServiceRole.entities.ActivityEvent.aggregate({ query: { created_date: { $gte: since } }, groupBy: 'event_type' }).catch(() => ({ rows: [] })),
      base44.asServiceRole.entities.OperationalAlert.aggregate({ query: { created_date: { $gte: since } }, groupBy: 'alert_type' }).catch(() => ({ rows: [] })),
      base44.asServiceRole.entities.MarketingFeature.list('-created_date', 200),
    ]);

    const signals = {
      activity_events: (eventRows.rows || []).sort((a: any, b: any) => (b.count || 0) - (a.count || 0)).slice(0, 40).map((row: any) => ({ name: row.event_type, uses: row.count })),
      operational_alerts: (alertRows.rows || []).sort((a: any, b: any) => (b.count || 0) - (a.count || 0)).slice(0, 20).map((row: any) => ({ name: row.alert_type, uses: row.count })),
    };

    const covered = features.map((item: any) => `${item.key} — ${item.claim}`).join('\n');
    const signalText = [
      'Platform events that fired in the last 45 days (name, count):',
      ...signals.activity_events.map((item: any) => `- ${item.name}: ${item.uses}`),
      '',
      'Operational alerts that fired in the last 45 days (name, count):',
      ...signals.operational_alerts.map((item: any) => `- ${item.name}: ${item.uses}`),
    ].join('\n');

    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You audit a car-rental management platform for marketable capabilities.

You are given real telemetry: the platform events and operational alerts that actually fired in the last 45 days. Propose only capabilities that this telemetry evidences as shipped and in use. Never invent a feature, never propose anything aspirational, and never propose a capability already covered by the existing catalog below.

For each proposal, write copy a rental operator would recognise as true, in the same voice as the catalog:
- label: two or three uppercase words
- kicker: a short uppercase subtitle
- claim: one factual sentence describing what the platform does
- pain: the operator frustration it removes, phrased as a noun phrase
- cta: one uppercase word used as a comment keyword
- audience: who benefits
- category: one of payments, protection, operations, access, compliance, growth
- evidence: the exact event or alert names from the telemetry that prove it exists
- body: three flyer lines of at most 33 characters each, separated by newlines
- benefits: four items of {icon, label} where icon is one of creditCard, lock, unlock, mapPin, bell, shieldCheck, activity, route, gauge, zap, camera, scan

Existing catalog (do not repeat these):
${covered || 'none'}

Telemetry:
${signalText}

Return between 0 and 5 proposals. If the telemetry evidences nothing new, return an empty list.`,
      response_json_schema: {
        type: 'object',
        properties: {
          candidates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                kicker: { type: 'string' },
                claim: { type: 'string' },
                pain: { type: 'string' },
                cta: { type: 'string' },
                audience: { type: 'string' },
                category: { type: 'string' },
                evidence: { type: 'array', items: { type: 'string' } },
                body: { type: 'string' },
                benefits: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { icon: { type: 'string' }, label: { type: 'string' } },
                  },
                },
              },
              required: ['label', 'claim', 'evidence'],
            },
          },
        },
        required: ['candidates'],
      },
    });

    const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
    const knownKeys = new Set(features.map((item: any) => item.key));
    const created: any[] = [];
    const skipped: string[] = [];

    for (const candidate of candidates) {
      const key = slug(candidate.label);
      if (!key || knownKeys.has(key)) {
        skipped.push(candidate.label || key);
        continue;
      }
      if (!Array.isArray(candidate.evidence) || !candidate.evidence.length) {
        skipped.push(`${candidate.label} (no evidence)`);
        continue;
      }
      const record = await base44.asServiceRole.entities.MarketingFeature.create({
        key,
        label: String(candidate.label).toUpperCase(),
        kicker: candidate.kicker || '',
        claim: candidate.claim,
        pain: candidate.pain || '',
        cta: (candidate.cta || 'INFO').toUpperCase(),
        icon: (candidate.benefits?.[0]?.icon) || 'shieldCheck',
        screen: null,
        body: candidate.body || '',
        audience: candidate.audience || 'Rental operators',
        objective: 'Discovered capability',
        benefits: candidate.benefits || [],
        category: ['payments', 'protection', 'operations', 'access', 'compliance', 'growth'].includes(candidate.category)
          ? candidate.category
          : 'operations',
        verified: false,
        enabled: false,
        source: 'discovered',
        use_count: 0,
        notes: `Discovered from live telemetry. Evidence: ${candidate.evidence.join(', ')}. Verify against shipped functionality before enabling.`,
      });
      knownKeys.add(key);
      created.push({ id: record.id, key, label: record.label });
    }

    return Response.json({
      window_days: WINDOW_DAYS,
      signals,
      proposed: candidates.length,
      created,
      skipped,
      note: 'Every discovery is created unverified and disabled until an administrator verifies the claim.',
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});