/**
 * POST /api/deliver-create — Vercel serverless function.
 *
 * Writes the manifest for a client-delivery share after /admin has uploaded
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

  const manifest = {
    token,
    client,
    passcodeHash: hashPasscode(passcode),
    createdAt: new Date().toISOString(),
    files,
  };

  try {
    await put('deliveries/' + token + '/manifest.json', JSON.stringify(manifest), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    return res.status(200).json({ ok: true, url: 'https://cognak.com/d/' + token });
  } catch (err) {
    console.error('Delivery manifest write failed', err);
    return res.status(502).json({ error: 'Could not save this share. Please try again.' });
  }
}
