/**
 * POST /api/deliver-track-download — Vercel serverless function.
 *
 * Public, no admin session. Fired as a best-effort
 * beacon from /receive when the client clicks a file's Download link, purely
 * so /send's dashboard can show a "this client has opened at least one file"
 * indicator (Pierce, 2026-07-29) without polling or a webhook.
 *
 * Deliberately unauthenticated: the token in the link is the only credential
 * this feature has, and this endpoint neither reads it back nor exposes any
 * share data. Worst case if someone spams it with a guessed token, they've
 * flipped one boolean a little early — nothing is disclosed.
 *
 * Idempotent: writes the manifest once, on the FIRST download only. Later
 * clicks (same file again, or other files in the same share) are silent
 * no-ops, so this never fights with deliver-delete/deliver-sweep removing
 * the share, and never needs a read-modify-write race guard beyond "was it
 * already set".
 *
 * That "was it already set" guard does more work now that /send can edit a
 * sent share (api/deliver-update.js): both writers are read-modify-write on
 * the same manifest, so a download landing in the middle of an edit could
 * otherwise write back a copy without the edit. Writing at most once per
 * share, against the freshest version (api/_lib/manifestStore.mjs), keeps the
 * window to a single click in the exact second of a save — and the worst case
 * is still only a stale dot on the dashboard, never a lost file.
 */
import { TOKEN_RE } from './_lib/manifest.mjs';
import { readManifest, writeManifest } from './_lib/manifestStore.mjs';

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

  // This is a fire-and-forget beacon the client never waits on or checks the
  // result of — every exit path below is a quiet 204 rather than an error,
  // so a failure here can never surface as a problem on the download the
  // person actually cares about.
  if (!TOKEN_RE.test(token)) {
    return res.status(204).end();
  }

  try {
    const manifest = await readManifest(token);
    if (!manifest) return res.status(204).end();
    if (manifest.downloadedAt) return res.status(204).end(); // already recorded

    manifest.downloadedAt = new Date().toISOString();
    await writeManifest(token, manifest);
    return res.status(204).end();
  } catch (err) {
    console.error('Download tracking failed', err);
    return res.status(204).end();
  }
}
