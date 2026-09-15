/**
 * POST /api/sitime-generate — admin-only. Generates 1-5 AI candidate images
 * for a slot from its brief (the slot's editable `prompt` field) and stores
 * them in Blob under sitime/generated/<slotId>/. Backs the admin Slots
 * drawer's Generated tab: "Generate 5" fills an empty set, "Refresh all"
 * replaces all five with count:5, and a per-card refresh regenerates just
 * that one with count:1 -- the admin page splices the single result back
 * into s.generated at the right index.
 *
 * Provider: Google's Gemini image model (gemini-2.5-flash-image, aka "Nano
 * Banana") via the generateContent REST endpoint. Picked because SiTime's
 * brief calls for clean, real-photo-style industrial/technical imagery and
 * this is the key Pierce supplied. The old Imagen predict API is being
 * retired (shutdown Aug 2026) so this intentionally does NOT use that.
 * Everything provider-specific lives in generateOne() below if this needs
 * to swap later.
 *
 * Every prompt gets SiTime's house subject rules appended automatically
 * (STYLE_SUFFIX) so Pierce only has to write the creative direction --
 * the "no hands, no light trails..." constraints are already baked in.
 */
import { put } from '@vercel/blob';
import { requireAdmin } from './_lib/adminAuth.mjs';

const MODEL = 'gemini-2.5-flash-image';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';

const STYLE_SUFFIX = ' Photograph, not illustration or 3D render: real-world commercial/editorial technology photography, shot on a modern camera, natural or studio lighting, in sharp focus. Greater scale and life around the innovation, not a lab close-up of nothing. Rules: no hands holding anything, no light trails, no deep space (low Earth orbit only), do not shoot with an overall blue or cyan cast, no visible logos or text in the image, no camera watermarks.';

function extFor(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function generateOne(prompt, apiKey) {
  const r = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = (body && body.error && body.error.message) || ('HTTP ' + r.status);
    throw new Error('Gemini: ' + msg);
  }
  const parts = (body && body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts) || [];
  const img = parts.find((p) => p.inlineData && p.inlineData.data);
  if (!img) throw new Error('Gemini returned no image (it may have refused the prompt).');
  return { data: img.inlineData.data, mimeType: img.inlineData.mimeType || 'image/png' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (requireAdmin(req, res)) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not set in this project’s Vercel env vars.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  body = body || {};
  const slotId = String(body.slotId || '');
  const prompt = String(body.prompt || '').trim();
  const count = Math.max(1, Math.min(5, Number(body.count) || 5));
  if (!/^[A-Z]{2,3}-\d{3,5}$/.test(slotId)) return res.status(400).json({ error: 'Unknown slot.' });
  if (!prompt) return res.status(400).json({ error: 'Write a brief first.' });

  const fullPrompt = prompt + STYLE_SUFFIX;

  try {
    const results = await Promise.allSettled(Array.from({ length: count }, () => generateOne(fullPrompt, apiKey)));
    const ok = [];
    const errors = [];
    for (const r of results) {
      if (r.status === 'fulfilled') ok.push(r.value); else errors.push((r.reason && r.reason.message) || String(r.reason));
    }
    if (!ok.length) return res.status(502).json({ error: errors[0] || 'Generation failed.' });

    const at = Date.now();
    const images = await Promise.all(ok.map(async (img, i) => {
      const ext = extFor(img.mimeType);
      const pathname = 'sitime/generated/' + slotId + '/' + at + '-' + i + '.' + ext;
      const buf = Buffer.from(img.data, 'base64');
      const blob = await put(pathname, buf, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: img.mimeType });
      return { id: at + '-' + i, url: blob.url, mimeType: img.mimeType, at };
    }));

    return res.status(200).json({ ok: true, images, partial: errors.length ? errors : undefined });
  } catch (err) {
    console.error('sitime-generate failed', err);
    return res.status(502).json({ error: (err && err.message) ? err.message : 'Generation failed.' });
  }
}
