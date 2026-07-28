/**
 * POST /api/deliver-create — Vercel serverless function.
 *
 * Writes the manifest for a client-delivery share after /send has uploaded
 * the files to Blob storage (via api/deliver-upload-token.js). The manifest
 * is itself a small JSON blob at deliveries/<token>/manifest.json — that's
 * the entire "database" this feature needs. Admin-only.
 */
import { put } from '@vercel/blob';
import { requireAdmin, hashPasscode } from './_lib/adminAuth.mjs';

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

  const passcode = String(data.passcode || '');
  if (passcode.length < 4) {
    return res.status(400).json({ error: 'Passcode needs to be at least 4 characters.' });
  }

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

  /* Link lifetime, chosen on /send. 0 (or anything unrecognised) means the
     link never expires, which is the pre-expiry behaviour every share written
     before 2026-07-28 has — those manifests simply have no expiresAt, and
     deliver-get treats a missing value as "no expiry" rather than "expired".
     Clamped so a hand-crafted request can't set an absurd horizon. */
  const ALLOWED_DAYS = [0, 7, 30, 90];
  const requestedDays = Number(data.expiresInDays);
  const days = ALLOWED_DAYS.includes(requestedDays) ? requestedDays : 0;
  const expiresAt = days > 0
    ? new Date(Date.now() + days * 86400000).toISOString()
    : null;

  const manifest = {
    token,
    client,
    project,
    passcodeHash: hashPasscode(passcode),
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
    return res.status(200).json({ ok: true, url: 'https://cognak.com/r/' + token });
  } catch (err) {
    console.error('Delivery manifest write failed', err);
    return res.status(502).json({ error: 'Could not save this share. Please try again.' });
  }
}
