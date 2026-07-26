/**
 * POST /api/upload  — Vercel serverless function.
 *
 * Client-upload handshake for the /brief "Existing materials" uploader. The
 * browser uses @vercel/blob/client (loaded on demand from esm.sh) which POSTs
 * here to mint a short-lived upload token, then PUTs the file bytes straight to
 * Vercel Blob storage. This function never touches the file bytes themselves —
 * it only authorizes the upload and (optionally) logs completion.
 *
 * Server setup (one-time):
 *   1. npm i @vercel/blob   (already in package.json)
 *   2. Vercel dashboard → Storage → create a Blob store → connect it to this
 *      project. That injects the BLOB_READ_WRITE_TOKEN env var automatically.
 *
 * No token config is needed in code: handleUpload() reads BLOB_READ_WRITE_TOKEN
 * from the environment.
 */

import { handleUpload } from '@vercel/blob/client';

const MAX_BYTES = 25 * 1024 * 1024; // 25MB — mirrors the client-side cap

// Broad but bounded: covers the accept list on the uploader. Design source
// formats (.ai/.eps/.psd/.fig/.sketch/.key) usually arrive as octet-stream.
const ALLOWED = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
  'application/postscript',
  'image/vnd.adobe.photoshop',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/octet-stream',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vercel parses JSON bodies automatically; guard for a raw string too.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (/* pathname, clientPayload */) => ({
        allowedContentTypes: ALLOWED,
        maximumSizeInBytes: MAX_BYTES,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async ({ blob }) => {
        // Fires server-side once the browser finishes the PUT. No-op beyond a
        // log line; the file URL reaches us via the /api/brief payload anyway.
        // (Does not run on localhost — Vercel Blob needs a public callback URL.)
        console.log('Brief material uploaded:', blob.url);
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('Blob upload handshake failed', err);
    return res.status(400).json({ error: err && err.message ? err.message : 'Upload failed' });
  }
}
