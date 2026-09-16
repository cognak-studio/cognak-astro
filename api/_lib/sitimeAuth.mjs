/**
 * api/_lib/sitimeAuth.mjs — who may edit the SiTime image tool.
 *
 * Two kinds of editor:
 *   admin  Pierce's site-wide admin session (adminAuth.mjs). Everything.
 *   team   Michael, Ace, anyone Pierce gives the TEAM passcode to. A signed
 *          cookie scoped to the SiTime endpoints ONLY: it does not satisfy
 *          requireAdmin, so it never opens /send, deliveries or clients.
 *          Team can pick images, upload and generate (capped per day);
 *          batches and the passcodes stay admin-only (enforced in
 *          sitime-state.js, not just hidden in the page).
 *
 * The team passcode is set from the admin page and stored as a salted hash
 * under sitime/team/<ms>.json (newest wins, never overwritten -- same rule as
 * sitimeStore). The cookie carries a fingerprint of that hash, so changing
 * the passcode signs every team member out.
 *
 * Failed team logins are counted in their own file, separate from the admin
 * limiter, so someone guessing the team passcode can never lock Pierce out
 * of /send.
 */
import crypto from 'node:crypto';
import { put, list } from '@vercel/blob';
import { isAdmin } from './adminAuth.mjs';
import { clientIp } from './rateLimit.mjs';

const COOKIE = 'cognak_sitime';
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const TEAM_DIR = 'sitime/team/';
const ATTEMPT_DIR = 'sitime/team-attempts/';
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
export const TEAM_GEN_PER_DAY = 40;

const secret = () => process.env.ADMIN_SECRET || '';
const hmac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function newestJson(prefix) {
  const out = []; let cursor;
  do { const p = await list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) }); out.push(...p.blobs); cursor = p.hasMore ? p.cursor : null; } while (cursor);
  const b = out.filter((x) => /\/\d{13}\.json$/.test(x.pathname)).sort((a, c) => (a.pathname < c.pathname ? 1 : -1))[0];
  if (!b) return null;
  const r = await fetch(b.url + '?_=' + Date.now(), { cache: 'no-store' });
  return r.ok ? r.json() : null;
}
async function putJson(prefix, obj) {
  const at = Date.now();
  await put(prefix + at + '.json', JSON.stringify({ ...obj, at }), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 0 });
}

/* ---- the team passcode ---- */
export async function readTeam() { return (await newestJson(TEAM_DIR)) || { hash: '' }; }
export async function setTeamPass(pass) {
  const p = String(pass || '').trim();
  const salt = crypto.randomBytes(8).toString('hex');
  await putJson(TEAM_DIR, { hash: p ? salt + ':' + sha(salt + p) : '' });
}
function passMatches(team, pass) {
  if (!team.hash) return false;
  const [salt, h] = team.hash.split(':');
  const a = Buffer.from(sha(salt + String(pass || '').trim()));
  const b = Buffer.from(h || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const fp = (team) => sha(team.hash || '').slice(0, 16);

/* ---- cookie ---- */
export function teamCookie(name, team) {
  const payload = Buffer.from(JSON.stringify({ name, fp: fp(team), exp: Date.now() + SESSION_MS })).toString('base64url');
  return [COOKIE + '=' + payload + '.' + hmac(payload), 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=' + Math.floor(SESSION_MS / 1000)].join('; ');
}
export const clearTeamCookie = () => COOKIE + '=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';

function readCookie(req) {
  const raw = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  if (!raw || !secret()) return null;
  const [payload, sig] = decodeURIComponent(raw.slice(COOKIE.length + 1)).split('.');
  const want = Buffer.from(hmac(payload || '')); const got = Buffer.from(sig || '');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try { const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}

/** { role: 'admin' | 'team', name } or null. Team sessions die when the passcode changes. */
export async function sitimeEditor(req) {
  if (isAdmin(req)) return { role: 'admin', name: 'Pierce' };
  const c = readCookie(req);
  if (!c) return null;
  const team = await readTeam();
  if (!team.hash || c.fp !== fp(team)) return null;
  return { role: 'team', name: String(c.name || 'Team').slice(0, 40) };
}
/** Sends the 401 itself and returns null when nobody is signed in. */
export async function requireEditor(req, res) {
  const who = await sitimeEditor(req);
  if (!who) res.status(401).json({ error: 'Not signed in.' });
  return who;
}

/* ---- login limiter (per IP, own file) ---- */
const ipKey = (req) => sha(String(clientIp(req)) + secret()).slice(0, 24);
export async function teamLogin(req, name, pass) {
  const now = Date.now();
  const rec = (await newestJson(ATTEMPT_DIR)) || { ips: {} };
  const ips = rec.ips || {};
  Object.keys(ips).forEach((k) => { if (now - ips[k].first > WINDOW_MS) delete ips[k]; });
  const k = ipKey(req);
  if (ips[k] && ips[k].n >= MAX_FAILS) return { ok: false, status: 429, error: 'Too many tries. Wait 15 minutes.' };
  const team = await readTeam();
  if (!team.hash) return { ok: false, status: 403, error: 'Team access is off. Ask Pierce for the passcode.' };
  if (!passMatches(team, pass)) {
    ips[k] = ips[k] || { n: 0, first: now }; ips[k].n++;
    try { await putJson(ATTEMPT_DIR, { ips }); } catch (e) {}
    return { ok: false, status: 401, error: 'That passcode isn’t right.' };
  }
  return { ok: true, cookie: teamCookie(String(name || '').trim().slice(0, 40) || 'Team', team) };
}

/* ---- generate cap for team ---- */
export async function teamGenerationsToday() {
  const day = new Date().toISOString().slice(0, 10);
  const { blobs } = await list({ prefix: 'sitime/gen-log/' + day + '/', limit: 1000 });
  return { day, n: blobs.length };
}
export async function logGeneration(who, count) {
  const day = new Date().toISOString().slice(0, 10);
  await Promise.all(Array.from({ length: count }, (_, i) => put('sitime/gen-log/' + day + '/' + Date.now() + '-' + i + '.json', JSON.stringify({ by: who.name }), { access: 'public', addRandomSuffix: true, contentType: 'application/json' })));
}
