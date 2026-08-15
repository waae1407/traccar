import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Public endpoint: returns a static HTML page with the host's branding as
 * Open Graph / Twitter Card meta tags so that link previews in messaging apps
 * (RCS, iMessage, WhatsApp, Slack, etc.) show the host's logo and business name
 * instead of the platform default. Crawlers do not execute JavaScript, so the
 * tags must be present in the server response.
 *
 * Query params:
 *   slug   — storefront slug (business_slug on HostBrandSettings)
 *   domain — custom domain (normalized_domain on HostCustomDomain)
 *
 * The page also redirects human visitors to the live storefront via
 * <meta http-equiv="refresh"> and a JS fallback.
 */
function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let slug = url.searchParams.get('slug');
    let domain = url.searchParams.get('domain') || '';

    // Also accept params via POST body (used by test_backend_function)
    if (!slug && !domain) {
      const body = await req.json().catch(() => ({}));
      slug = body.slug || '';
      domain = body.domain || '';
    }

    const base44 = createClientFromRequest(req);

    let brand = null;
    let storefrontPath = '/';

    // Resolve by custom domain first, then by slug
    if (domain) {
      const normalized = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^\/+/, '').split('/')[0].split(':')[0].replace(/\.$/, '');
      const domains = await base44.asServiceRole.entities.HostCustomDomain.filter({ normalized_domain: normalized, active: true, verification_status: 'verified' }, '-updated_date', 1);
      const record = domains[0];
      if (record?.business_slug) {
        storefrontPath = `/host/${record.business_slug}`;
        const brands = await base44.asServiceRole.entities.HostBrandSettings.filter({ business_slug: record.business_slug }, '-updated_date', 1);
        brand = brands[0];
      }
    }

    if (!brand && slug) {
      storefrontPath = `/host/${slug}`;
      const brands = await base44.asServiceRole.entities.HostBrandSettings.filter({ business_slug: slug }, '-updated_date', 1);
      brand = brands[0];
    }

    const logoUrl = brand?.logo_url || '';
    const displayName = brand?.business_display_name || 'uRide Store';
    const description = brand?.hero_subtitle || brand?.about_text || `Book your next ride with ${displayName}`;
    const brandColor = brand?.brand_color || '#e91e8c';
    const secondaryColor = brand?.secondary_color || '#7c3aed';

    // Build the redirect URL — use the request origin so it works on custom domains too
    const redirectUrl = `${url.origin}${storefrontPath}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(displayName)}</title>
  <meta name="description" content="${escapeAttr(description)}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeAttr(displayName)}" />
  <meta property="og:description" content="${escapeAttr(description)}" />
  <meta property="og:url" content="${escapeAttr(redirectUrl)}" />
  ${logoUrl ? `<meta property="og:image" content="${escapeAttr(logoUrl)}" />` : ''}
  <meta property="og:site_name" content="${escapeAttr(displayName)}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(displayName)}" />
  <meta name="twitter:description" content="${escapeAttr(description)}" />
  ${logoUrl ? `<meta name="twitter:image" content="${escapeAttr(logoUrl)}" />` : ''}

  <!-- Favicon -->
  ${logoUrl ? `<link rel="icon" type="image/png" href="${escapeAttr(logoUrl)}" />` : ''}

  <!-- Redirect human visitors to the live storefront -->
  <meta http-equiv="refresh" content="0; url=${escapeAttr(redirectUrl)}" />
  <script>window.location.replace("${escapeAttr(redirectUrl)}");</script>

  <style>
    body { margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh;
      font-family:'Inter',system-ui,sans-serif; background:linear-gradient(135deg, ${escapeAttr(brandColor)} 0%, ${escapeAttr(secondaryColor)} 100%); }
    .card { text-align:center; padding:2.5rem; }
    ${logoUrl ? `.logo { width:96px; height:96px; border-radius:50%; object-fit:contain; background:#fff; padding:6px; box-shadow:0 8px 32px rgba(0,0,0,.25); margin:0 auto 1rem; }` : ''}
    h1 { color:#fff; font-size:1.5rem; margin:0 0 .5rem; font-weight:800; }
    p { color:rgba(255,255,255,.85); font-size:.9rem; margin:0; }
  </style>
</head>
<body>
  <div class="card">
    ${logoUrl ? `<img class="logo" src="${escapeAttr(logoUrl)}" alt="${escapeAttr(displayName)}" />` : ''}
    <h1>${escapeHtml(displayName)}</h1>
    <p>${escapeHtml(description)}</p>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('[getStorefrontSharePreview]', error.message);
    return new Response('Error generating preview', { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
});