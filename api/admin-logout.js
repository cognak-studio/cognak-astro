/**
 * POST /api/admin-logout — Vercel serverless function. Clears the admin
 * session cookie set by /api/admin-login.
 */
import { clearSessionCookie } from './_lib/adminAuth.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ ok: true });
}
