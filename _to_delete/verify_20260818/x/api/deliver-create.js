/**
 * POST /api/deliver-create — Vercel serverless function.
 *
 * Writes the manifest for a client-delivery share after /send has uploaded
 * the files to Blob storage (via api/deliver-upload-token.js). The manifest
 * is itself a small JSON blob under deliveries/<token>/manifest/ — that's the
 * entire "database" this feature needs. Admin-only.
 *
 * Editing a share AFTER it's been sent is api/deliver-update.js, not this
 * endpoint: the two differ in what they're allowed to touch (this one sets
 * createdAt and expiresAt; that one must preserve them), and folding them
 * together would mean one request body where half the fields are ignored
 * depending on a mode flag. The validation they share lives in
 * api/_lib/manifest.mjs; where the manifest actually goes, and why it's a
 * versioned path rather than one overwritten file, is api/_lib/manifestStore.mjs.
 */
import { requireAdmin } from './_lib/adminAuth.mjs';
import { TOKEN_RE, cleanBlobUrl, cleanText, normalizeFiles } from './_lib/manifest.mjs';
import { writeManifest } from './_lib/manifestStore.mjs';

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
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Bad request' });
  }

  const token = String(data.token || '');
  if (!TOKEN_RE.test(token)) {
    return res.status(400).json({ error: 'Bad share link.' });
  }

  const client = cleanText(data.client, 'Client');
  /* Saved-client profile picture, if /send picked one from the address book
     (api/clients.js). Snapshotted into the manifest rather than joined at read
     time, so /receive stays one blob-read per view and a later change to the
     saved client never rewrites what an already-sent link shows. Same
     blob-store-only validation as the file URLs — it lands in an <img src>
     on /receive. */
  const avatarUrl = cleanBlobUrl(data.avatarUrl);
  // Optional, and unlike `client` it IS shown to the recipient (it headlines
  // the file list on /receive), so an empty one stays empty rather than
  // falling back to a placeholder.
  const project = cleanText(data.project);

  const files = normalizeFiles(data.files);
  if (!files.length) {
    return res.status(400).json({ error: 'No files to deliver.' });
  }

  /* Link lifetime, chosen on /send. Only 7/30/90 are offered there now — the
     "1 year" and "Never" pills were removed 2026-07-28 specifically so a
     share can't dodge deliver-sweep.js indefinitely (a null expiresAt is the
     one thing the sweep will never touch). Anything else reaching this
     endpoint — a stale cached page, a hand-crafted request — falls back to
     the SHORTEST option rather than "never": a silently short-lived link is
     a far smaller failure than a silently permanent one. Manifests written
     before 2026-07-28 still have no expiresAt at all and are unaffected —
     deliver-get and deliver-sweep both still treat a missing expiresAt as
     "no expiry", unchanged.

     This is also why api/deliver-update.js leaves expiresAt alone: if every
     edit re-armed the countdown, a share kept tidy with small corrections
     would outlive the cap by accident, which is the exact thing the cap is
     here to prevent (Pierce, 2026-08-18). */
  const ALLOWED_DAYS = [7, 30, 90]; // 1wk / 1mo / 3mo
  const requestedDays = Number(data.expiresInDays);
  const days = ALLOWED_DAYS.includes(requestedDays) ? requestedDays : 7;
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

  const manifest = {
    token,
    client,
    ...(avatarUrl ? { avatarUrl } : {}),
    project,
    createdAt: new Date().toISOString(),
    expiresAt,
    files,
  };

  try {
    await writeManifest(token, manifest);
    return res.status(200).json({ ok: true, url: 'https://cognak.com/files/' + token });
  } catch (err) {
    console.error('Delivery manifest write failed', err);
    return res.status(502).json({ error: 'Could not save this share. Please try again.' });
  }
}
