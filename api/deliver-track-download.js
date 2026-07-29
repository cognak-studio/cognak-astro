/**
 * POST /api/deliver-track-download — Vercel serverless function.
 *
 * Public, no admin session and no passcode re-check. Fired as a best-effort
 * beacon from /receive when the client clicks a file's Download link, purely
 * so /send's dashboard can show a "this client has opened at least one file"
 * indicator (Pierce, 2026-07-29) without polling or a webhook.
 *
 * Deliberately not passcode-gated: by the time this fires the client has
 * already cleared deliver-get's passcode check once this page load, and
 * re-threading that passcode into every download click for a low-stakes
 * status dot isn't worth the complexity. Worst case if someone spams this
 * with a guessed token, they've flipped one boolean a little early — no
 * files, passcodes, or other share data are exposed here.
 *
 * Idempotent: writes the manifest once, on the FIRST download only. Later
 * clicks (same file again, or other files in the same share) are silent
 * no-ops, so this never fights with deliver-delete/deliver-sweep removing
 * the share, and never needs a read-modify-write race guard beyond "was it
 * already set".
 */
import { list, put } from '@vercel/blob';

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

  // This is a fire-and-forget beacon the client never waits on or checks the
  // result of — every exit path below is a quiet 204 rather than an error,
  // so a failure here can never surface as a problem on the download the
  // person actually cares about.
  if (!TOKEN_RE.test(token)) {
    return res.status(204).end();
  }

  try {
    const { blobs } = await list({ prefix: 'deliveries/' + token + '/manifest.json', limit: 1 });
    if (!blobs.length) return res.status(204).end();

    const manifest = await fetch(blobs[0].url).then((r) => r.json());
    if (manifest.downloadedAt) return res.status(204).end(); // already recorded

    manifest.downloadedAt = new Date().toISOString();
    await put('deliveries/' + token + '/manifest.json', JSON.stringify(manifest), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    return res.status(204).end();
  } catch (err) {
    console.error('Download tracking failed', err);
    return res.status(204).end();
  }
}
