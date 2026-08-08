/**
 * POST /api/deliver-get — Vercel serverless function.
 *
 * Public, no passcode required. The client-facing /receive page posts
 * { token } and gets the file list back. No admin session needed — this
 * is the link COGNAK sends a client; the token alone is the credential.
 */
import { list } from '@vercel/blob';
import { readClientsIndex } from './_lib/clientsIndex.mjs';

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

    /* Client profile picture: prefer the LIVE address book (clients/index.json,
       matched by name) over the manifest's snapshot. This is what makes the
       photo appear on shares CREATED BEFORE the client had one — e.g. a share
       sent Aug 7, client photo added Aug 8: the manifest has no avatarUrl and
       never will, but the address book does. It also means updating a client's
       photo updates every live link. The snapshot stays as the fallback (and
       for clients later deleted from the address book). Best-effort: any
       failure here just means the snapshot behaviour, never a failed page.
       The cache-buster query is load-bearing — index.json is overwritten in
       place and its public URL is CDN-cached (see api/clients.js). */
    let avatarUrl = manifest.avatarUrl || null;
    try {
      const clients = await readClientsIndex();
      const name = String(manifest.client || '').toLowerCase();
      const c = clients.find((x) => String(x.name).toLowerCase() === name);
      if (c && c.avatarUrl) avatarUrl = c.avatarUrl;
    } catch (e) { /* snapshot fallback */ }

    return res.status(200).json({
      ok: true,
      client: manifest.client,
      avatarUrl,
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
