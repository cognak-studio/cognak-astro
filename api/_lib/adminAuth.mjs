/**
 * Shared admin-session helper for the client-delivery tools (api/admin-*.js,
 * api/deliver-*.js). Files under api/_lib/ are NOT turned into their own
 * routes by Vercel (the underscore prefix excludes them) — this only ever
 * runs as an import.
 *
 * Session = a signed, expiring cookie. No database, no JWT library — just
 * HMAC-SHA256 over a tiny JSON payload, verified with a timing-safe compare.
 *
 * Required env vars (Vercel -> Project -> Settings -> Environment Variables):
 *   ADMIN_PASSWORD   the password that unlocks /admin.
 *   ADMIN_SECRET     a random long string used to sign session cookies AND
 *                     as the pepper for hashed share passcodes. Generate
 *                     once with: openssl rand -hex 32
 */

import crypto from 'node:crypto';

const COOKIE_NAME = 'cognak_admin';
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours

function sign(payloadB64) {
  const secret = process.env.ADMIN_SECRET || '';
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function createSessionCookie() {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_MS });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const token = payloadB64 + '.' + sign(payloadB64);
  return [
    COOKIE_NAME + '=' + token,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=' + Math.floor(SESSION_MS / 1000),
  ].join('; ');
}

export function clearSessionCookie() {
  return COOKIE_NAME + '=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i === -1) return;
    out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

/** True if the request carries a valid, unexpired admin session cookie. */
export function isAdmin(req) {
  if (!process.env.ADMIN_SECRET) return false;
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token || token.indexOf('.') === -1) return false;

  const [payloadB64, sig] = token.split('.');
  const expected = Buffer.from(sign(payloadB64));
  const actual = Buffer.from(sig || '');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch (e) {
    return false;
  }
}

/**
 * 401s the response if the request isn't an authenticated admin session.
 * Returns true when it 401'd (the caller should stop and not respond again).
 */
export function requireAdmin(req, res) {
  if (isAdmin(req)) return false;
  res.status(401).json({ error: 'Not signed in.' });
  return true;
}

/** Constant-time check of a candidate password against ADMIN_PASSWORD. */
export function checkPassword(candidate) {
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real) return false;
  const a = crypto.createHash('sha256').update(String(candidate || '')).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

/** SHA-256(passcode + ADMIN_SECRET) as a hex digest — stored, never the raw passcode. */
export function hashPasscode(passcode) {
  return crypto
    .createHash('sha256')
    .update(String(passcode || '') + (process.env.ADMIN_SECRET || ''))
    .digest('hex');
}

export function passcodeMatches(candidate, storedHex) {
  const a = Buffer.from(hashPasscode(candidate), 'hex');
  const b = Buffer.from(String(storedHex || ''), 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
