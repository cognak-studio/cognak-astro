/**
 * POST /api/deliver-create — Vercel serverless function.
 *
 * Writes the manifest for a client-delivery share after /send has uploaded
 * the files to Blob storage (via api/deliver-upload-token.js). The manifest
 * is itself a small JSON blob at deliveries/<token>/manifest.json — that's
 * the entire "database" this feature needs. Admin-only.
 */
import { put } from '@vercel/blob';
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
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Bad request' });
  }

  const token = String(data.token || '');
  if (!TOKEN_RE.test(token)) {
    return res.status(400).json({ error: 'Bad share link.' });
  }

  const client = String(data.client || 'Client').trim().slice(0, 200) || 'Client';
  // Optional, and unlike `client` it IS shown to the recipient (it headlines
  // the file list on /receive), so an empty one stays empty rather than
  // falling back to a placeholder.
  const project = String(data.project || '').trim().slice(0, 200);

  const files = Array.isArray(data.files)
    ? data.files
        .filter((f) => f && f.url && f.name)
        .slice(0, 200)
        .map((f) => ({
          name: String(f.name).slice(0, 300),
          url: String(f.url),
          size: Number(f.size) || 0,
        }))
    : [];
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
     "no expiry", unchanged. */
  const ALLOWED_DAYS = [7, 30, 90]; // 1wk / 1mo / 3mo
  const requestedDays = Number(data.expiresInDays);
  const days = ALLOWED_DAYS.includes(requestedDays) ? requestedDays : 7;
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

  const manifest = {
    token,
    client,
    project,
    createdAt: new Date().toISOString(),
    expiresAt,
    files,
  };

  try {
    await put('deliveries/' + token + '/manifest.json', JSON.stringify(manifest), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    return res.status(200).json({ ok: true, url: 'https://cognak.com/files/' + token });
  } catch (err) {
    console.error('Delivery manifest write failed', err);
    return res.status(502).json({ error: 'Could not save this share. Please try again.' });
  }
}
