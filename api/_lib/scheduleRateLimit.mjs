/**
 * Lightweight blob-backed rate limit for the public /schedule booking form.
 * Not trying to be rateLimit.mjs's login-lockout machinery (this isn't a
 * security boundary, just abuse control on a public form that writes real
 * calendar events) — one counter per IP, one window, no escalating tiers.
 *
 * Limit: 8 booking attempts per IP per hour.
 */
import { list, put } from '@vercel/blob';
import { clientIp } from './rateLimit.mjs';
import crypto from 'node:crypto';

const PATH = 'security/schedule-attempts.json';
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 8;

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex').slice(0, 24);
}

async function readState() {
  try {
    const { blobs } = await list({ prefix: PATH, limit: 1 });
    if (!blobs.length) return {};
    return await fetch(blobs[0].url, { cache: 'no-store' }).then((r) => r.json());
  } catch (e) {
    return {};
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

/** -> { allowed: true } | { allowed: false, retryAfterSec } */
export async function checkAndRecordAttempt(req) {
  const now = Date.now();
  const state = await readState();
  const key = hashIp(clientIp(req));

  const rec = state[key];
  const fresh = !rec || now - rec.first > WINDOW_MS;
  const next = fresh ? { n: 1, first: now } : { n: rec.n + 1, first: rec.first };
  state[key] = next;

  // Prune stale entries opportunistically so the blob doesn't grow forever.
  for (const [k, v] of Object.entries(state)) {
    if (now - v.first > WINDOW_MS) delete state[k];
  }
  state[key] = next;

  try { await writeState(state); } catch (e) { /* fail open: don't block booking on a blob hiccup */ }

  if (next.n > MAX_PER_IP) {
    return { allowed: false, retryAfterSec: Math.ceil((next.first + WINDOW_MS - now) / 1000) };
  }
  return { allowed: true };
}
