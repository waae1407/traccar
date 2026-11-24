import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', character_limit: 2200, image_spec: { width: 1080, height: 1350, format: 'PNG' } },
  { key: 'facebook_pages', label: 'Facebook Page', character_limit: 63206, image_spec: { width: 1080, height: 1080, format: 'PNG' } },
  { key: 'x', label: 'X', character_limit: 280, image_spec: { width: 1200, height: 628, format: 'PNG' } },
];

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

/** X stays excluded from every marketing operation until it is authorized again. */
const EXCLUDED_PLATFORMS = ['x'];

const ANALYTICS_SCOPES = {
  instagram: {
    granted: ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_messages'],
    missing: ['instagram_business_manage_insights'],
  },
  facebook_pages: {
    granted: ['business_management', 'pages_manage_posts', 'pages_show_list'],
    missing: ['read_insights', 'pages_read_engagement'],
  },
};

const SETTING_KEYS = {
  mode: 'marketing_operating_mode',
  paused: 'marketing_automation_paused',
  emergency: 'marketing_emergency_stopped',
  authorized: 'marketing_autonomous_authorized',
  schedule: 'marketing_schedule',
  timezone: 'marketing_timezone',
};

async function readSetting(base44, key, fallback) {
  const rows = await base44.asServiceRole.entities.PlatformSetting.filter({ key });
  const row = rows[0];
  if (!row) return fallback;
  if (row.value_boolean !== undefined && row.value_boolean !== null) return row.value_boolean;
  if (row.value_string !== undefined && row.value_string !== null) return row.value_string;
  if (row.value_number !== undefined && row.value_number !== null) return row.value_number;
  return fallback;
}

async function writeSetting(base44, key, value, label, user) {
  const rows = await base44.asServiceRole.entities.PlatformSetting.filter({ key });
  const payload = {
    key,
    label,
    updated_by: user?.email || 'system',
    updated_at: new Date().toISOString(),
  };
  if (typeof value === 'boolean') payload.value_boolean = value;
  else if (typeof value === 'number') payload.value_number = value;
  else payload.value_string = String(value);

  if (rows[0]) await base44.asServiceRole.entities.PlatformSetting.update(rows[0].id, payload);
  else await base44.asServiceRole.entities.PlatformSetting.create(payload);
}

async function probeInstagram(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection("instagram");
  const res = await fetch(`https://graph.instagram.com/me?fields=id,username,account_type,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error(data.error?.message || 'Instagram account could not be read');
  return {
    account_id: data.id,
    account_name: data.username ? `@${data.username}` : 'Instagram account',
    account_handle: data.username || null,
    profile_image_url: data.profile_picture_url || null,
  };
}

async function listFacebookPages(accessToken) {
  const base = 'https://graph.facebook.com/v25.0';
  const pages = new Map();
  const add = (page) => {
    if (page?.id && page.access_token && !pages.has(page.id)) pages.set(page.id, page);
  };

  const accountsRes = await fetch(`${base}/me/accounts?fields=id,name,access_token,picture&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
  const accounts = await accountsRes.json();
  if (!accountsRes.ok) throw new Error(accounts.error?.message || 'Facebook Pages could not be read');
  (accounts.data || []).forEach(add);

  // Business Manager pages never appear in /me/accounts — they need both edges.
  try {
    const bizRes = await fetch(`${base}/me/businesses?fields=id,name&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
    const businesses = await bizRes.json();
    for (const business of businesses.data || []) {
      for (const edge of ['client_pages', 'owned_pages']) {
        const edgeRes = await fetch(`${base}/${business.id}/${edge}?fields=id,name,access_token,picture&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
        const edgeData = await edgeRes.json();
        (edgeData.data || []).forEach((page) => add({ ...page, business_id: business.id }));
      }
    }
  } catch (_error) {
    // business_management is optional; directly managed pages still work
  }

  return [...pages.values()];
}

async function probeFacebook(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection("facebook_pages");
  const pages = await listFacebookPages(accessToken);
  const page = pages[0];
  if (!page) throw new Error('No Facebook Page is available for this connection. Select a Page when reconnecting.');
  return {
    account_id: page.id,
    account_name: page.name,
    account_handle: page.name,
    profile_image_url: page.picture?.data?.url || null,
  };
}

// The X proxy answers { success, status_code, data, credits_charged }, so the
// provider body sits one level deeper than a direct X response.
function unwrapXProxy(json) {
  if (!json || typeof json !== 'object') return {};
  const wrapped = json.success !== undefined || json.status_code !== undefined;
  return wrapped ? (json.data || {}) : json;
}

async function probeX(req) {
  const appId = Deno.env.get("BASE44_APP_ID");
  const apiUrl = req.headers.get("Base44-Api-Url");
  const serviceAuth = req.headers.get("Base44-Service-Authorization");
  if (!apiUrl || !serviceAuth) throw new Error('X connector proxy is unavailable');
  const res = await fetch(`${apiUrl}/api/apps/${appId}/connectors/x/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: serviceAuth },
    body: JSON.stringify({ method: "GET", path: "/2/users/me", query: { "user.fields": "profile_image_url" } }),
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(() => ({}));
  const body = unwrapXProxy(json);
  const account = body.data || body;
  if (!account?.id) {
    const reason = body.detail || body.title || body.errors?.[0]?.detail || json?.error || `status ${res.status}`;
    throw new Error(`X account could not be read: ${reason}`);
  }
  return {
    account_id: account.id,
    account_name: account.name || `@${account.username}`,
    account_handle: account.username ? `@${account.username}` : null,
    profile_image_url: account.profile_image_url || null,
  };
}

async function syncAccount(base44, req, platform) {
  const spec = PLATFORMS.find((item) => item.key === platform);
  const rows = await base44.asServiceRole.entities.SocialAccount.filter({ platform });
  const existing = rows[0];
  const base = {
    platform,
    platform_label: spec.label,
    character_limit: spec.character_limit,
    image_spec: spec.image_spec,
    last_synced_at: new Date().toISOString(),
  };

  try {
    let identity;
    if (platform === 'instagram') identity = await probeInstagram(base44);
    else if (platform === 'facebook_pages') identity = await probeFacebook(base44);
    else identity = await probeX(req);

    const payload = {
      ...base,
      ...identity,
      connection_status: 'connected',
      authorization_status: 'authorized',
      can_publish: true,
      can_read_analytics: false,
      last_error: null,
      granted_scopes: ANALYTICS_SCOPES[platform]?.granted || [],
      missing_scopes: ANALYTICS_SCOPES[platform]?.missing || [],
      notes: platform === 'instagram'
        ? 'Instagram insights need instagram_business_manage_insights; metrics the platform does not return are left blank.'
        : platform === 'facebook_pages'
          ? 'Facebook post insights need read_insights and pages_read_engagement; metrics the platform does not return are left blank.'
          : null,
    };
    return existing
      ? await base44.asServiceRole.entities.SocialAccount.update(existing.id, payload)
      : await base44.asServiceRole.entities.SocialAccount.create(payload);
  } catch (error) {
    const payload = {
      ...base,
      connection_status: 'not_connected',
      authorization_status: 'not_authorized',
      can_publish: false,
      can_read_analytics: false,
      last_error: error.message,
    };
    return existing
      ? await base44.asServiceRole.entities.SocialAccount.update(existing.id, payload)
      : await base44.asServiceRole.entities.SocialAccount.create(payload);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'get_state';
    const timezone = await readSetting(base44, SETTING_KEYS.timezone, 'America/Los_Angeles');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

    if (action === 'get_state') {
      const [mode, paused, emergency, authorized, scheduleRaw] = await Promise.all([
        readSetting(base44, SETTING_KEYS.mode, 'approval'),
        readSetting(base44, SETTING_KEYS.paused, false),
        readSetting(base44, SETTING_KEYS.emergency, false),
        readSetting(base44, SETTING_KEYS.authorized, false),
        readSetting(base44, SETTING_KEYS.schedule, JSON.stringify(DEFAULT_SCHEDULE)),
      ]);

      const [accounts, campaigns, publications, metrics, features] = await Promise.all([
        base44.asServiceRole.entities.SocialAccount.list('-created_date', 10),
        base44.asServiceRole.entities.MarketingCampaign.list('-campaign_date', 10),
        base44.asServiceRole.entities.CampaignPublication.list('-created_date', 60),
        base44.asServiceRole.entities.MarketingMetric.list('-captured_at', 40),
        base44.asServiceRole.entities.MarketingFeature.list('-use_count', 60),
      ]);

      let schedule = DEFAULT_SCHEDULE;
      try { schedule = { ...DEFAULT_SCHEDULE, ...JSON.parse(scheduleRaw) }; } catch (_error) { schedule = DEFAULT_SCHEDULE; }

      const accountByPlatform = PLATFORMS.map((spec) => accounts.find((item) => item.platform === spec.key) || {
        platform: spec.key,
        platform_label: spec.label,
        connection_status: 'not_connected',
        authorization_status: 'not_authorized',
        can_publish: false,
        can_read_analytics: false,
        character_limit: spec.character_limit,
        image_spec: spec.image_spec,
      });

      const todaysPublications = publications.filter((item) => item.campaign_date === today);
      const nextScheduled = publications
        .filter((item) => item.scheduled_for && item.status === 'scheduled')
        .sort((a, b) => (a.scheduled_for > b.scheduled_for ? 1 : -1))[0] || null;

      return Response.json({
        mode,
        paused,
        emergency_stopped: emergency,
        autonomous_authorized: authorized,
        timezone,
        schedule,
        accounts: accountByPlatform,
        today,
        today_campaign: campaigns.find((item) => item.campaign_date === today) || null,
        tomorrow_campaign: campaigns.find((item) => item.campaign_date > today) || null,
        publications: todaysPublications,
        pending_approvals: publications.filter((item) => item.status === 'awaiting_approval'),
        failed_publications: publications.filter((item) => item.status === 'failed'),
        next_scheduled: nextScheduled,
        recent_metrics: metrics,
        opportunities: features.filter((item) => item.verified === true && !item.use_count).slice(0, 8),
        pending_discoveries: features.filter((item) => item.verified !== true && item.source === 'discovered').slice(0, 6),
        feature_counts: { total: features.length, unused: features.filter((item) => !item.use_count).length },
      });
    }

    if (action === 'review_feature') {
      const featureId = body.feature_id;
      const decision = body.decision;
      if (!featureId || !['verify', 'discard'].includes(decision)) {
        return Response.json({ error: 'feature_id and decision (verify|discard) are required' }, { status: 400 });
      }
      if (decision === 'discard') {
        await base44.asServiceRole.entities.MarketingFeature.delete(featureId);
        return Response.json({ ok: true, deleted: featureId });
      }
      const existing = await base44.asServiceRole.entities.MarketingFeature.get(featureId).catch(() => null);
      if (!existing) return Response.json({ error: 'Feature not found' }, { status: 404 });
      const updated = await base44.asServiceRole.entities.MarketingFeature.update(featureId, {
        verified: true,
        enabled: true,
        notes: `${existing.notes || ''} Verified by ${user.email || 'admin'} on ${new Date().toISOString().slice(0, 10)}.`.trim(),
      });
      return Response.json({ ok: true, feature: updated });
    }

    if (action === 'set_mode') {
      const mode = body.mode;
      if (!['manual', 'approval', 'autonomous'].includes(mode)) return Response.json({ error: 'Unknown mode' }, { status: 400 });
      if (mode === 'autonomous') {
        const authorized = await readSetting(base44, SETTING_KEYS.authorized, false);
        if (!authorized) return Response.json({ error: 'Autonomous publishing is not authorized yet. Run the authorization step first.' }, { status: 409 });
        const accounts = await base44.asServiceRole.entities.SocialAccount.list('-created_date', 10);
        if (!accounts.some((item) => item.connection_status === 'connected' && item.can_publish)) {
          return Response.json({ error: 'At least one social account must be connected before autonomous mode.' }, { status: 409 });
        }
      }
      await writeSetting(base44, SETTING_KEYS.mode, mode, 'Marketing operating mode', user);
      return Response.json({ ok: true, mode });
    }

    if (action === 'authorize_autonomous') {
      if (body.confirm !== 'AUTHORIZE AUTONOMOUS PUBLISHING') {
        return Response.json({ error: 'Type AUTHORIZE AUTONOMOUS PUBLISHING to confirm' }, { status: 400 });
      }
      await writeSetting(base44, SETTING_KEYS.authorized, true, 'Autonomous publishing authorized', user);
      return Response.json({ ok: true, autonomous_authorized: true });
    }

    if (action === 'pause' || action === 'resume') {
      await writeSetting(base44, SETTING_KEYS.paused, action === 'pause', 'Marketing automation paused', user);
      return Response.json({ ok: true, paused: action === 'pause' });
    }

    if (action === 'emergency_stop') {
      await writeSetting(base44, SETTING_KEYS.emergency, true, 'Marketing emergency stop', user);
      await writeSetting(base44, SETTING_KEYS.paused, true, 'Marketing automation paused', user);
      const scheduled = await base44.asServiceRole.entities.CampaignPublication.filter({ status: 'scheduled' });
      for (const item of scheduled) {
        await base44.asServiceRole.entities.CampaignPublication.update(item.id, { status: 'cancelled', rejected_reason: 'Emergency stop' });
      }
      return Response.json({ ok: true, emergency_stopped: true, cancelled: scheduled.length });
    }

    if (action === 'clear_emergency') {
      await writeSetting(base44, SETTING_KEYS.emergency, false, 'Marketing emergency stop', user);
      return Response.json({ ok: true, emergency_stopped: false });
    }

    if (action === 'save_schedule') {
      const schedule = { ...DEFAULT_SCHEDULE, ...(body.schedule || {}) };
      await writeSetting(base44, SETTING_KEYS.schedule, JSON.stringify(schedule), 'Marketing daily schedule', user);
      if (body.timezone) await writeSetting(base44, SETTING_KEYS.timezone, body.timezone, 'Marketing timezone', user);
      return Response.json({ ok: true, schedule, timezone: body.timezone || timezone });
    }

    if (action === 'sync_accounts' || action === 'test_connection') {
      const requested = action === 'test_connection' ? [body.platform] : PLATFORMS.map((item) => item.key);
      const targets = requested.filter((platform) => platform && (!EXCLUDED_PLATFORMS.includes(platform) || body.include_excluded === true));
      if (!targets.length) {
        return Response.json({ ok: true, results: [], note: 'X is excluded from the marketing engine until it is authorized again.' });
      }
      const results = [];
      for (const platform of targets) {
        if (!platform) continue;
        const record = await syncAccount(base44, req, platform);
        results.push({ platform, status: record.connection_status, account: record.account_name, error: record.last_error });
      }
      return Response.json({ ok: true, results });
    }

    const ids = Array.isArray(body.publication_ids) ? body.publication_ids : [];
    if (['approve', 'reject', 'schedule', 'cancel', 'retry'].includes(action)) {
      if (!ids.length) return Response.json({ error: 'publication_ids is required' }, { status: 400 });
      const results = [];
      for (const id of ids) {
        const publication = await base44.asServiceRole.entities.CampaignPublication.get(id).catch(() => null);
        if (!publication) { results.push({ id, error: 'not found' }); continue; }
        if (publication.status === 'published') { results.push({ id, error: 'already published' }); continue; }

        let payload;
        if (action === 'approve') payload = { status: 'approved', approved_by: user.email || 'admin', approved_at: new Date().toISOString(), rejected_reason: null };
        else if (action === 'reject') payload = { status: 'cancelled', rejected_reason: body.reason || 'Rejected by admin' };
        else if (action === 'schedule') payload = { status: 'scheduled', scheduled_for: body.scheduled_for || new Date().toISOString() };
        else if (action === 'cancel') payload = { status: 'cancelled', scheduled_for: null };
        else payload = { status: 'approved', last_error: null };

        const updated = await base44.asServiceRole.entities.CampaignPublication.update(id, payload);
        results.push({ id, status: updated.status });
      }
      return Response.json({ ok: true, results });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});