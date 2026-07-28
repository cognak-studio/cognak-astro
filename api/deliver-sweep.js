/**
 * GET /api/deliver-sweep — Vercel Cron target.
 *
 * Deletes the blobs behind any share whose expiresAt has passed. Expiry on its
 * own only stops the LINK working (api/deliver-get.js refuses an expired
 * manifest); without this the files sit in Blob storage forever and you keep
 * paying for them. This is the half that actually reclaims the storage.
 *
 * Runs daily from the "crons" entry in vercel.json. Deliberately not admin-
 * gated — Vercel Cron can't carry an admin session cookie — so it's protected
 * by CRON_SECRET instead. Vercel sends that automatically as
 * `Authorization: Bearer <CRON_SECRET>` on cron invocations when the env var is
 * set. If CRON_SECRET is missing the endpoint refuses to run at all rather than
 * defaulting open: an unauthenticated delete-everything-expired URL is the one
 * thing here that must never be publicly reachable.
 *
 * Idempotent, so a retried or double-fired cron is harmless: once a share's
 * blobs are gone its manifest is gone too, and it simply isn't found next time.
 */
import { list, del } from '@vercel/blob';

/* Sweeps are all-or-nothing per share: files AND manifest, the same set
   api/deliver-delete.js removes when you delete one by hand. Anything that
   fails is left for the next run rather than retried in a loop here. */
async function purgeShare(token) {
  const { blobs } = await list({ prefix: 'deliveries/' + token + '/', limit: 1000 });
  if (blobs.length) await del(blobs.map((b) => b.url));
  return blobs.length;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('deliver-sweep: CRON_SECRET is not set, refusing to run.');
    return res.status(500).json({ error: 'Sweep is not configured.' });
  }
  if (req.headers.authorization !== 'Bearer ' + secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const result = { checked: 0, purged: [], skipped: 0, failed: [] };

  try {
    const { blobs } = await list({ prefix: 'deliveries/', limit: 1000 });
    const manifests = blobs.filter((b) => b.pathname.endsWith('/manifest.json'));

    for (const b of manifests) {
      result.checked++;
      let m = null;
      try {
        m = await fetch(b.url).then((r) => r.json());
      } catch (e) {
        // An unreadable manifest is left alone on purpose. It might be a
        // partial write from a share still being created, and deleting files
        // we can't account for is worse than paying to store them.
        result.failed.push({ pathname: b.pathname, reason: 'unreadable manifest' });
        continue;
      }

      // No expiresAt means "never expires" — every share written before expiry
      // existed, plus anything sent with the Never pill. Never swept.
      if (!m || !m.expiresAt) {
        result.skipped++;
        continue;
      }
      const due = Date.parse(m.expiresAt);
      if (!Number.isFinite(due) || due > now) {
        result.skipped++;
        continue;
      }

      try {
        const count = await purgeShare(m.token);
        result.purged.push({ token: m.token, client: m.client || '', blobs: count });
        console.log('deliver-sweep: purged', m.token, '(' + count + ' blobs)');
      } catch (e) {
        result.failed.push({ token: m.token, reason: e && e.message ? e.message : 'delete failed' });
      }
    }

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('deliver-sweep failed', err);
    return res.status(502).json({ error: 'Sweep failed.' });
  }
}
