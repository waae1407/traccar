import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const DAY = 86400000;

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function pick(insights: any, name: string) {
  const item = (insights?.data || []).find((entry: any) => entry.name === name);
  const value = item?.values?.[0]?.value ?? item?.total_value?.value ?? null;
  return typeof value === 'number' ? value : null;
}

async function instagramMetrics(base44: any, mediaId: string, accountId: string) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('instagram');

  const mediaRes = await fetch(`https://graph.instagram.com/${mediaId}?fields=like_count,comments_count&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
  const media = await mediaRes.json();
  if (!mediaRes.ok) throw new Error(media.error?.message || 'Instagram post metrics unavailable');

  // Everything below needs instagram_business_manage_insights.
  let reach: number | null = null;
  let views: number | null = null;
  let saves: number | null = null;
  let shares: number | null = null;
  let profileVisits: number | null = null;
  let followers: number | null = null;
  let insights: any = null;
  let permissionError: string | null = null;

  try {
    const insightRes = await fetch(`https://graph.instagram.com/${mediaId}/insights?metric=reach,saved,shares,views,total_interactions&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
    const data = await insightRes.json();
    if (insightRes.ok) {
      insights = data;
      reach = pick(data, 'reach');
      views = pick(data, 'views');
      saves = pick(data, 'saved');
      shares = pick(data, 'shares');
    } else {
      permissionError = data.error?.message || 'Instagram insights unavailable';
    }
  } catch (error: any) {
    permissionError = error.message;
  }

  try {
    const accountRes = await fetch(`https://graph.instagram.com/${accountId}/insights?metric=profile_views&period=day&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
    const accountData = await accountRes.json();
    if (accountRes.ok) profileVisits = pick(accountData, 'profile_views');
  } catch (_error) {
    profileVisits = null;
  }

  try {
    const meRes = await fetch(`https://graph.instagram.com/me?fields=followers_count&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
    const me = await meRes.json();
    if (meRes.ok && typeof me.followers_count === 'number') followers = me.followers_count;
  } catch (_error) {
    followers = null;
  }

  return {
    reach,
    impressions: views,
    views,
    likes: media.like_count ?? null,
    comments: media.comments_count ?? null,
    shares,
    saves,
    profile_visits: profileVisits,
    followers_count: followers,
    unavailable: [
      'website_clicks',
      'dm_inquiries',
      'qualified_leads',
      'conversions',
      ...(reach === null ? ['reach'] : []),
      ...(views === null ? ['impressions', 'views'] : []),
      ...(saves === null ? ['saves'] : []),
      ...(shares === null ? ['shares'] : []),
      ...(profileVisits === null ? ['profile_visits'] : []),
      ...(followers === null ? ['follower_growth'] : []),
    ],
    permission_error: permissionError,
    raw: { media, insights },
  };
}

async function facebookMetrics(base44: any, postId: string, pageId: string) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('facebook_pages');
  const fields = 'reactions.summary(total_count),comments.summary(total_count),shares';
  const res = await fetch(`https://graph.facebook.com/v25.0/${postId}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Facebook post metrics unavailable');

  let impressions: number | null = null;
  let clicks: number | null = null;
  let permissionError: string | null = null;
  try {
    const insightRes = await fetch(`https://graph.facebook.com/v25.0/${postId}/insights?metric=post_media_view,post_clicks&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
    const insight = await insightRes.json();
    if (insightRes.ok) {
      impressions = pick(insight, 'post_media_view');
      clicks = pick(insight, 'post_clicks');
    } else {
      permissionError = insight.error?.message || 'Facebook post insights unavailable';
    }
  } catch (error: any) {
    permissionError = error.message;
  }

  let followers: number | null = null;
  if (pageId) {
    try {
      const pageRes = await fetch(`https://graph.facebook.com/v25.0/${pageId}?fields=followers_count,fan_count&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
      const page = await pageRes.json();
      if (pageRes.ok) followers = page.followers_count ?? page.fan_count ?? null;
    } catch (_error) {
      followers = null;
    }
  }

  return {
    impressions,
    likes: data.reactions?.summary?.total_count ?? null,
    comments: data.comments?.summary?.total_count ?? null,
    shares: data.shares?.count ?? null,
    website_clicks: clicks,
    followers_count: followers,
    unavailable: [
      'reach',
      'saves',
      'profile_visits',
      'dm_inquiries',
      'qualified_leads',
      'conversions',
      ...(impressions === null ? ['impressions'] : []),
      ...(clicks === null ? ['website_clicks'] : []),
      ...(followers === null ? ['follower_growth'] : []),
    ],
    permission_error: permissionError,
    raw: data,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body.days) || 3, 1), 30);
    const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

    const publications = await base44.asServiceRole.entities.CampaignPublication.filter({ status: 'published' }, { limit: 100 });
    const eligible = publications.filter((item: any) => item.external_post_id && item.campaign_date >= since);

    const existing = await base44.asServiceRole.entities.MarketingMetric.filter({}, { limit: 200 });
    const capturedToday = new Set(
      existing.filter((item: any) => item.captured_at && item.captured_at >= startOfToday()).map((item: any) => item.publication_id),
    );
    const previousFollowers = {};
    existing
      .slice()
      .sort((a: any, b: any) => String(b.captured_at || '').localeCompare(String(a.captured_at || '')))
      .forEach((item: any) => {
        const platform = item.platform;
        const count = item.raw?.followers_count;
        if (previousFollowers[platform] === undefined && typeof count === 'number') previousFollowers[platform] = count;
      });

    const accounts = await base44.asServiceRole.entities.SocialAccount.list('-created_date', 20);
    const accountFor = (platform: string) => accounts.find((item: any) => item.platform === platform);

    const results: any[] = [];
    for (const publication of eligible) {
      if (capturedToday.has(publication.id)) continue;
      const campaign = await base44.asServiceRole.entities.MarketingCampaign.get(publication.campaign_id).catch(() => null);
      const account = accountFor(publication.platform);
      let values: any;
      let error: string | null = null;
      try {
        if (publication.platform === 'instagram') values = await instagramMetrics(base44, publication.external_post_id, account?.account_id || '');
        else if (publication.platform === 'facebook_pages') values = await facebookMetrics(base44, publication.external_post_id, account?.account_id || '');
        else throw new Error('X is not an approved publishing destination');
      } catch (caught: any) {
        error = caught.message;
        values = { unavailable: ['all'], raw: { error: caught.message } };
      }

      const followers = values.followers_count ?? null;
      const baseline = previousFollowers[publication.platform];
      const growth = typeof followers === 'number' && typeof baseline === 'number' ? followers - baseline : null;

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
        profile_visits: values.profile_visits ?? null,
        website_clicks: values.website_clicks ?? null,
        follower_growth: growth,
        utm_campaign: publication.utm_campaign || null,
        source: error ? 'unavailable' : 'platform_api',
        unavailable_metrics: values.unavailable || [],
        raw: { ...(values.raw || {}), followers_count: followers, permission_error: values.permission_error || null },
      });

      if (account && values.permission_error) {
        await base44.asServiceRole.entities.SocialAccount.update(account.id, { last_error: values.permission_error }).catch(() => {});
      }

      results.push({ platform: publication.platform, metric_id: metric.id, error, permission_error: values.permission_error || null });
    }

    return Response.json({ collected: results.length, results });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});