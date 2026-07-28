/**
 * GET /api/deliver-list — Vercel serverless function.
 *
 * Admin-only. Lists every delivery share's manifest so /admin can render a
 * "recent shares" panel (link, client, file count, size, delete). Also
 * doubles as the admin page's "am I signed in?" check on load — it 401s the
 * same way every other admin-gated endpoint does.
 */
import { list } from '@vercel/blob';
import { requireAdmin } from './_lib/adminAuth.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (requireAdmin(req, res)) return;

  try {
    const { blobs } = await list({ prefix: 'deliveries/', limit: 1000 });
    const manifestBlobs = blobs.filter((b) => b.pathname.endsWith('/manifest.json'));

    const shares = await Promise.all(
      manifestBlobs.map(async (b) => {
        try {
          const m = await fetch(b.url).then((r) => r.json());
          const totalSize = (m.files || []).reduce((sum, f) => sum + (Number(f.size) || 0), 0);
          return {
            token: m.token,
            client: m.client,
            createdAt: m.createdAt,
            fileCount: (m.files || []).length,
            totalSize,
          };
        } catch (e) {
          return null;
        }
      })
    );

    const clean = shares.filter(Boolean).sort((a, b2) => (a.createdAt < b2.createdAt ? 1 : -1));
    return res.status(200).json({ ok: true, shares: clean });
  } catch (err) {
    console.error('Delivery list failed', err);
    return res.status(502).json({ error: 'Could not load shares.' });
  }
}
