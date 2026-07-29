/**
 * POST /api/deliver-get — Vercel serverless function.
 *
 * Public, no passcode required. The client-facing /receive page posts
 * { token } and gets the file list back. No admin session needed — this
 * is the link COGNAK sends a client; the token alone is the credential.
 */
import { list } from '@vercel/blob';

const TOKEN_RE = /^[a-zA-Z0-9]{6,32}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { data = null; }
  }
  const token = String((data && data.token) || '');
  if (!TOKEN_RE.test(token)) {
    return res.status(404).json({ error: 'This link is not valid.' });
  }

  try {
    const { blobs } = await list({ prefix: 'deliveries/' + token + '/manifest.json', limit: 1 });
    if (!blobs.length) {
      return res.status(404).json({ error: 'This link is not valid.' });
    }
    const manifest = await fetch(blobs[0].url).then((r) => r.json());

    /* Expired links are refused BEFORE the passcode is checked, so an expired
       share can't be probed for a valid passcode. A manifest with no expiresAt
       (every share written before expiry existed) never expires. */
    if (manifest.expiresAt && Date.parse(manifest.expiresAt) <= Date.now()) {
      return res.status(410).json({ error: 'This link has expired.', expired: true });
    }

    return res.status(200).json({
      ok: true,
      client: manifest.client,
      project: manifest.project || '',
      createdAt: manifest.createdAt,
      expiresAt: manifest.expiresAt || null,
      files: manifest.files,
    });
  } catch (err) {
    console.error('Delivery lookup failed', err);
    return res.status(502).json({ error: 'Could not load this share. Please try again.' });
  }
}
