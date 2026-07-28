/**
 * POST /api/deliver-upload-token — Vercel serverless function.
 *
 * Client-upload handshake for /admin's file uploader — same pattern as
 * api/upload.js (the /brief uploader), but gated to a signed-in admin
 * session and scoped to the deliveries/ prefix. The browser uses
 * @vercel/blob/client to POST here for a short-lived Blob upload token, then
 * PUTs the file bytes straight to Vercel Blob. This function never touches
 * the file bytes themselves.
 */
import { handleUpload } from '@vercel/blob/client';
import { requireAdmin } from './_lib/adminAuth.mjs';

const MAX_BYTES = 4 * 1024 * 1024 * 1024; // 4GB — deliverables can be big (video, source files)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (requireAdmin(req, res)) return;

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('deliveries/')) {
          throw new Error('Invalid upload path.');
        }
        return {
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: false, // keeps filenames legible on the client download page
          allowOverwrite: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('Delivery file uploaded:', blob.url);
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('Delivery upload handshake failed', err);
    return res.status(400).json({ error: err && err.message ? err.message : 'Upload failed' });
  }
}
