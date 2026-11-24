import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

function toBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function publishInstagram(base44, caption, imageUrl) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection("instagram");
  const meRes = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
  const me = await meRes.json();
  if (!meRes.ok || !me.id) throw new Error(me.error?.message || "Instagram account lookup failed");

  const createRes = await fetch(`https://graph.instagram.com/v21.0/${me.id}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: accessToken }),
    signal: AbortSignal.timeout(60000),
  });
  const container = await createRes.json();
  if (!createRes.ok || !container.id) throw new Error(container.error?.message || "Instagram media container failed");

  const publishRes = await fetch(`https://graph.instagram.com/v21.0/${me.id}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: container.id, access_token: accessToken }),
    signal: AbortSignal.timeout(60000),
  });
  const published = await publishRes.json();
  if (!publishRes.ok || !published.id) throw new Error(published.error?.message || "Instagram publish failed");

  let permalink = null;
  try {
    const linkRes = await fetch(`https://graph.instagram.com/${published.id}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
    const link = await linkRes.json();
    permalink = link.permalink || null;
  } catch (_error) {
    permalink = null;
  }

  return { id: published.id, url: permalink, account: me.username ? `@${me.username}` : null, accountId: me.id };
}

async function publishFacebook(base44, caption, imageUrl, preferredPageId) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection("facebook_pages");
  const accountsRes = await fetch(`https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(20000) });
  const accounts = await accountsRes.json();
  if (!accountsRes.ok) throw new Error(accounts.error?.message || "Facebook Page list failed");
  const pages = accounts.data || [];
  const page = pages.find((item) => item.id === preferredPageId) || pages[0];
  if (!page) throw new Error("No Facebook Page is available for this connection");
  const pageToken = page.access_token || accessToken;

  const res = await fetch(`https://graph.facebook.com/v25.0/${page.id}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ url: imageUrl, message: caption, published: "true", access_token: pageToken }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Facebook Page publish failed");
  const postId = data.post_id || data.id;
  return { id: postId, url: postId ? `https://www.facebook.com/${postId}` : null, account: page.name, accountId: page.id };
}

async function publishX(req, caption, imageUrl) {
  const appId = Deno.env.get("BASE44_APP_ID");
  const apiUrl = req.headers.get("Base44-Api-Url");
  const serviceAuth = req.headers.get("Base44-Service-Authorization");
  if (!apiUrl || !serviceAuth) throw new Error("X connector proxy is unavailable");

  const call = async (path, payload) => {
    const res = await fetch(`${apiUrl}/api/apps/${appId}/connectors/x/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: serviceAuth },
      body: JSON.stringify({ method: "POST", path, body: payload }),
      signal: AbortSignal.timeout(90000),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };

  const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!imageRes.ok) throw new Error("Flyer image could not be read for X upload");
  const bytes = new Uint8Array(await imageRes.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Flyer image exceeds the X 5MB limit");

  const media = await call("/2/media/upload", { media: toBase64(bytes), media_category: "tweet_image", media_type: "image/png" });
  const mediaId = media.json?.data?.id || media.json?.data?.media_id_string;
  if (!mediaId) throw new Error(media.json?.error || "X media upload failed");

  const tweet = await call("/2/tweets", { text: caption, media: { media_ids: [String(mediaId)] } });
  const id = tweet.json?.data?.id;
  if (!id) throw new Error(tweet.json?.error || `X rejected the post (status ${tweet.status})`);

  const meRes = await fetch(`${apiUrl}/api/apps/${appId}/connectors/x/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: serviceAuth },
    body: JSON.stringify({ method: "GET", path: "/2/users/me" }),
    signal: AbortSignal.timeout(30000),
  });
  const me = await meRes.json().catch(() => ({}));
  return { id, url: `https://x.com/i/web/status/${id}`, account: me?.data?.username ? `@${me.data.username}` : null, accountId: me?.data?.id || null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const publicationId = body.publication_id;
    if (!publicationId) return Response.json({ error: 'publication_id is required' }, { status: 400 });

    const publication = await base44.asServiceRole.entities.CampaignPublication.get(publicationId).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!publication) return Response.json({ error: 'Publication not found' }, { status: 404 });

    if (publication.status === 'published' || publication.external_post_id) {
      return Response.json({ already_published: true, status: 'published', post_url: publication.post_url, external_post_id: publication.external_post_id });
    }
    if (publication.status === 'publishing') {
      return Response.json({ in_progress: true, status: 'publishing' }, { status: 409 });
    }
    if (publication.status === 'cancelled') {
      return Response.json({ error: 'Publication was cancelled' }, { status: 409 });
    }

    const campaign = await base44.asServiceRole.entities.MarketingCampaign.get(publication.campaign_id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 });

    const report = publication.quality_report || campaign.quality_report || {};
    if ((report.critical || []).length) {
      await base44.asServiceRole.entities.CampaignPublication.update(publication.id, { status: 'quality_check_failed', last_error: (report.critical || []).join('; ') });
      return Response.json({ error: 'Quality validation failed', critical: report.critical }, { status: 422 });
    }

    const asset = (campaign.assets || {})[publication.platform] || null;
    const imageUrl = publication.image_url || (asset && asset.url) || null;
    if (!imageUrl) {
      return Response.json({ error: 'Flyer for this platform has not been generated yet' }, { status: 409 });
    }

    const accounts = await base44.asServiceRole.entities.SocialAccount.filter({ platform: publication.platform });
    const account = accounts[0];
    if (!account || account.connection_status !== 'connected' || !account.can_publish) {
      return Response.json({ error: `${publication.platform} is not connected for publishing` }, { status: 409 });
    }
    if (account.publishing_enabled === false) {
      return Response.json({ error: `${publication.platform} publishing is switched off` }, { status: 409 });
    }

    await base44.asServiceRole.entities.CampaignPublication.update(publication.id, {
      status: 'publishing',
      last_attempt_at: new Date().toISOString(),
      attempt_count: (publication.attempt_count || 0) + 1,
      image_url: imageUrl,
    });

    let result;
    try {
      if (publication.platform === 'instagram') {
        result = await publishInstagram(base44, publication.caption, imageUrl);
      } else if (publication.platform === 'facebook_pages') {
        result = await publishFacebook(base44, publication.caption, imageUrl, account.account_id);
      } else {
        result = await publishX(req, publication.caption, imageUrl);
      }
    } catch (error) {
      await base44.asServiceRole.entities.CampaignPublication.update(publication.id, {
        status: 'failed',
        last_error: error.message,
      });
      await base44.asServiceRole.entities.SocialAccount.update(account.id, { last_error: error.message, connection_status: 'error' });
      return Response.json({ error: error.message, status: 'failed' }, { status: 502 });
    }

    const updated = await base44.asServiceRole.entities.CampaignPublication.update(publication.id, {
      status: 'published',
      published_at: new Date().toISOString(),
      external_post_id: result.id,
      post_url: result.url || null,
      last_error: null,
    });

    await base44.asServiceRole.entities.SocialAccount.update(account.id, {
      connection_status: 'connected',
      last_published_at: new Date().toISOString(),
      last_error: null,
      account_name: result.account || account.account_name,
      account_id: result.accountId || account.account_id,
    });

    const siblings = await base44.asServiceRole.entities.CampaignPublication.filter({ campaign_id: campaign.id });
    if (siblings.every((item) => item.status === 'published')) {
      await base44.asServiceRole.entities.MarketingCampaign.update(campaign.id, { publish_status: 'published' });
    }

    return Response.json({ ok: true, status: 'published', post_url: updated.post_url, external_post_id: updated.external_post_id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});