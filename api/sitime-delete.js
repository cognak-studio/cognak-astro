/**
 * POST /api/sitime-delete { urls: [...] } — editors only. Deletes blobs the
 * SiTime image tool itself stored (an uploaded library image and its thumb,
 * or a hosted Adobe comp) once the admin page has removed every reference to
 * them and saved. Refuses anything outside the tool's own upload prefixes.
 */
import { del } from '@vercel/blob';
import { requireEditor } from './_lib/sitimeAuth.mjs';

const OK_PATH = /^\/sitime\/(library|comps|uploads)\//;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const who = await requireEditor(req, res);
  if (!who) return;
  // Deleting stored files is admin-only: team deletes go to the tool's
  // Recently deleted list and are purged from Pierce's session after 30 days.
  if (who.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const urls = Array.isArray(body && body.urls) ? body.urls.slice(0, 10) : [];
  const clean = urls.filter((u) => {
    try { const x = new URL(u); return x.protocol === 'https:' && /\.public\.blob\.vercel-storage\.com$/.test(x.hostname) && OK_PATH.test(x.pathname); }
    catch (e) { return false; }
  });
  if (!clean.length) return res.status(400).json({ error: 'Nothing to delete.' });
  try {
    await del(clean);
    return res.status(200).json({ ok: true, deleted: clean.length });
  } catch (err) {
    console.error('sitime-delete failed', err);
    return res.status(502).json({ error: 'Could not delete the file.' });
  }
}
