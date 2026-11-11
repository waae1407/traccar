// sendBrandedEmail — the one layout every uRide email is sent in.
//
// Callers pass plain copy (message/body) and the shared skeleton supplies the
// header lockup, brand rule, details grid, "view this in uRide" link and the
// support line. Nobody hand-rolls email HTML for platform mail any more.
//
//   await base44.asServiceRole.functions.invoke('sendBrandedEmail', {
//     to, subject, body, from_name,
//     facts: [['Vehicle', '2012 Prius'], ['Amount', '$285.00']],
//     action_url: '/my-bookings',
//   });

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const APP_URL = 'https://uridehub.com';
const SUPPORT_EMAIL = 'support@uridehub.com';
const LOGO = 'https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/62095243e_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.png';

const MAIL = {
  ink: '#1d1d1d',
  body: '#4a4a4a',
  label: '#7a7a7a',
  rule: '#d1d1d1',
  accent: '#f42a74',
  link: '#0056b3',
  font: 'Helvetica,Arial,sans-serif',
};

function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

// Subjects carry emoji and [TEST]/[uRide] prefixes — the headline should not.
function cleanTitle(raw) {
  const text = String(raw ?? '')
    .replace(/^\[[^\]]*\]\s*/, '')
    .replace(/^[^A-Za-z0-9$]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || 'uRide update';
}

// Plain copy arrives as paragraphs separated by blank lines.
function toParagraphs(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => '<p style="margin:0 0 14px;font-family:' + MAIL.font + ';font-size:15px;line-height:1.6;color:' + MAIL.body + ';">' +
      escapeHtml(block).replace(/\n/g, '<br>') + '</p>')
    .join('');
}

function detailCell(label, value, fullWidth) {
  const span = fullWidth ? ' colspan="2"' : ' width="50%"';
  return '<td' + span + ' style="border:1px solid ' + MAIL.rule + ';padding:12px 14px;vertical-align:top;text-align:left;">' +
    '<div style="font-family:' + MAIL.font + ';font-size:11px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:' + MAIL.label + ';">' + escapeHtml(label) + '</div>' +
    '<div style="font-family:' + MAIL.font + ';font-size:15px;font-weight:bold;color:' + MAIL.ink + ';padding-top:5px;">' + escapeHtml(value) + '</div>' +
    '</td>';
}

function buildDetailsGrid(rows) {
  let html = '';
  for (let i = 0; i < rows.length; i += 2) {
    const left = rows[i];
    const right = rows[i + 1];
    html += '<tr>' + (right
      ? detailCell(left[0], left[1], false) + detailCell(right[0], right[1], false)
      : detailCell(left[0], left[1], true)) + '</tr>';
  }
  return html;
}

function shell(inner) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#ffffff;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:36px 20px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">' +
    '<tr><td align="center" style="padding:0 0 16px;">' +
    '<img src="' + LOGO + '" width="40" height="40" alt="uRide" style="display:inline-block;vertical-align:middle;border-radius:50%;border:0;">' +
    '<span style="font-family:' + MAIL.font + ';font-size:20px;font-weight:bold;color:' + MAIL.ink + ';vertical-align:middle;padding-left:10px;">uRide</span>' +
    '</td></tr>' +
    '<tr><td style="border-top:1px solid ' + MAIL.accent + ';font-size:0;line-height:0;height:0;">&nbsp;</td></tr>' +
    inner +
    '<tr><td style="padding:32px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function buildEmail({ title, message, facts = [], action_url = '/', action_label = 'View this in uRide', guidance = '' }) {
  const headline = escapeHtml(title);
  const bodyHtml = toParagraphs(message);

  const rows = (facts || []).filter((r) => r && r[1] != null && r[1] !== '');
  const detailsHtml = rows.length
    ? '<p style="margin:0 0 10px;font-family:' + MAIL.font + ';font-size:15px;font-weight:bold;color:' + MAIL.ink + ';">Details:</p>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' + buildDetailsGrid(rows) + '</table>'
    : '';

  const url = /^https?:/i.test(action_url) ? action_url : APP_URL + action_url;

  return shell(
    '<tr><td align="center" style="padding:30px 0 0;">' +
    '<h1 style="margin:0;font-family:' + MAIL.font + ';font-size:24px;line-height:1.3;font-weight:bold;color:' + MAIL.ink + ';">' + headline + '</h1>' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:14px 0 0;">' + bodyHtml +
    (guidance ? '<p style="margin:0 0 14px;font-family:' + MAIL.font + ';font-size:15px;line-height:1.6;color:' + MAIL.body + ';">' + escapeHtml(guidance) + '</p>' : '') +
    '</td></tr>' +
    (detailsHtml ? '<tr><td style="padding:14px 0 0;">' + detailsHtml + '</td></tr>' : '') +
    '<tr><td align="center" style="padding:30px 0 0;">' +
    '<p style="margin:0 0 6px;font-family:' + MAIL.font + ';font-size:17px;font-weight:bold;color:' + MAIL.ink + ';">' + escapeHtml(action_label) + '</p>' +
    '<p style="margin:0;font-family:' + MAIL.font + ';font-size:15px;line-height:1.6;color:' + MAIL.body + ';">Head to <a href="' + url + '" style="color:' + MAIL.link + ';text-decoration:none;">uRide</a> to see the latest.</p>' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:26px 0 0;">' +
    '<p style="margin:0 0 6px;font-family:' + MAIL.font + ';font-size:17px;font-weight:bold;color:' + MAIL.ink + ';">Need help?</p>' +
    '<p style="margin:0;font-family:' + MAIL.font + ';font-size:15px;line-height:1.6;color:' + MAIL.body + ';">Reply to this email or write to <a href="mailto:' + SUPPORT_EMAIL + '" style="color:' + MAIL.link + ';text-decoration:none;">' + SUPPORT_EMAIL + '</a> and our support team will get back to you.</p>' +
    '</td></tr>'
  );
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const to = body.to;
    if (!to) return Response.json({ success: false, error: 'Missing recipient' }, { status: 400 });
    if (!RESEND_API_KEY) return Response.json({ success: false, error: 'Email not configured' }, { status: 500 });

    const title = cleanTitle(body.title || body.subject);
    // Senders hand over either plain copy (body/message/text) or finished HTML.
    const message = body.message || body.body || body.text || '';
    const isHtml = /<[a-z][\s\S]*>/i.test(message);

    const html = isHtml
      ? shell('<tr><td style="padding:26px 0 0;font-family:' + MAIL.font + ';font-size:15px;line-height:1.6;color:' + MAIL.body + ';">' + message + '</td></tr>')
      : buildEmail({
          title,
          message,
          facts: body.facts || [],
          action_url: body.action_url || '/',
          action_label: body.action_label || 'View this in uRide',
          guidance: body.guidance || '',
        });

    const fromAddress = body.from_name ? body.from_name + ' <noreply@uridehub.com>' : 'uRide <noreply@uridehub.com>';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromAddress, to: [to], subject: body.subject || title, html }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[sendBrandedEmail] Resend error:', JSON.stringify(data));
      return Response.json({ success: false, error: data.message || 'Email failed' }, { status: res.status });
    }

    return Response.json({ success: true, id: data.id });
  } catch (error) {
    console.error('[sendBrandedEmail] Error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});