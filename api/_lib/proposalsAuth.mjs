/**
 * Proposal access for /proposals (2026-09-29). One passcode per proposal, no
 * username: the passcode is the credential, and it unlocks only the proposal
 * it belongs to. A signed-in /admin session sees every proposal.
 *
 * Passcodes are never stored: each proposal carries a scrypt hash + salt in
 * api/_lib/proposals/index.mjs. Make a new one with:
 *   node -e 'const c=require("crypto"),p="xxxx-xxxx-xxxx",s=c.randomBytes(16).toString("hex");console.log(s,c.scryptSync(p,s,32).toString("hex"))'
 *
 * Session = cognak_proposals cookie, HMAC-SHA256 with ADMIN_SECRET under its
 * own purpose prefix (so it can never pass as the admin or SiTime cookie).
 * Payload lists the slugs this browser has unlocked; entering a second
 * passcode adds to the list.
 */
import crypto from 'node:crypto';
import { isAdmin } from './adminAuth.mjs';
import { PROPOSALS } from './proposals/index.mjs';

const COOKIE = 'cognak_proposals';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(b64) {
  return crypto.createHmac('sha256', process.env.ADMIN_SECRET || '').update('proposals-session:' + b64).digest('base64url');
}

function cookies(header) {
  const out = {};
  (header || '').split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i === -1) return;
    out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

function sessionSlugs(req) {
  if (!process.env.ADMIN_SECRET) return [];
  const token = cookies(req.headers.cookie)[COOKIE];
  if (!token || token.indexOf('.') === -1) return [];
  const [b64, sig] = token.split('.');
  const expected = Buffer.from(sign(b64));
  const actual = Buffer.from(sig || '');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return [];
  try {
    const p = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (p.kind !== 'proposals' || typeof p.exp !== 'number' || p.exp <= Date.now() || !Array.isArray(p.slugs)) return [];
    return p.slugs.filter((s) => typeof s === 'string');
  } catch (e) {
    return [];
  }
}

export function sessionCookie(slugs) {
  const b64 = Buffer.from(JSON.stringify({ kind: 'proposals', slugs, exp: Date.now() + SESSION_MS })).toString('base64url');
  return [COOKIE + '=' + b64 + '.' + sign(b64), 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=' + Math.floor(SESSION_MS / 1000)].join('; ');
}

export function clearCookie() {
  return COOKIE + '=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}

/** The proposals this request may read. Admin sees all. */
export function allowed(req) {
  const admin = isAdmin(req);
  const mine = new Set(sessionSlugs(req));
  return { admin, slugs: PROPOSALS.filter((p) => admin || mine.has(p.slug)).map((p) => p.slug) };
}

/** Slug of the proposal this passcode opens, or null. Checks every entry (no early exit). */
export function matchPasscode(candidate) {
  const pass = String(candidate || '').trim().toLowerCase();
  let hit = null;
  for (const p of PROPOSALS) {
    const got = crypto.scryptSync(pass, p.salt, 32);
    const want = Buffer.from(p.hash, 'hex');
    if (got.length === want.length && crypto.timingSafeEqual(got, want) && !hit) hit = p.slug;
  }
  return hit;
}

export { sessionSlugs };
