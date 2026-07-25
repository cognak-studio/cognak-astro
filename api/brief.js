/**
 * POST /api/brief  — Vercel serverless function.
 *
 * Receives a project brief from /brief and emails it via Resend. The Resend
 * API key lives only in this server-side function (never in the browser), so
 * the front end just POSTs the assembled brief here. No npm dependency: we
 * call Resend's REST API with the built-in fetch (Node 18+ on Vercel).
 *
 * Required env var (set in Vercel → Project → Settings → Environment Variables):
 *   RESEND_API_KEY   your Resend API key
 * Optional env vars:
 *   BRIEF_TO         recipient (default pierce@cognak.com)
 *   BRIEF_FROM       verified sender (default COGNAK <onboarding@resend.dev>,
 *                    the Resend shared sender — swap to a cognak.com address
 *                    once the domain is verified in Resend)
 */

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Email delivery is not configured yet.' });
  }

  // Vercel parses JSON bodies automatically, but guard for a raw string too.
  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { data = null; }
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Bad request' });
  }

  const text = String(data.text || '').slice(0, 20000);
  if (!text.trim()) {
    return res.status(400).json({ error: 'Empty brief' });
  }

  const discipline = String(data.discipline || 'Project').slice(0, 80);
  const who = String(data.who || 'New').slice(0, 200);
  const email =
    typeof data.email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)
      ? data.email
      : undefined;

  const FROM = process.env.BRIEF_FROM || 'COGNAK <onboarding@resend.dev>';
  const TO = process.env.BRIEF_TO || 'pierce@cognak.com';
  const subject = 'New ' + discipline + ' brief: ' + who;

  // Header styled to match Pierce's email signature: neutral sans, a small
  // grey uppercase eyebrow, a bold near-black title, and a purple reply link.
  // The brief body stays in the beige monospace box.
  const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const PURPLE = '#5B4FE6';
  const html =
    '<div style="font-family:' + SANS + ';max-width:640px;color:#1a1a1a;line-height:1.5">' +
    '<p style="margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#8a8a8a">COGNAK &middot; New brief</p>' +
    '<h2 style="margin:0 0 6px;font-size:24px;font-weight:700;letter-spacing:-.01em;color:#111">' + esc(subject) + '</h2>' +
    (email
      ? '<p style="margin:0 0 22px;font-size:14px;color:#8a8a8a">Reply to: <a href="mailto:' + esc(email) + '" style="color:' + PURPLE + ';font-weight:600;text-decoration:none">' + esc(email) + '</a></p>'
      : '<div style="height:22px"></div>') +
    '<pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.6;color:#1a1a1a;background:#f6f4ef;border:1px solid #e6e1d8;border-radius:8px;padding:18px;margin:0">' +
    esc(text) +
    '</pre></div>';

  const payload = {
    from: FROM,
    to: [TO],
    subject: subject,
    html: html,
    text: text,
  };
  if (email) payload.reply_to = email;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('Resend responded', r.status, detail);
      return res
        .status(502)
        .json({ error: 'We could not send your brief just now. Please try again in a moment.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Brief send failed', err);
    return res
      .status(502)
      .json({ error: 'We could not send your brief just now. Please try again in a moment.' });
  }
}
