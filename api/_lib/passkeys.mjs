/**
 * Passkey (WebAuthn) credential store + challenge handling for /send.
 *
 * Credentials live in one JSON blob. There is exactly one admin, so there's no
 * user table — just a list of authenticators that are allowed in. The public
 * key is, as the name says, public: leaking this file would let someone see
 * WHICH devices can sign in, never impersonate one.
 *
 * Challenges are kept in a short-lived signed cookie rather than server state.
 * A challenge only has to survive the round trip between "give me options" and
 * "here's my signature", and signing it means the server can trust it came
 * from us without storing anything. Bound to a purpose string so a challenge
 * issued for enrolment can't be replayed against the login endpoint.
 */
import { list, put } from '@vercel/blob';
import crypto from 'node:crypto';

const PATH = 'security/passkeys.json';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/* ------------------------------------------------------------ relying party */

/** The RP ID must be the site's registered domain — NOT the full origin. */
export function rpID(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'cognak.com');
  return host.split(':')[0];
}

export function origin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'cognak.com');
  const proto = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return proto + '://' + host;
}

/* ------------------------------------------------------------- credentials */

export async function loadCredentials() {
  try {
    const { blobs } = await list({ prefix: PATH, limit: 1 });
    if (!blobs.length) return [];
    const data = await fetch(blobs[0].url, { cache: 'no-store' }).then((r) => r.json());
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

export async function saveCredentials(creds) {
  await put(PATH, JSON.stringify(creds), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
}

/**
 * True once at least one passkey exists AND the break-glass switch is off.
 * When this is true the password stops being sufficient on its own — that's
 * the whole point, otherwise the password remains the weakest way in and
 * adding a passkey has bought nothing.
 *
 * ADMIN_PASSWORD_FALLBACK=1 in Vercel re-enables password login. That's the
 * escape hatch for a lost or dead device: you own the Vercel project, so you
 * can always flip it, and flipping it requires an account an attacker on the
 * public endpoint doesn't have.
 */
export async function passkeyRequired() {
  if (process.env.ADMIN_PASSWORD_FALLBACK === '1') return false;
  const creds = await loadCredentials();
  return creds.length > 0;
}

/* -------------------------------------------------------------- challenges */

function sign(value) {
  return crypto
    .createHmac('sha256', process.env.ADMIN_SECRET || '')
    .update(value)
    .digest('base64url');
}

const CHALLENGE_COOKIE = 'cognak_wa';

export function challengeCookie(challenge, purpose) {
  const payload = Buffer.from(
    JSON.stringify({ c: challenge, p: purpose, exp: Date.now() + CHALLENGE_TTL_MS })
  ).toString('base64url');
  return [
    CHALLENGE_COOKIE + '=' + payload + '.' + sign(payload),
    'HttpOnly',
    'Secure',
    // Lax, not Strict: the authenticator ceremony can bounce through platform
    // UI, and Strict has been observed to drop the cookie on the return leg.
    'SameSite=Lax',
    'Path=/',
    'Max-Age=' + Math.floor(CHALLENGE_TTL_MS / 1000),
  ].join('; ');
}

export function clearChallengeCookie() {
  return CHALLENGE_COOKIE + '=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
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

/** Returns the challenge string, or null if missing/tampered/expired/wrong purpose. */
export function readChallenge(req, purpose) {
  const raw = parseCookies(req.headers.cookie)[CHALLENGE_COOKIE];
  if (!raw || raw.indexOf('.') === -1) return null;
  const [payload, sig] = raw.split('.');
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(sig || '');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.p !== purpose) return null;
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return null;
    return data.c;
  } catch (e) {
    return null;
  }
}
