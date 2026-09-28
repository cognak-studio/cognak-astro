/**
 * api/_lib/sitimeAuth.mjs — who may edit the SiTime image tool.
 *
 * Two kinds of editor:
 *   admin  Pierce's site-wide admin session (adminAuth.mjs). Everything.
 *   team   Michael, Ace, anyone Pierce gives the TEAM passcode to. A signed
 *          cookie scoped to the SiTime endpoints ONLY: it does not satisfy
 *          requireAdmin, so it never opens /send, deliveries or clients.
 *          Team can pick images, upload and generate (capped per day),
 *          and make and manage batches (Pierce, 9/27); internal batches,
 *          the passcodes and settings stay admin-only (enforced in
 *          sitime-state.js, not just hidden in the page).
 *
 *   client SiTime's own people (Pierce, 9/25), on a SEPARATE passcode:
 *          same rights as team (pick, upload, generate within the shared
 *          cap, add pages and slots, review batches) but they never see
 *          COGNAK's internal reviews. Admin stays Pierce's.
 *
 * People (Pierce, 9/27): each person has their own record and their own
 * random passcode (sitime/users/<ms>.json, newest wins, the whole list in
 * one file; hashes never leave the server). The passcode alone signs them
 * in; the name on their record goes on everything they do. The cookie
 * carries the user id and a fingerprint of their hash, so a new passcode
 * or a deleted record signs that one person out. Admin adds, edits,
 * re-issues passcodes and removes people from the Settings tab.
 *
 * The older SHARED passcodes (one per role) still work as a fallback:
 * whoever uses one types a name at sign-in, as before. They are set from
 * the admin page and stored as a salted hash under sitime/team/<ms>.json
 * and sitime/client/<ms>.json (newest wins, never overwritten -- same rule
 * as sitimeStore). Their cookie carries a fingerprint of that hash, so
 * changing a shared passcode signs everyone on it out.
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
const CLIENT_DIR = 'sitime/client/';
const USERS_DIR = 'sitime/users/';
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
export async function readClient() { return (await newestJson(CLIENT_DIR)) || { hash: '' }; }
export async function setTeamPass(pass, which) {
  const p = String(pass || '').trim();
  const salt = crypto.randomBytes(8).toString('hex');
  await putJson(which === 'client' ? CLIENT_DIR : TEAM_DIR, { hash: p ? salt + ':' + sha(salt + p) : '' });
}
export function passMatches(team, pass) {
  if (!team.hash) return false;
  const [salt, h] = team.hash.split(':');
  const a = Buffer.from(sha(salt + String(pass || '').trim()));
  const b = Buffer.from(h || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const fp = (team) => sha(team.hash || '').slice(0, 16);

/* ---- people, each with their own passcode ---- */
const PASS_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';   // no 0/o, 1/l/i: typed from an email, not remembered
const normPass = (pass) => String(pass || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function newPasscode() {
  const b = crypto.randomBytes(12); let out = '';
  for (let i = 0; i < 12; i++) { out += PASS_ALPHABET[b[i] % PASS_ALPHABET.length]; if (i === 3 || i === 7) out += '-'; }
  return out;
}
const hashPass = (pass) => { const salt = crypto.randomBytes(8).toString('hex'); return salt + ':' + sha(salt + normPass(pass)); };
function userMatches(u, pass) {
  if (!u || !u.hash) return false;
  const [salt, h] = u.hash.split(':');
  const a = Buffer.from(sha(salt + normPass(pass))); const b = Buffer.from(h || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cleanName = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 60);
const cleanEmail = (v) => String(v || '').trim().slice(0, 120);
const cleanRole = (v) => (v === 'team' ? 'team' : 'client');
export async function readUsers() { const r = await newestJson(USERS_DIR); return (r && Array.isArray(r.users)) ? r.users : []; }
async function writeUsers(users) { await putJson(USERS_DIR, { users }); }
/** What the admin page sees: never the hash. */
export const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email || '', role: u.role, createdAt: u.createdAt || null, passAt: u.passAt || null, lastAt: u.lastAt || null });
export async function addUser(fields) {
  const name = cleanName(fields.name); if (!name) return { error: 'A name is needed.' };
  const users = await readUsers();
  const id = 'u' + crypto.randomBytes(5).toString('hex');
  const passcode = newPasscode(); const now = Date.now();
  const u = { id, name, email: cleanEmail(fields.email), role: cleanRole(fields.role), hash: hashPass(passcode), createdAt: now, passAt: now, lastAt: null };
  await writeUsers(users.concat([u]));
  return { user: publicUser(u), passcode };
}
export async function editUser(id, fields) {
  const users = await readUsers(); const u = users.find((x) => x.id === id);
  if (!u) return { error: 'No such person.' };
  if ('name' in fields) { const name = cleanName(fields.name); if (!name) return { error: 'A name is needed.' }; u.name = name; }
  if ('email' in fields) u.email = cleanEmail(fields.email);
  if ('role' in fields) u.role = cleanRole(fields.role);
  await writeUsers(users);
  return { user: publicUser(u) };
}
/** New random passcode; their current session ends (the cookie fingerprint no longer matches). */
export async function resetUserPass(id) {
  const users = await readUsers(); const u = users.find((x) => x.id === id);
  if (!u) return { error: 'No such person.' };
  const passcode = newPasscode(); u.hash = hashPass(passcode); u.passAt = Date.now();
  await writeUsers(users);
  return { user: publicUser(u), passcode };
}
export async function deleteUser(id) {
  const users = await readUsers();
  if (!users.some((x) => x.id === id)) return { error: 'No such person.' };
  await writeUsers(users.filter((x) => x.id !== id));
  return { ok: true };
}

/* ---- cookie ---- */
const sealed = (obj) => { const payload = Buffer.from(JSON.stringify({ ...obj, exp: Date.now() + SESSION_MS })).toString('base64url'); return [COOKIE + '=' + payload + '.' + hmac(payload), 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=' + Math.floor(SESSION_MS / 1000)].join('; '); };
/** Shared-passcode session (legacy): the typed name travels in the cookie. */
export function teamCookie(name, team, role) { return sealed({ name, role: role === 'client' ? 'client' : 'team', fp: fp(team) }); }
/** Personal session: the id and a fingerprint of that person's passcode hash. */
export function userCookie(u) { return sealed({ uid: u.id, role: cleanRole(u.role), fp: fp(u) }); }
export const clearTeamCookie = () => COOKIE + '=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';

function readCookie(req) {
  const raw = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  if (!raw || !secret()) return null;
  const [payload, sig] = decodeURIComponent(raw.slice(COOKIE.length + 1)).split('.');
  const want = Buffer.from(hmac(payload || '')); const got = Buffer.from(sig || '');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try { const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}

/** { role: 'admin' | 'team' | 'client', name, uid? } or null. Sessions die when their passcode changes or their record is removed. */
export async function sitimeEditor(req) {
  if (isAdmin(req)) return { role: 'admin', name: 'Pierce' };
  const c = readCookie(req);
  if (!c) return null;
  if (c.uid) {
    const u = (await readUsers()).find((x) => x.id === c.uid);
    if (!u || !u.hash || c.fp !== fp(u)) return null;
    return { role: cleanRole(u.role), name: u.name, uid: u.id, email: u.email || '' };
  }
  const role = c.role === 'client' ? 'client' : 'team';
  const rec = role === 'client' ? await readClient() : await readTeam();
  if (!rec.hash || c.fp !== fp(rec)) return null;
  return { role, name: String(c.name || (role === 'client' ? 'SiTime' : 'Team')).slice(0, 40) };
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
  /* Personal passcodes first: the passcode alone says who this is. */
  const users = await readUsers();
  const u = users.find((x) => userMatches(x, pass));
  if (u) {
    u.lastAt = now;
    try { await writeUsers(users); } catch (e) {}
    return { ok: true, cookie: userCookie(u), name: u.name, role: cleanRole(u.role) };
  }
  const team = await readTeam(); const client = await readClient();
  if (!team.hash && !client.hash && !users.length) return { ok: false, status: 403, error: 'Access is off. Ask Pierce for a passcode.' };
  /* Shared passcodes (older): the person types a name so edits and decisions carry it. */
  const nm = cleanName(name).slice(0, 40);
  const sharedRole = passMatches(team, pass) ? 'team' : passMatches(client, pass) ? 'client' : null;
  if (sharedRole && !nm) return { ok: false, status: 400, needName: true, error: 'This is a shared passcode. Add your name so edits show who made them.' };
  if (sharedRole === 'team') return { ok: true, cookie: teamCookie(nm, team, 'team'), name: nm, role: 'team' };
  if (sharedRole === 'client') return { ok: true, cookie: teamCookie(nm, client, 'client'), name: nm, role: 'client' };
  {
    ips[k] = ips[k] || { n: 0, first: now }; ips[k].n++;
    try { await putJson(ATTEMPT_DIR, { ips }); } catch (e) {}
    return { ok: false, status: 401, error: 'That passcode isn’t right.' };
  }
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
