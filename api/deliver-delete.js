/**
 * POST /api/deliver-delete — Vercel serverless function.
 *
 * Admin-only. Deletes every blob under deliveries/<token>/ — the files and
 * the manifest — permanently revoking that share's link.
 */
import { list, del } from '@vercel/blob';
import { requireAdmin } from './_lib/adminAuth.mjs';

const TOKEN_RE = /^[a-zA-Z0-9]{6,32}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (requireAdmin(req, res)) return;

  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { data = null; }
  }
  const token = String((data && data.token) || '');
  if (!TOKEN_RE.test(token)) {
    return res.status(400).json({ error: 'Bad share link.' });
  }

  try {
    const { blobs } = await list({ prefix: 'deliveries/' + token + '/', limit: 1000 });
    if (blobs.length) await del(blobs.map((b) => b.url));
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Delivery delete failed', err);
    return res.status(502).json({ error: 'Could not delete this share.' });
  }
}
