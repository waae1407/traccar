import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const DAY = 86400000;

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

async function instagramMetrics(base44, mediaId) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection("instagram");
  const url = `https://graph.instagram.com/${mediaId}/insights?metric=reach,likes,comments,shares,saved&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Instagram insights unavailable");
  const values = {};
  (data.data || []).forEach((item) => {
    values[item.name] = item.values?.[0]?.value ?? null;
  });
  return {
    reach: values.reach ?? null,
    likes: values.likes ?? null,
    comments: values.comments ?? null,
    shares: values.shares ?? null,
    saves: values.saved ?? null,
    unavailable: ["impressions", "profile_visits", "website_clicks", "follower_growth", "dm_inquiries"],
    raw: data,
  };
}

async function facebookMetrics(base44, postId) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection("facebook_pages");
  const fields = "reactions.summary(total_count),comments.summary(total_count),shares";
  const res = await fetch(`https://graph.facebook.com/v25.0/${postId}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Facebook post metrics unavailable");

  let impressions = null;
  try {
    const insightRes = await fetch(`https://graph.facebook.com/v25.0/${postId}/insights?metric=post_media_view&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
    const insight = await insightRes.json();
    if (insightRes.ok) impressions = insight.data?.[0]?.values?.[0]?.value ?? null;
  } catch (_error) {
    impressions = null;
  }

  return {
    likes: data.reactions?.summary?.total_count ?? null,
    comments: data.comments?.summary?.total_count ?? null,
    shares: data.shares?.count ?? null,
    impressions,
    unavailable: ["reach", "saves", "profile_visits", "website_clicks", "follower_growth", "dm_inquiries"],
    raw: data,
  };
}

async function xMetrics(req, postId) {
  const appId = Deno.env.get("BASE44_APP_ID");
  const apiUrl = req.headers.get("Base44-Api-Url");
  const serviceAuth = req.headers.get("Base44-Service-Authorization");
  const res = await fetch(`${apiUrl}/api/apps/${appId}/connectors/x/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: serviceAuth },
    body: JSON.stringify({ method: "GET", path: `/2/tweets/${postId}`, query: { "tweet.fields": "public_metrics,non_public_metrics" } }),
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(() => ({}));
  const metrics = json?.data?.public_metrics || null;
  if (!metrics) throw new Error(json?.error || "X post metrics unavailable");
  const nonPublic = json?.data?.non_public_metrics || {};
  return {
    impressions: metrics.impression_count ?? null,
    likes: metrics.like_count ?? null,
    comments: metrics.reply_count ?? null,
    shares: metrics.retweet_count ?? null,
    saves: metrics.bookmark_count ?? null,
    reach: nonPublic.impression_count ?? null,
    unavailable: ["profile_visits", "website_clicks", "follower_growth", "dm_inquiries", "qualified_leads", "conversions"],
    raw: json,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body.days) || 3, 1), 30);
    const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

    const publications = await base44.asServiceRole.entities.CampaignPublication.filter({ status: 'published' }, { limit: 100 });
    const eligible = publications.filter((item) => item.external_post_id && item.campaign_date >= since);

    const existing = await base44.asServiceRole.entities.MarketingMetric.filter({}, { limit: 200 });
    const capturedToday = new Set(
      existing.filter((item) => item.captured_at && item.captured_at >= startOfToday()).map((item) => item.publication_id),
    );

    const results = [];
    for (const publication of eligible) {
      if (capturedToday.has(publication.id)) continue;
      const campaign = await base44.asServiceRole.entities.MarketingCampaign.get(publication.campaign_id).catch(() => null);
      let values;
      let error = null;
      try {
        if (publication.platform === 'instagram') values = await instagramMetrics(base44, publication.external_post_id);
        else if (publication.platform === 'facebook_pages') values = await facebookMetrics(base44, publication.external_post_id);
        else values = await xMetrics(req, publication.external_post_id);
      } catch (caught) {
        error = caught.message;
        values = { unavailable: ["all"], raw: { error: caught.message } };
      }

      const metric = await base44.asServiceRole.entities.MarketingMetric.create({
        campaign_id: publication.campaign_id,
        publication_id: publication.id,
        platform: publication.platform,
        captured_at: new Date().toISOString(),
        feature_key: campaign?.feature_key || null,
        angle_key: campaign?.angle_key || null,
        headline: campaign?.headline || null,
        audience: campaign?.audience || null,
        cta_keyword: campaign?.cta_keyword || null,
        published_at: publication.published_at || null,
        reach: values.reach ?? null,
        impressions: values.impressions ?? null,
        likes: values.likes ?? null,
        comments: values.comments ?? null,
        shares: values.shares ?? null,
        saves: values.saves ?? null,
        utm_campaign: publication.utm_campaign || null,
        source: error ? 'unavailable' : 'platform_api',
        unavailable_metrics: values.unavailable || [],
        raw: values.raw || {},
      });
      results.push({ platform: publication.platform, metric_id: metric.id, error });
    }

    return Response.json({ collected: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});