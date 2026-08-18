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
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h — long enough for a 4GB upload on a slow uplink

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
        /* clients/avatars/ added 2026-08-08 for the saved-clients picker on
           /send — profile pictures go up through this same admin-gated
           handshake rather than a second endpoint. Still nothing outside
           these two prefixes. */
        if (!pathname.startsWith('deliveries/') && !pathname.startsWith('clients/avatars/')) {
          throw new Error('Invalid upload path.');
        }
        /* A client file goes to deliveries/<token>/<its own name>, and the
           share's manifest lives under deliveries/<token>/manifest/ — so a
           file literally named "manifest.json" would land on top of the
           share's own database and take the whole share with it. Vanishingly
           rare, and a hard refusal rather than a silent rename because the
           recipient is expecting the filename Pierce sent. /send blocks the
           same name up front so this is the backstop, not the message he
           normally sees. */
        if (/^deliveries\/[^/]+\/manifest(\/|\.json$)/.test(pathname)) {
          throw new Error('A file in a share can’t be named "manifest.json" — rename it and try again.');
        }
        return {
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: false, // keeps filenames legible on the client download page
          allowOverwrite: true,
          /* The SDK defaults this token to one hour, which is shorter than a
             multi-gigabyte upload on a normal home connection — the transfer
             would simply stop partway through with nothing to show for it. */
          validUntil: Date.now() + TOKEN_TTL_MS,
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
