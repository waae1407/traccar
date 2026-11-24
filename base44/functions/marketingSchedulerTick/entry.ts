import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const DEFAULT_SCHEDULE = {
  review: '05:00',
  select: '05:15',
  generate: '05:30',
  validate: '05:45',
  instagram: '08:00',
  facebook: '10:00',
  x: '12:00',
  metrics: '20:00',
};

const STEP_ORDER = ['review', 'select', 'generate', 'validate', 'instagram', 'facebook', 'x', 'metrics'];

async function readSetting(base44, key, fallback) {
  const rows = await base44.asServiceRole.entities.PlatformSetting.filter({ key });
  const row = rows[0];
  if (!row) return fallback;
  if (row.value_boolean !== undefined && row.value_boolean !== null) return row.value_boolean;
  if (row.value_string !== undefined && row.value_string !== null) return row.value_string;
  return fallback;
}

async function writeSetting(base44, key, value, label) {
  const rows = await base44.asServiceRole.entities.PlatformSetting.filter({ key });
  const payload = { key, label, updated_by: 'scheduler', updated_at: new Date().toISOString() };
  if (typeof value === 'boolean') payload.value_boolean = value;
  else payload.value_string = String(value);
  if (rows[0]) await base44.asServiceRole.entities.PlatformSetting.update(rows[0].id, payload);
  else await base44.asServiceRole.entities.PlatformSetting.create(payload);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const timezone = await readSetting(base44, 'marketing_timezone', 'America/Los_Angeles');
    const paused = await readSetting(base44, 'marketing_automation_paused', false);
    const emergency = await readSetting(base44, 'marketing_emergency_stopped', false);
    const mode = await readSetting(base44, 'marketing_operating_mode', 'approval');
    const authorized = await readSetting(base44, 'marketing_autonomous_authorized', false);
    const scheduleRaw = await readSetting(base44, 'marketing_schedule', JSON.stringify(DEFAULT_SCHEDULE));

    if (emergency) return Response.json({ skipped: 'emergency_stop' });
    if (paused) return Response.json({ skipped: 'automation_paused' });

    let schedule = DEFAULT_SCHEDULE;
    try { schedule = { ...DEFAULT_SCHEDULE, ...JSON.parse(scheduleRaw) }; } catch (_error) { schedule = DEFAULT_SCHEDULE; }

    const now = new Date();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);

    const runsRaw = await readSetting(base44, 'marketing_step_runs', '{}');
    let runs = {};
    try { runs = JSON.parse(runsRaw); } catch (_error) { runs = {}; }

    const effectiveMode = mode === 'autonomous' && !authorized ? 'approval' : mode;
    const allowedStatuses = effectiveMode === 'autonomous'
      ? ['awaiting_approval', 'approved', 'scheduled']
      : effectiveMode === 'approval'
        ? ['approved', 'scheduled']
        : [];

    const executed = [];

    for (const step of STEP_ORDER) {
      const dueTime = schedule[step];
      if (!dueTime) continue;
      if (runs[step] === today) continue;
      if (localTime < dueTime) continue;

      runs[step] = today;
      try {
        if (step === 'review' || step === 'select') {
          const features = await base44.asServiceRole.entities.MarketingFeature.filter({ enabled: true });
          executed.push({ step, features: features.length });
        } else if (step === 'generate') {
          const res = await base44.functions.invoke('marketingGenerateCampaign', { date: today });
          executed.push({ step, result: res.data });
        } else if (step === 'validate') {
          const res = await base44.functions.invoke('marketingGenerateCampaign', { date: today, validate_only: true });
          executed.push({ step, result: res.data });
        } else if (step === 'metrics') {
          const res = await base44.functions.invoke('marketingCollectMetrics', { days: 3 });
          executed.push({ step, result: res.data });
        } else {
          if (!allowedStatuses.length) {
            executed.push({ step, skipped: 'manual_mode' });
            continue;
          }
          const publications = await base44.asServiceRole.entities.CampaignPublication.filter({ campaign_date: today, platform: step });
          const target = publications.find((item) => allowedStatuses.includes(item.status));
          if (!target) {
            executed.push({ step, skipped: 'nothing_approved' });
            continue;
          }
          const res = await base44.functions.invoke('marketingPublish', { publication_id: target.id });
          executed.push({ step, publication_id: target.id, result: res.data });
        }
      } catch (error) {
        executed.push({ step, error: error.message });
      }
    }

    await writeSetting(base44, 'marketing_step_runs', JSON.stringify(runs), 'Marketing daily step runs');

    return Response.json({ date: today, local_time: localTime, timezone, mode: effectiveMode, executed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});