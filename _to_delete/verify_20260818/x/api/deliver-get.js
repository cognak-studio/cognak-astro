/**
 * POST /api/deliver-get — Vercel serverless function.
 *
 * Public, no passcode required. The client-facing /receive page posts
 * { token } and gets the file list back. No admin session needed — this
 * is the link COGNAK sends a client; the token alone is the credential.
 *
 * /send calls this too, with the same token, to prefill its editor when
 * Pierce opens a sent share to change something (api/deliver-update.js). It
 * is the only place the full file list — URLs included — is handed back, and
 * a signed-in admin holding the token is already entitled to all of it.
 */
import { readClientsIndex } from './_lib/clientsIndex.mjs';
import { TOKEN_RE } from './_lib/manifest.mjs';
import { readManifest } from './_lib/manifestStore.mjs';

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
    const manifest = await readManifest(token);
    if (!manifest) {
      return res.status(404).json({ error: 'This link is not valid.' });
    }

    /* Expired links are refused up front. A manifest with no expiresAt
       (every share written before expiry existed) never expires. The link
       token is the sole credential — there is no passcode (removed 2026-07-29,
       matching /send and /receive). */
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
      // Snapshot on the manifest, kept separate from the resolved `avatarUrl`
      // above so /send's editor can write back exactly what was stored rather
      // than baking a live address-book photo into the manifest on every edit.
      storedAvatarUrl: manifest.avatarUrl || null,
    });
  } catch (err) {
    console.error('Delivery lookup failed', err);
    return res.status(502).json({ error: 'Could not load this share. Please try again.' });
  }
}
