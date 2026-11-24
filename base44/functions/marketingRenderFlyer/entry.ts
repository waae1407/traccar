import { createClientFromRequest } from 'npm:@base44/sdk@0.8.56';
import { Stagehand } from 'npm:@browserbasehq/stagehand@3.7.3';
import { z } from 'npm:zod@4';

/**
 * Backend flyer renderer.
 *
 * Opens the app's own deterministic render surface in a headless browser and
 * screenshots the approved California master at each platform's true pixel
 * size. No administrator, browser session or click is involved. Images are
 * validated (PNG signature + exact dimensions) and stored publicly, because
 * Instagram and Facebook fetch the file by URL.
 */

// The published app host. The render surface lives in this app, so the renderer
// always screenshots the deployed build.
const APP_URL = 'https://deft-urban-ride-flow.base44.app';

const CANVAS: Record<string, { width: number; height: number }> = {
  instagram: { width: 1080, height: 1350 },
  facebook_pages: { width: 1080, height: 1080 },
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function pngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** A painted photographic flyer is always well above this size; a blank or 404 page is not. */
const MIN_PNG_BYTES = 120000;

async function waitForReady(page: any) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const ready = await page.evaluate(
        () => Boolean(document.body && document.body.dataset && document.body.dataset.flyerReady === 'true'),
      );
      if (ready) return true;
    } catch (_error) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function capture(page: any, url: string, spec: { width: number; height: number }) {
  await page.setViewportSize({ width: spec.width, height: spec.height });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  const ready = await waitForReady(page);
  // Even without the ready flag, give fonts and the hero image a moment before
  // the paint check below decides.
  if (!ready) await new Promise((resolve) => setTimeout(resolve, 4000));

  const buffer = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: spec.width, height: spec.height },
  });
  const bytes = new Uint8Array(buffer);
  const size = pngDimensions(bytes);
  if (!size) throw new Error('Rendered output is not a valid PNG');
  if (size.width !== spec.width || size.height !== spec.height) {
    throw new Error(`Rendered ${size.width}x${size.height}, expected ${spec.width}x${spec.height}`);
  }
  if (bytes.length < MIN_PNG_BYTES) {
    throw new Error(`Rendered image is only ${bytes.length} bytes — the render surface did not paint`);
  }
  return bytes;
}

Deno.serve(async (req) => {
  let session: any = null;
  let stagehand: any = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const campaignId = body.campaign_id;
    if (!campaignId) return Response.json({ error: 'campaign_id is required' }, { status: 400 });

    const campaign = await base44.asServiceRole.entities.MarketingCampaign
      .get(campaignId)
      .catch((e: any) => (e.status === 404 ? null : Promise.reject(e)));
    if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 });

    const assets: Record<string, any> = { ...(campaign.assets || {}) };
    const requested: string[] = Array.isArray(body.platforms) && body.platforms.length
      ? body.platforms.filter((platform: string) => CANVAS[platform])
      : Object.keys(CANVAS);
    const pending = requested.filter((platform) => body.force === true || !assets[platform]?.url);
    if (!pending.length) {
      return Response.json({ skipped: true, reason: 'Flyers already rendered', assets });
    }

    session = await base44.asServiceRole.browser.getSession();
    const { baseURL, token, headers } = base44.asServiceRole.aiGateway.connection();
    stagehand = new Stagehand({
      env: 'LOCAL',
      localBrowserLaunchOptions: { cdpUrl: session.connectionUrl },
      model: {
        modelName: 'openai/gpt_6_luna',
        apiKey: token,
        baseURL,
        headers,
        openaiEndpointFormat: 'chat',
      },
      disablePino: true,
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    const results: any[] = [];
    for (const platform of pending) {
      const spec = CANVAS[platform];
      const url = `${APP_URL}/flyer-render?campaign=${encodeURIComponent(campaign.id)}&platform=${platform}`;
      let bytes: Uint8Array | null = null;
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          bytes = await capture(page, url, spec);
          lastError = null;
          break;
        } catch (error: any) {
          lastError = error.message;
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
      }

      if (!bytes) {
        results.push({ platform, ok: false, error: lastError });
        continue;
      }

      const file = new File([bytes], `${campaign.feature_key}-${platform}-${campaign.campaign_date}.png`, { type: 'image/png' });
      const { file_url } = await base44.asServiceRole.integrations.Core.UploadPublicFile({ file });
      assets[platform] = {
        url: file_url,
        width: spec.width,
        height: spec.height,
        bytes: bytes.length,
        rendered_at: new Date().toISOString(),
        renderer: 'backend_headless',
      };
      results.push({ platform, ok: true, url: file_url, width: spec.width, height: spec.height, bytes: bytes.length });
    }

    const rendered = results.filter((item) => item.ok).map((item) => item.platform);
    if (rendered.length) {
      await base44.asServiceRole.entities.MarketingCampaign.update(campaign.id, { assets });
      const publications = await base44.asServiceRole.entities.CampaignPublication.filter({ campaign_id: campaign.id });
      for (const publication of publications) {
        const asset = assets[publication.platform];
        if (asset && publication.status !== 'published') {
          await base44.asServiceRole.entities.CampaignPublication.update(publication.id, {
            image_url: asset.url,
            image_width: asset.width,
            image_height: asset.height,
          });
        }
      }
    }

    const failed = results.filter((item) => !item.ok);
    if (failed.length) {
      return Response.json(
        { ok: false, results, error: failed.map((item) => `${item.platform}: ${item.error}`).join('; ') },
        { status: 502 },
      );
    }
    return Response.json({ ok: true, results, assets });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  } finally {
    await stagehand?.close().catch(() => {});
    await session?.end().catch(() => {});
  }
});