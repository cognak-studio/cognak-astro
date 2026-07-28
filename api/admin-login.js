/**
 * POST /api/admin-login — password sign-in.
 *
 * GET returns the sign-in modes the server will actually accept, so the page
 * can render the right thing instead of guessing.
 *
 * Two things guard this now:
 *   1. Rate limiting (api/_lib/rateLimit.mjs) — previously the only defence
 *      was a 400ms delay, i.e. ~2 guesses/sec forever.
 *   2. Once a passkey is enrolled, the password STOPS WORKING. Otherwise the
 *      password stays the weakest way in and the passkey has bought nothing.
 *      ADMIN_PASSWORD_FALLBACK=1 in Vercel re-opens it if a device is lost.
 */
import { checkPassword, createSessionCookie } from './_lib/adminAuth.mjs';
import { passkeyRequired, loadCredentials } from './_lib/passkeys.mjs';
import { checkLoginAllowed, recordFailure, clearFailures } from './_lib/rateLimit.mjs';

export default async function handler(req, res) {
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SECRET) {
    return res.status(500).json({ error: 'Admin login is not configured yet.' });
  }

  if (req.method === 'GET') {
    const creds = await loadCredentials();
    return res.status(200).json({
      ok: true,
      hasPasskeys: creds.length > 0,
      passwordAllowed: !(await passkeyRequired()),
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const gate = await checkLoginAllowed(req);
  if (!gate.allowed) {
    res.setHeader('Retry-After', String(gate.retryAfterSec));
    return res.status(429).json({
      error: 'Too many attempts. Try again in ' + Math.ceil(gate.retryAfterSec / 60) + ' minutes.',
      retryAfterSec: gate.retryAfterSec,
    });
  }

  if (await passkeyRequired()) {
    // Not a failed attempt — no point counting it against the limiter.
    return res.status(403).json({
      error: 'This account uses a passkey. Sign in with Touch ID or your phone.',
      passkeyOnly: true,
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }

  if (!checkPassword(body && body.password)) {
    await recordFailure(req);
    // Fixed delay still applies: it flattens the timing difference between
    // "wrong password" and any earlier bail-out above.
    await new Promise((r) => setTimeout(r, 400));
    return res.status(401).json({ error: 'Wrong password.' });
  }

  await clearFailures(req);
  res.setHeader('Set-Cookie', createSessionCookie());
  return res.status(200).json({ ok: true });
}
