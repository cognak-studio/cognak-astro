/**
 * Blob-backed login rate limiter.
 *
 * The only thing in front of every client delivery is one shared password, and
 * until now the only defence against grinding it was a fixed 400ms delay — so
 * roughly two guesses a second, forever, from as many IPs as you like. This
 * closes that.
 *
 * State lives in a single small JSON blob rather than a database: logins are
 * rare, so one read + one conditional write per attempt is affordable, and it
 * keeps the whole feature dependency-free. Two independent limits:
 *
 *   per-IP    5 failures in 15 min -> locked 15 min; 10 -> locked 1 hour.
 *   global   20 failures in 15 min -> everyone locked out 15 min.
 *
 * The global limit is the one that matters against a botnet, where per-IP
 * counting is useless because no single address ever gets to five. It's a
 * deliberate tradeoff: an attacker can lock the real admin out for 15 minutes.
 * That's a far better failure than letting them keep guessing, and the window
 * is short enough to wait out.
 *
 * IPs are stored as a salted hash, never in the clear — this file is a security
 * control, not an access log, and it shouldn't quietly become one.
 */
import { list, put, del } from '@vercel/blob';
import crypto from 'node:crypto';

const PATH = 'security/login-attempts.json';
const WINDOW_MS = 15 * 60 * 1000;
const IP_SOFT = 5;
const IP_HARD = 10;
const GLOBAL_MAX = 20;
const LOCK_SHORT_MS = 15 * 60 * 1000;
const LOCK_LONG_MS = 60 * 60 * 1000;

function hashIp(ip) {
  return crypto
    .createHash('sha256')
    .update(String(ip || 'unknown') + (process.env.ADMIN_SECRET || ''))
    .digest('hex')
    .slice(0, 24);
}

/** Vercel sits behind a proxy, so the socket address is useless. */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
}

async function readState() {
  try {
    const { blobs } = await list({ prefix: PATH, limit: 1 });
    if (!blobs.length) return { ips: {}, global: { n: 0, first: 0 }, lockedUntil: 0 };
    // cache:'no-store' matters: Blob URLs are CDN-cached, and a stale read here
    // would silently reset the counter an attacker is supposed to be tripping.
    const s = await fetch(blobs[0].url, { cache: 'no-store' }).then((r) => r.json());
    return s && typeof s === 'object' ? s : { ips: {}, global: { n: 0, first: 0 }, lockedUntil: 0 };
  } catch (e) {
    return { ips: {}, global: { n: 0, first: 0 }, lockedUntil: 0 };
  }
}

async function writeState(state) {
  await put(PATH, JSON.stringify(state), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
}

function prune(state, now) {
  for (const [k, v] of Object.entries(state.ips || {})) {
    const done = (!v.until || v.until <= now) && (!v.first || now - v.first > WINDOW_MS);
    if (done) delete state.ips[k];
  }
  if (state.global && state.global.first && now - state.global.first > WINDOW_MS) {
    state.global = { n: 0, first: 0 };
  }
  if (state.lockedUntil && state.lockedUntil <= now) state.lockedUntil = 0;
}

/**
 * Call BEFORE checking the password.
 * -> { allowed: true } | { allowed: false, retryAfterSec, scope }
 */
export async function checkLoginAllowed(req) {
  const now = Date.now();
  const state = await readState();
  prune(state, now);

  if (state.lockedUntil && state.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((state.lockedUntil - now) / 1000), scope: 'global' };
  }
  const rec = (state.ips || {})[hashIp(clientIp(req))];
  if (rec && rec.until && rec.until > now) {
    return { allowed: false, retryAfterSec: Math.ceil((rec.until - now) / 1000), scope: 'ip' };
  }
  return { allowed: true };
}

/** Call AFTER a failed password check. */
export async function recordFailure(req) {
  const now = Date.now();
  const state = await readState();
  prune(state, now);
  state.ips = state.ips || {};
  state.global = state.global || { n: 0, first: 0 };

  const key = hashIp(clientIp(req));
  const rec = state.ips[key] || { n: 0, first: now, until: 0 };
  if (!rec.first || now - rec.first > WINDOW_MS) { rec.n = 0; rec.first = now; }
  rec.n += 1;
  if (rec.n >= IP_HARD) rec.until = now + LOCK_LONG_MS;
  else if (rec.n >= IP_SOFT) rec.until = now + LOCK_SHORT_MS;
  state.ips[key] = rec;

  if (!state.global.first || now - state.global.first > WINDOW_MS) {
    state.global = { n: 0, first: now };
  }
  state.global.n += 1;
  if (state.global.n >= GLOBAL_MAX) state.lockedUntil = now + LOCK_SHORT_MS;

  try { await writeState(state); } catch (e) { console.error('rateLimit write failed', e); }
}

/** Call after a SUCCESSFUL login — clears that IP so a typo isn't punished later. */
export async function clearFailures(req) {
  try {
    const now = Date.now();
    const state = await readState();
    prune(state, now);
    if (state.ips) delete state.ips[hashIp(clientIp(req))];
    await writeState(state);
  } catch (e) { /* non-fatal */ }
}

/** Wipes all rate-limit state. Only used by the admin "unlock" path. */
export async function resetAll() {
  try {
    const { blobs } = await list({ prefix: PATH, limit: 1 });
    if (blobs.length) await del(blobs.map((b) => b.url));
  } catch (e) { /* non-fatal */ }
}
