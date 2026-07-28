/**
 * POST /api/deliver-get — Vercel serverless function.
 *
 * Public (no admin session needed) but passcode-gated: the client-facing
 * /deliver page — served at cognak.com/d/<token> via a vercel.json rewrite —
 * calls this with { token, passcode } and gets the file list back once the
 * passcode matches the share's manifest.
 */
import { list } from '@vercel/blob';
import { passcodeMatches } from './_lib/adminAuth.mjs';

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
  const passcode = String((data && data.passcode) || '');
  if (!TOKEN_RE.test(token)) {
    return res.status(404).json({ error: 'This link is not valid.' });
  }

  try {
    const { blobs } = await list({ prefix: 'deliveries/' + token + '/manifest.json', limit: 1 });
    if (!blobs.length) {
      return res.status(404).json({ error: 'This link is not valid.' });
    }
    const manifest = await fetch(blobs[0].url).then((r) => r.json());

    if (!passcode) {
      // Lets the page tell "ask for a passcode" apart from "wrong passcode".
      return res.status(401).json({ error: 'Passcode required.', needsPasscode: true });
    }
    if (!passcodeMatches(passcode, manifest.passcodeHash)) {
      await new Promise((r) => setTimeout(r, 400));
      return res.status(401).json({ error: 'Wrong passcode.' });
    }

    return res.status(200).json({
      ok: true,
      client: manifest.client,
      project: manifest.project || '',
      createdAt: manifest.createdAt,
      files: manifest.files,
    });
  } catch (err) {
    console.error('Delivery lookup failed', err);
    return res.status(502).json({ error: 'Could not load this share. Please try again.' });
  }
}
