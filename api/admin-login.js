/**
 * POST /api/admin-login — Vercel serverless function.
 *
 * Checks a single shared password (ADMIN_PASSWORD) and, on success, sets a
 * signed HttpOnly session cookie. /admin and the deliver-* admin endpoints
 * all gate on that cookie via requireAdmin() — see api/_lib/adminAuth.mjs.
 */
import { checkPassword, createSessionCookie } from './_lib/adminAuth.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SECRET) {
    return res.status(500).json({ error: 'Admin login is not configured yet.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }

  if (!checkPassword(body && body.password)) {
    // Small fixed delay blunts naive brute-forcing without a real rate limiter.
    await new Promise((r) => setTimeout(r, 400));
    return res.status(401).json({ error: 'Wrong password.' });
  }

  res.setHeader('Set-Cookie', createSessionCookie());
  return res.status(200).json({ ok: true });
}
