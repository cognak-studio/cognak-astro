/**
 * POST /api/sitime-upload-token — client-upload handshake for the SiTime
 * image tool (same pattern as deliver-upload-token.js). Anyone signed in to
 * the tool (admin, team, client; sitimeAuth.mjs) may upload. Three prefixes:
 *
 *   sitime/library/<id>.jpg, sitime/library/t/<id>.jpg
 *     SiTime's own licensed library, pushed from the admin page's "Index the
 *     library" step (web-size copy + thumbnail per image).
 *   sitime/comps/<key>.jpg
 *     Adobe comps dropped or pasted into the Stock tab's add box.
 *   sitime/uploads/<slotId>/<name>
 *     Generated or hand-picked images Pierce drops onto a slot.
 *
 * Nothing else. The function never sees the bytes.
 *
 * Only admin may overwrite an existing file (2026-09-27). Team and client
 * uploads get a random suffix and never replace anything; the page keeps
 * the url the upload returns, never the pathname it asked for, so that is
 * invisible to it.
 */
import { handleUpload } from '@vercel/blob/client';
import { requireEditor } from './_lib/sitimeAuth.mjs';

const MAX_BYTES = 60 * 1024 * 1024;
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const who = await requireEditor(req, res);
  if (!who) return;
  const admin = who.role === 'admin';

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^sitime\/(library|uploads|comps)\//.test(pathname)) {
          throw new Error('Invalid upload path.');
        }
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: !admin,
          allowOverwrite: admin,
          validUntil: Date.now() + TOKEN_TTL_MS,
        };
      },
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('SiTime upload handshake failed', err);
    return res.status(400).json({ error: err && err.message ? err.message : 'Upload failed' });
  }
}
