/**
 * POST /api/sitime-upload-token — admin-only client-upload handshake for the
 * SiTime image tool (same pattern as deliver-upload-token.js). Two prefixes:
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
 */
import { handleUpload } from '@vercel/blob/client';
import { requireAdmin } from './_lib/adminAuth.mjs';

const MAX_BYTES = 60 * 1024 * 1024;
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (requireAdmin(req, res)) return;

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
          addRandomSuffix: false,
          allowOverwrite: true,
          validUntil: Date.now() + TOKEN_TTL_MS,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('SiTime image uploaded:', blob.url);
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('SiTime upload handshake failed', err);
    return res.status(400).json({ error: err && err.message ? err.message : 'Upload failed' });
  }
}
