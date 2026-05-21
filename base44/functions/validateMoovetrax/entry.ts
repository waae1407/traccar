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

    // ── 1. Auth check — list devices (no device_id needed) ─────────────────
    try {
      const listParams = new URLSearchParams({ partner_api_key: partnerApiKey });
      const listUrl = `${MOOVETRAX_BASE}/devices?${listParams}`;
      console.log("[Validate] Probing /devices endpoint:", listUrl);
      const listRes = await fetch(listUrl, { method: "GET" });
      const listText = await listRes.text();
      let listData;
      try { listData = JSON.parse(listText); } catch { listData = { raw: listText.substring(0, 500) }; }
      results.devices_endpoint = { status: listRes.status, data: listData };
    } catch (e) {
      results.devices_endpoint = { error: e.message };
    }

    // ── 2. If device_id provided, probe location endpoint ──────────────────
    if (device_id) {
      try {
        const locParams = new URLSearchParams({ key: device_id, partner_api_key: partnerApiKey });
        const locUrl = `${MOOVETRAX_BASE}/location?${locParams}`;
        console.log("[Validate] Probing /location endpoint:", locUrl);
        const locRes = await fetch(locUrl, { method: "GET" });
        const locText = await locRes.text();
        let locData;
        try { locData = JSON.parse(locText); } catch { locData = { raw: locText.substring(0, 500) }; }
        results.location_endpoint = { status: locRes.status, data: locData };
      } catch (e) {
        results.location_endpoint = { error: e.message };
      }

      // ── 3. Also probe /vehicles endpoint for this device ──────────────────
      try {
        const vParams = new URLSearchParams({ key: device_id, partner_api_key: partnerApiKey });
        const vUrl = `${MOOVETRAX_BASE}/vehicles?${vParams}`;
        console.log("[Validate] Probing /vehicles endpoint");
        const vRes = await fetch(vUrl, { method: "GET" });
        const vText = await vRes.text();
        let vData;
        try { vData = JSON.parse(vText); } catch { vData = { raw: vText.substring(0, 500) }; }
        results.vehicles_endpoint = { status: vRes.status, data: vData };
      } catch (e) {
        results.vehicles_endpoint = { error: e.message };
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