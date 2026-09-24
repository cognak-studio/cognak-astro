/**
 * api/_lib/sitimeStore.mjs — storage for the SiTime image approval tool
 * (/workflow/sitime). Same rules as manifestStore.mjs, same reason: a Blob
 * overwrite at a fixed path can serve stale content for up to ~60s, so
 * nothing here is ever overwritten. Every write is a new file; every read
 * lists a prefix and takes the lexicographically newest.
 *
 * Two kinds of record:
 *
 *   sitime/state/<ms>.json
 *     The whole working state — pages, slots (with main/backup picks),
 *     batches, library index. Written ONLY by the admin page, which is one
 *     person, so a single versioned document is enough. Roughly 1MB.
 *
 *   sitime/decisions/<batchToken>/<ms>.json
 *     One file per decision the reviewer submits. Append-only, never
 *     merged into the state doc by the reviewer, so a reviewer clicking
 *     Approve at the same moment Pierce saves the admin page can never
 *     clobber anything. Readers reduce the events: newest event per
 *     (slotId, which) wins.
 *
 * Batch tokens are the credential for the review link, like a /files/<token>
 * share; anyone with the link can submit, which is how Pierce wants it
 * (SiTime decides as a group, one person clicks).
 */
import { put, list, del } from '@vercel/blob';

const STATE_DIR = 'sitime/state/';
/* Version history (Pierce, 9/24: "what if Michael deletes a bunch by
   accident"). Every save already writes a new file; retention used to keep
   only the newest 5, which at a 1.2s autosave is a few seconds of history.
   Now: the newest 30 always, everything from the last 48 hours, one per hour
   for 14 days, one per day for 90 days. Each save also drops an empty marker
   in LOG_DIR whose NAME carries who saved and the counts, so the history list
   is one listing call with no downloads. */
const LOG_DIR = 'sitime/state-log/';
const KEEP_NEWEST = 30;
const H = 3600e3, DAY = 24 * H;
const LOG_RE = /\/(\d{13})~p(\d+)~b(\d+)~l(\d+)~s(\d+)~t(\d+)~(.*)\.json$/;
const DECISION_DIR = (token) => 'sitime/decisions/' + token + '/';
const VERSION_RE = /\/(\d{13})\.json$/;

export const TOKEN_RE = /^[a-z0-9]{8,16}$/;

async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor);
  return out;
}

async function fetchJson(blob) {
  if (!blob) return null;
  const r = await fetch(blob.url + '?_=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) return null;
  const j = await r.json();
  return j && typeof j === 'object' ? j : null;
}

function newest(blobs) {
  return blobs
    .filter((b) => VERSION_RE.test(b.pathname))
    .sort((a, b) => (a.pathname < b.pathname ? 1 : -1))[0] || null;
}

/** Current admin state, or null before the first seed. */
export async function readState() {
  return fetchJson(newest(await listAll(STATE_DIR)));
}

/** Write a new version of the state. Returns { pathname, savedAt }. */
export async function writeState(state, by) {
  const savedAt = Date.now();
  const pathname = STATE_DIR + savedAt + '.json';
  await put(pathname, JSON.stringify({ ...state, savedAt, savedBy: by || '' }), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
  try {
    const slots = state.slots || [];
    const picks = slots.filter((s) => s.main).length;
    const batched = slots.filter((s) => s.batch).length;
    const who = String(by || '').replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 40) || 'unknown';
    const tag = [savedAt, 'p' + picks, 'b' + (state.batches || []).length, 'l' + (state.library || []).length, 's' + batched, 't' + (state.trash || []).length, who].join('~');
    await put(LOG_DIR + tag + '.json', '{}', { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  } catch (e) { /* history marker is best-effort */ }
  try { await pruneState(); } catch (e) { /* prune next time */ }
  return { pathname, savedAt };
}

function keepSet(times) {
  const now = Date.now(); const keep = new Set(); const hours = new Set(); const days = new Set();
  times.sort((a, b) => b - a).forEach((t, i) => {
    const age = now - t;
    if (i < KEEP_NEWEST || age < 2 * DAY) { keep.add(t); return; }
    if (age < 14 * DAY) { const k = Math.floor(t / H); if (!hours.has(k)) { hours.add(k); keep.add(t); } return; }
    if (age < 90 * DAY) { const k = Math.floor(t / DAY); if (!days.has(k)) { days.add(k); keep.add(t); } }
  });
  return keep;
}

async function pruneState() {
  const states = (await listAll(STATE_DIR)).filter((b) => VERSION_RE.test(b.pathname));
  const keep = keepSet(states.map((b) => Number(b.pathname.match(VERSION_RE)[1])));
  const drop = states.filter((b) => !keep.has(Number(b.pathname.match(VERSION_RE)[1]))).map((b) => b.url);
  const logs = (await listAll(LOG_DIR)).filter((b) => LOG_RE.test(b.pathname));
  const dropLogs = logs.filter((b) => !keep.has(Number(b.pathname.match(LOG_RE)[1]))).map((b) => b.url);
  const all = drop.concat(dropLogs);
  for (let i = 0; i < all.length; i += 500) await del(all.slice(i, i + 500));
}

/** Saved versions, newest first: [{ savedAt, by, picks, batches, library, batched, trash }]. */
export async function stateHistory() {
  const have = new Set((await listAll(STATE_DIR)).map((b) => (b.pathname.match(VERSION_RE) || [])[1]).filter(Boolean));
  return (await listAll(LOG_DIR))
    .map((b) => b.pathname.match(LOG_RE)).filter(Boolean)
    .filter((m) => have.has(m[1]))
    .map((m) => ({ savedAt: Number(m[1]), picks: +m[2], batches: +m[3], library: +m[4], batched: +m[5], trash: +m[6], by: m[7] }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

/** One stored version by its savedAt, or null. */
export async function readStateAt(savedAt) {
  const want = STATE_DIR + String(Number(savedAt)) + '.json';
  const hit = (await listAll(STATE_DIR)).find((b) => b.pathname === want);
  return fetchJson(hit);
}

/** Append one reviewer decision to a batch. */
export async function writeDecision(token, decision) {
  const at = Date.now();
  const pathname = DECISION_DIR(token) + at + '.json';
  await put(pathname, JSON.stringify({ ...decision, at }), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
  return { pathname, at };
}

/**
 * All decisions for a batch, reduced: newest per (slotId, which).
 * Returns { events, latest: { [slotId]: { main: ev, backup: ev } } }.
 */
export async function readDecisions(token) {
  const blobs = (await listAll(DECISION_DIR(token)))
    .filter((b) => VERSION_RE.test(b.pathname))
    .sort((a, b) => (a.pathname < b.pathname ? -1 : 1));
  const events = (await Promise.all(blobs.map(fetchJson))).filter(Boolean);
  const latest = {};
  for (const ev of events) {
    if (!ev.slotId) continue;
    if (!latest[ev.slotId]) latest[ev.slotId] = {};
    latest[ev.slotId][ev.which || 'main'] = ev;
  }
  return { events, latest };
}

/** Decisions for every batch in one pass (admin dashboard). */
export async function readAllDecisions(tokens) {
  const out = {};
  await Promise.all(tokens.map(async (t) => { out[t] = await readDecisions(t); }));
  return out;
}

/** Outcome of a slot inside a batch. Same rule as resolveOutcome() in
 * admin.astro and review.astro -- keep the three in step. */
export function slotOutcome(latestForSlot, hasBackup = true) {
  const m = latestForSlot && latestForSlot.main;
  const b = latestForSlot && latestForSlot.backup;
  const r = resolveOutcome(m, b, hasBackup);
  return { outcome: r.outcome, via: r.which };
}

/* One rule for a slot's outcome, shared verbatim by admin.astro,
     review.astro and sitimeStore.mjs. Either image can be decided at any
     time (the reviewer can flip to the backup before denying the main):
     - any approve wins; if both are approved, the newest one
     - otherwise any hold wins, newest first
     - denied only once every image is denied (main, and backup if any)
     - otherwise pending, on the main unless the main is denied */
  function resolveOutcome(m, b, hasBackup) {
    const at = (e) => Number(e && e.at) || 0;
    const evs = [m && { w: 'main', e: m }, hasBackup && b && { w: 'backup', e: b }].filter(Boolean);
    const top = (d) => evs.filter((x) => x.e.decision === d).sort((x, y) => at(y.e) - at(x.e))[0];
    const ap = top('approve'); if (ap) return { outcome: 'approved', which: ap.w, ev: ap.e };
    const ho = top('hold'); if (ho) return { outcome: 'held', which: ho.w, ev: ho.e };
    const mDen = !!(m && m.decision === 'deny');
    const bDen = !hasBackup || !!(b && b.decision === 'deny');
    const de = top('deny');
    if (mDen && bDen) return { outcome: 'denied', which: de.w, ev: de.e };
    return { outcome: 'pending', which: mDen ? 'backup' : 'main', ev: de ? de.e : null };
  }
