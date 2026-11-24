import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const DEFAULT_SCHEDULE = {
  review: '05:00',
  select: '05:15',
  generate: '05:30',
  validate: '05:45',
  render: '07:30',
  instagram: '08:00',
  render_late: '09:30',
  facebook: '10:00',
  retry_failed: '15:00',
  metrics: '20:00',
};

const STEP_ORDER = ['review', 'select', 'generate', 'validate', 'render', 'instagram', 'render_late', 'facebook', 'retry_failed', 'metrics'];

const PLATFORM_STEP: Record<string, string> = {
  instagram: 'instagram',
  facebook: 'facebook_pages',
  x: 'x',
};

const MAX_PUBLISH_ATTEMPTS = 3;
const RETRY_GAP_MS = 20 * 60 * 1000;

async function readSetting(base44: any, key: string, fallback: any) {
  const rows = await base44.asServiceRole.entities.PlatformSetting.filter({ key });
  const row = rows[0];
  if (!row) return fallback;
  if (row.value_boolean !== undefined && row.value_boolean !== null) return row.value_boolean;
  if (row.value_string !== undefined && row.value_string !== null) return row.value_string;
  return fallback;
}

async function writeSetting(base44: any, key: string, value: any, label: string) {
  const rows = await base44.asServiceRole.entities.PlatformSetting.filter({ key });
  const payload: Record<string, any> = { key, label, updated_by: 'scheduler', updated_at: new Date().toISOString() };
  if (typeof value === 'boolean') payload.value_boolean = value;
  else payload.value_string = String(value);
  if (rows[0]) await base44.asServiceRole.entities.PlatformSetting.update(rows[0].id, payload);
  else await base44.asServiceRole.entities.PlatformSetting.create(payload);
}

/** One notice per day, so a repeating failure cannot flood the admin inbox. */
async function notifyAdmin(base44: any, key: string, today: string, subject: string, message: string) {
  const settingKey = `marketing_notice_${key}`;
  if ((await readSetting(base44, settingKey, '')) === today) return false;
  const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }).catch(() => []);
  for (const admin of admins.slice(0, 3)) {
    await base44.asServiceRole.functions
      .invoke('sendBrandedEmail', { to: admin.email, subject, body: `<p>${message}</p>` })
      .catch(() => {});
  }
  await writeSetting(base44, settingKey, today, `Marketing notice ${key}`);
  return true;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e.status === 401 ? null : Promise.reject(e)));
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
    try {
      schedule = { ...DEFAULT_SCHEDULE, ...JSON.parse(scheduleRaw) };
    } catch (_error) {
      schedule = DEFAULT_SCHEDULE;
    }

    const now = new Date();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);

    const runsRaw = await readSetting(base44, 'marketing_step_runs', '{}');
    let runs: Record<string, string> = {};
    try {
      runs = JSON.parse(runsRaw);
    } catch (_error) {
      runs = {};
    }

    const effectiveMode = mode === 'autonomous' && !authorized ? 'approval' : mode;
    const allowedStatuses = effectiveMode === 'autonomous'
      ? ['awaiting_approval', 'approved', 'scheduled']
      : effectiveMode === 'approval'
        ? ['approved', 'scheduled']
        : [];

    // X stays disconnected: only platforms with a live, publishing-enabled
    // account take part in any step.
    const accounts = await base44.asServiceRole.entities.SocialAccount.list('-created_date', 20);
    const livePlatforms = accounts
      .filter((item: any) => item.connection_status === 'connected' && item.can_publish && item.publishing_enabled !== false)
      .map((item: any) => item.platform);

    const executed: any[] = [];

    for (const step of STEP_ORDER) {
      const dueTime = (schedule as Record<string, string>)[step];
      if (!dueTime) continue;
      if (runs[step] === today) continue;
      if (localTime < dueTime) continue;

      runs[step] = today;
      try {
        if (step === 'review' || step === 'select') {
          const features = await base44.asServiceRole.entities.MarketingFeature.filter({ enabled: true, verified: true });
          executed.push({ step, features: features.length });
        } else if (step === 'generate') {
          const res = await base44.functions.invoke('marketingGenerateCampaign', { date: today });
          executed.push({ step, result: res.data });
        } else if (step === 'validate') {
          const res = await base44.functions.invoke('marketingGenerateCampaign', { date: today, validate_only: true });
          executed.push({ step, result: res.data });
        } else if (step === 'render' || step === 'render_late') {
          const campaigns = await base44.asServiceRole.entities.MarketingCampaign.filter({ campaign_date: today });
          const campaign = campaigns[0];
          if (!campaign) {
            executed.push({ step, skipped: 'no_campaign' });
            continue;
          }
          if (step === 'render_late' && campaign.assets?.instagram?.url && campaign.assets?.facebook_pages?.url) {
            executed.push({ step, skipped: 'already_rendered' });
            continue;
          }
          const res = await base44.functions.invoke('marketingRenderFlyer', { campaign_id: campaign.id });
          executed.push({ step, result: res.data });
          if (res.data?.ok === false) {
            await notifyAdmin(
              base44,
              'render_failed',
              today,
              'uRide marketing: flyer rendering failed',
              `Backend flyer rendering failed for the ${today} campaign. ${res.data?.error || ''} Publishing is blocked for this campaign until the flyer renders.`,
            );
          }
        } else if (step === 'retry_failed') {
          const publications = await base44.asServiceRole.entities.CampaignPublication.filter({ campaign_date: today, status: 'failed' });
          const retried: any[] = [];
          for (const publication of publications) {
            if (!livePlatforms.includes(publication.platform)) continue;
            if ((publication.attempt_count || 0) >= MAX_PUBLISH_ATTEMPTS) continue;
            const lastAttempt = publication.last_attempt_at ? new Date(publication.last_attempt_at).getTime() : 0;
            if (Date.now() - lastAttempt < RETRY_GAP_MS) continue;
            const res = await base44.functions.invoke('marketingPublish', { publication_id: publication.id }).catch((error: any) => ({ data: { error: error.message } }));
            retried.push({ publication_id: publication.id, platform: publication.platform, result: res.data });
          }
          const exhausted = publications.filter((item: any) => (item.attempt_count || 0) >= MAX_PUBLISH_ATTEMPTS);
          if (exhausted.length) {
            await notifyAdmin(
              base44,
              'publish_failed',
              today,
              'uRide marketing: publishing failed',
              `${exhausted.length} publication(s) exhausted their retries today: ${exhausted.map((item: any) => `${item.platform} — ${item.last_error || 'unknown error'}`).join('; ')}.`,
            );
          }
          executed.push({ step, retried });
        } else if (step === 'metrics') {
          const res = await base44.functions.invoke('marketingCollectMetrics', { days: 3 });
          executed.push({ step, result: res.data });
        } else {
          const platform = PLATFORM_STEP[step];
          if (!livePlatforms.includes(platform)) {
            executed.push({ step, skipped: 'platform_disconnected' });
            continue;
          }
          if (!allowedStatuses.length) {
            executed.push({ step, skipped: 'manual_mode' });
            continue;
          }
          const publications = await base44.asServiceRole.entities.CampaignPublication.filter({ campaign_date: today, platform });
          const target = publications.find((item: any) => allowedStatuses.includes(item.status));
          if (!target) {
            executed.push({ step, skipped: 'nothing_approved' });
            continue;
          }
          const res = await base44.functions.invoke('marketingPublish', { publication_id: target.id });
          executed.push({ step, publication_id: target.id, result: res.data });
        }
      } catch (error: any) {
        executed.push({ step, error: error.message });
      }
    }

    await writeSetting(base44, 'marketing_step_runs', JSON.stringify(runs), 'Marketing daily step runs');

    return Response.json({ date: today, local_time: localTime, timezone, mode: effectiveMode, live_platforms: livePlatforms, executed });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});