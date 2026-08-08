/**
 * Blob-backed rate limiter for the PUBLIC, unauthenticated upload handshake
 * (api/upload.js — the /brief "existing materials" uploader).
 *
 * Deliberately SEPARATE state file and limits from the login limiter
 * (api/_lib/rateLimit.mjs): an upload flood must never trip the admin-login
 * lockout, and a login attack must never throttle a real client's brief. The
 * two controls are unrelated and share nothing but the hashing salt.
 *
 * Two independent limits, sliding 1-hour window:
 *   per-IP   30 uploads / hour
 *   global  300 uploads / hour   (botnet backstop — one IP never reaches 30)
 *
 * "One upload" = one token-minting handshake (onBeforeGenerateToken), NOT the
 * file bytes, which never pass through the function. IPs are stored as a
 * salted hash, never in the clear — same as the login limiter.
 *
 * Fails OPEN on any storage error: this is abuse control, not an access
 * control, so a Blob hiccup must never block a legitimate client's upload.
 */
import { list, put } from '@vercel/blob';
import crypto from 'node:crypto';

const PATH = 'security/upload-attempts.json';
const WINDOW_MS = 60 * 60 * 1000;
const IP_MAX = 30;
const GLOBAL_MAX = 300;

function hashIp(ip) {
  return crypto
    .createHash('sha256')
    .update(String(ip || 'unknown') + (process.env.ADMIN_SECRET || ''))
    .digest('hex')
    .slice(0, 24);
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
}

async function readState() {
  const { blobs } = await list({ prefix: PATH, limit: 1 });
  if (!blobs.length) return { ips: {}, global: { n: 0, first: 0 } };
  const s = await fetch(blobs[0].url, { cache: 'no-store' }).then((r) => r.json());
  return s && typeof s === 'object' ? s : { ips: {}, global: { n: 0, first: 0 } };
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

function windowExpired(rec, now) {
  return !rec || !rec.first || now - rec.first > WINDOW_MS;
}

/**
 * Check + record one upload slot in a single read-modify-write.
 * -> { ok: true } | { ok: false, retryAfterSec, scope }
 */
export async function takeUploadSlot(req) {
  const now = Date.now();
  let state;
  try {
    state = await readState();
  } catch (e) {
    return { ok: true }; // fail open
  }
  state.ips = state.ips || {};
  state.global = state.global || { n: 0, first: 0 };

  if (windowExpired(state.global, now)) state.global = { n: 0, first: now };
  if (state.global.n >= GLOBAL_MAX) {
    return {
      ok: false,
      scope: 'global',
      retryAfterSec: Math.ceil((state.global.first + WINDOW_MS - now) / 1000),
    };
  }

  const key = hashIp(clientIp(req));
  let rec = state.ips[key];
  if (windowExpired(rec, now)) rec = { n: 0, first: now };
  if (rec.n >= IP_MAX) {
    return {
      ok: false,
      scope: 'ip',
      retryAfterSec: Math.ceil((rec.first + WINDOW_MS - now) / 1000),
    };
  }

  rec.n += 1;
  state.ips[key] = rec;
  state.global.n += 1;

  // Prune stale IP buckets so the blob can't grow without bound.
  for (const [k, v] of Object.entries(state.ips)) {
    if (!v || !v.first || now - v.first > WINDOW_MS) delete state.ips[k];
  }

  try { await writeState(state); } catch (e) { /* fail open */ }
  return { ok: true };
}
