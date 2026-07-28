/**
 * /api/admin-passkey-list — manage enrolled passkeys. Admin session required.
 *
 * GET  -> the registered devices (labels and dates only; never the key material)
 * POST { id } -> remove one
 *
 * Removing the LAST passkey is allowed, and deliberately so: it's the in-app
 * way back to password-only if you're decommissioning a laptop and haven't got
 * a second device to hand. It's guarded by an explicit confirmation in the UI
 * rather than being blocked outright, because the alternative — being locked
 * out with no recourse but Vercel's dashboard — is worse.
 */
import { requireAdmin } from './_lib/adminAuth.mjs';
import { loadCredentials, saveCredentials } from './_lib/passkeys.mjs';

export default async function handler(req, res) {
  if (requireAdmin(req, res)) return;

  const creds = await loadCredentials();

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      passkeys: creds.map((c) => ({
        id: c.id,
        label: c.label,
        createdAt: c.createdAt,
        lastUsedAt: c.lastUsedAt,
        backedUp: Boolean(c.backedUp),
      })),
      fallbackEnabled: process.env.ADMIN_PASSWORD_FALLBACK === '1',
    });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    const id = String((body && body.id) || '');
    if (!id) return res.status(400).json({ error: 'Bad request' });

    const next = creds.filter((c) => c.id !== id);
    if (next.length === creds.length) return res.status(404).json({ error: 'Not found.' });
    await saveCredentials(next);
    return res.status(200).json({ ok: true, count: next.length });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
