import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DNS_TARGET = 'base44.onrender.com';

function normalizeDomain(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^\/+/, '')
    .split('/')[0]
    .split(':')[0]
    .replace(/\.$/, '');
}

function normalizeDnsValue(value) {
  return String(value || '').toLowerCase().replace(/^"|"$/g, '').replace(/\.$/, '');
}

async function queryDns(name, type) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const res = await fetch(url, { headers: { accept: 'application/dns-json' } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.Answer || [];
}

async function hasTxtRecord(name, expectedValue) {
  const answers = await queryDns(name, 'TXT');
  return answers.some((answer) => normalizeDnsValue(answer.data).includes(normalizeDnsValue(expectedValue)));
}

async function hasCnameTarget(name, expectedTarget) {
  const answers = await queryDns(name, 'CNAME');
  return answers.some((answer) => normalizeDnsValue(answer.data) === normalizeDnsValue(expectedTarget));
}

async function checkHttps(domain) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://${domain}`, { method: 'GET', redirect: 'manual', signal: controller.signal });
    clearTimeout(timeout);
    return res.status > 0;
  } catch (_) {
    return false;
  }
}

function isSuspiciousDomain(domain) {
  const protectedDomains = ['uridehub.com', 'www.uridehub.com'];
  return protectedDomains.includes(domain) || domain.includes('base44');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const domainId = body.domain_id;
    if (!domainId) return Response.json({ error: 'domain_id is required' }, { status: 400 });

    let records = [];
    try {
      records = await base44.asServiceRole.entities.HostCustomDomain.filter({ id: domainId });
    } catch (_) {
      return Response.json({ error: 'Domain record not found' }, { status: 404 });
    }
    const record = records[0];
    if (!record) return Response.json({ error: 'Domain record not found' }, { status: 404 });

    const hosts = user.role === 'admin'
      ? await base44.asServiceRole.entities.Host.filter({ id: record.host_id })
      : await base44.entities.Host.filter({ email: user.email });
    const host = hosts.find((h) => h.id === record.host_id);
    if (!host) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date().toISOString();
    const normalizedDomain = normalizeDomain(record.normalized_domain || record.domain);
    const updates = { last_checked_at: now, normalized_domain: normalizedDomain, dns_target: record.dns_target || DNS_TARGET };
    const failures = [];
    const reviewReasons = [];

    const duplicates = await base44.asServiceRole.entities.HostCustomDomain.filter({ normalized_domain: normalizedDomain });
    const conflicting = duplicates.find((d) => d.id !== record.id && d.host_id !== record.host_id);
    if (conflicting) reviewReasons.push('Duplicate domain ownership conflict');
    if (isSuspiciousDomain(normalizedDomain)) reviewReasons.push('Protected or suspicious domain');
    if (host.status !== 'approved' || host.host_under_review || host.booking_blocked) reviewReasons.push('Host account requires review before domain activation');

    const txtOk = await hasTxtRecord(record.txt_record_name, record.txt_record_value);
    if (!txtOk) failures.push(`Missing TXT record: ${record.txt_record_name} = ${record.txt_record_value}`);

    let cnameOk = true;
    if (record.domain_type !== 'apex') {
      cnameOk = await hasCnameTarget(normalizedDomain, record.cname_record_value || DNS_TARGET);
      if (!cnameOk) failures.push(`Missing CNAME record: ${normalizedDomain} → ${record.cname_record_value || DNS_TARGET}`);
    } else {
      failures.push('Apex/root domains are not enabled for self-service Phase 2. Use a www domain.');
    }

    const httpsOk = await checkHttps(normalizedDomain);
    updates.ssl_status = httpsOk ? 'active' : 'pending';

    if (reviewReasons.length > 0) {
      updates.verification_status = 'under_review';
      updates.active = false;
      updates.requires_admin_review = true;
      updates.review_reason = reviewReasons.join('; ');
      updates.failure_reason = failures.join('; ');
    } else if (failures.length === 0 && txtOk && cnameOk) {
      updates.verification_status = 'verified';
      updates.active = true;
      updates.requires_admin_review = false;
      updates.review_reason = '';
      updates.failure_reason = httpsOk ? '' : 'DNS verified. SSL is pending until Base44 finishes certificate provisioning.';
      updates.verified_at = record.verified_at || now;
      updates.connected_at = record.connected_at || now;
      updates.redirect_to_canonical = true;
    } else {
      updates.verification_status = 'failed';
      updates.active = false;
      updates.requires_admin_review = false;
      updates.failure_reason = failures.join('; ');
    }

    updates.notes = `Last verification ${now}: TXT ${txtOk ? 'ok' : 'missing'}, CNAME ${cnameOk ? 'ok' : 'missing'}, HTTPS ${httpsOk ? 'active' : 'pending'}.`;

    const updated = await base44.asServiceRole.entities.HostCustomDomain.update(record.id, updates);
    return Response.json({ ok: true, domain: updated, txt_ok: txtOk, cname_ok: cnameOk, https_ok: httpsOk, review_required: updates.requires_admin_review || false });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});