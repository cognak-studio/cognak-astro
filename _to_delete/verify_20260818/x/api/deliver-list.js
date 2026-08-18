/**
 * GET /api/deliver-list — Vercel serverless function.
 *
 * Admin-only. Lists every delivery share's manifest so /admin can render a
 * "recent shares" panel (link, client, project, filenames, size, delete). Also
 * doubles as the admin page's "am I signed in?" check on load — it 401s the
 * same way every other admin-gated endpoint does.
 */
import { requireAdmin } from './_lib/adminAuth.mjs';
import { shareSummary } from './_lib/manifest.mjs';
import { listManifests } from './_lib/manifestStore.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (requireAdmin(req, res)) return;

  try {
    /* One pass over the store, newest manifest version per share — see
       api/_lib/manifestStore.mjs for why a share can have more than one. An
       entry whose manifest wouldn't parse is skipped rather than shown as a
       broken row; the sweep is the thing that cares about those. */
    const entries = await listManifests();
    const shares = entries
      .filter((e) => e.manifest)
      .map((e) => shareSummary(e.manifest))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return res.status(200).json({ ok: true, shares });
  } catch (err) {
    console.error('Delivery list failed', err);
    return res.status(502).json({ error: 'Could not load shares.' });
  }
}
