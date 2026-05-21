/**
 * Temporary diagnostic function to validate MooveTrax API connectivity.
 * Tests the partner API key and probes endpoint response format.
 * DELETE this function after validation is complete.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { device_id } = body;

    const partnerApiKey = Deno.env.get("MOOVETRAX_PARTNER_API_KEY") || "";
    const MOOVETRAX_BASE = "https://www.moovetrax.com/api";

    const results = {};

    // ── Probe multiple possible base URLs to find the real API ──────────────
    const BASE_CANDIDATES = [
      "https://api.moovetrax.com",
      "https://app.moovetrax.com/api",
      "https://moovetrax.com/api",
    ];

    for (const base of BASE_CANDIDATES) {
      // Probe with key only (no partner key) and with partner key
      const variants = [
        { label: `${base}/location?key_only`, url: `${base}/location?key=${encodeURIComponent(device_id || 'probe')}` },
        { label: `${base}/location?with_partner`, url: `${base}/location?key=${encodeURIComponent(device_id || 'probe')}&partner_api_key=${encodeURIComponent(partnerApiKey)}` },
      ];
      for (const v of variants) {
        try {
          console.log(`[Validate] Probing: ${v.url}`);
          const r = await fetch(v.url, { method: 'GET', signal: AbortSignal.timeout(5000) });
          const text = await r.text();
          let data;
          try { data = JSON.parse(text); } catch { data = { raw: text.substring(0, 300) }; }
          const isJson = !data.raw;
          results[v.label] = { status: r.status, is_json: isJson, data };
          if (isJson) console.log(`[Validate] ✅ JSON RESPONSE from ${v.label}:`, JSON.stringify(data));
        } catch (e) {
          results[v.label] = { error: e.message };
        }
      }
    }

    // Also try partner key as header instead of query param
    if (device_id) {
      try {
        const headerUrl = `https://api.moovetrax.com/location?key=${encodeURIComponent(device_id)}`;
        const r = await fetch(headerUrl, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${partnerApiKey}`, 'X-Api-Key': partnerApiKey },
          signal: AbortSignal.timeout(5000),
        });
        const text = await r.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text.substring(0, 300) }; }
        results['api_subdomain_header_auth'] = { status: r.status, is_json: !data.raw, data };
      } catch (e) {
        results['api_subdomain_header_auth'] = { error: e.message };
      }
    }

    return Response.json({
      ok: true,
      partner_api_key_set: !!partnerApiKey,
      device_id_provided: !!device_id,
      results,
    });
  } catch (error) {
    console.error("[Validate] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});