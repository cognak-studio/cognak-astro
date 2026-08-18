/**
 * api/_lib/manifest.mjs — the shape of a delivery share, in one place.
 *
 * A share IS its manifest; there is no other database. Two endpoints write
 * one: api/deliver-create.js mints a new share, api/deliver-update.js
 * rewrites an existing one after Pierce edits it on /send. Both have to agree
 * exactly on what a valid token, file entry and blob URL look like, and a
 * divergence between them wouldn't be a cosmetic inconsistency — it would be
 * a hole in whichever endpoint got the laxer copy. So the rules live here and
 * neither endpoint keeps a private version of them.
 *
 * (Storage — where the manifest is written and how it's read back without
 * going stale — is api/_lib/manifestStore.mjs. This file is only validation.)
 */

/** /send mints 10 chars (~49 bits); reject anything shorter. */
export const TOKEN_RE = /^[a-zA-Z0-9]{10,32}$/;

/* Thumbnails are always deliveries/<token>/thumbs/<key>.jpg, so they're
   short. File URLs carry the filename in the path, and a filename can run to
   300 characters before percent-encoding triples it. */
const MAX_THUMB_URL = 500;
const MAX_FILE_URL = 1200;

/** One send can carry this many files; beyond it the extras are dropped. */
export const MAX_FILES = 200;

/**
 * Every URL that reaches a manifest ends up in an <img src> or an <a href> on
 * /receive — a page we serve, on our own origin. A URL from anywhere else
 * would therefore be an arbitrary destination of someone else's choosing
 * rendered under cognak.com, so the HOST is checked, not just the protocol.
 *
 * Fails closed and returns null: callers read that as "no preview for this
 * file" (harmless — /receive falls back to its extension tile) or, for the
 * file URL itself, "don't accept this file at all".
 */
export function cleanBlobUrl(v, maxLength = MAX_THUMB_URL) {
  if (typeof v !== 'string' || v.length > maxLength) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:') return null;
    if (!/(^|\.)blob\.vercel-storage\.com$/.test(u.hostname)) return null;
    return u.href;
  } catch (e) {
    return null;
  }
}

/** Client name / project line. Both are capped and trimmed the same way. */
export function cleanText(v, fallback = '') {
  const s = String(v == null ? '' : v).trim().slice(0, 200);
  return s || fallback;
}

/**
 * The subset of a manifest that a list view is allowed to see — one row of
 * /send's "Recent shares". Shared by api/deliver-list.js (all rows) and
 * api/deliver-update.js (the one row that just changed, returned so the
 * dashboard can repaint it without waiting on a re-list).
 */
export function shareSummary(m) {
  const files = Array.isArray(m.files) ? m.files : [];
  return {
    token: m.token,
    client: m.client,
    avatarUrl: m.avatarUrl || null,
    project: m.project || '',
    createdAt: m.createdAt,
    expiresAt: m.expiresAt || null,
    fileCount: files.length,
    /* Names only — /send lists them as subtext under each share so a send is
       identifiable without opening it. Deliberately NOT the full file
       objects: the blob URLs are the actual payload and there's no reason to
       hand those to a list view. (The editor on /send does need them, and
       gets them the same way /receive does, from api/deliver-get.js by
       token.) Capped at 40 so one enormous send can't bloat the response. */
    fileNames: files.slice(0, 40).map((f) => String(f.name || '')),
    totalSize: files.reduce((sum, f) => sum + (Number(f.size) || 0), 0),
    /* Set once, on the client's first download click (see
       api/deliver-track-download.js) — /send uses this to show a "has this
       client opened anything yet" dot per share. */
    downloadedAt: m.downloadedAt || null,
  };
}

/**
 * Turn the browser's `files` array into manifest entries, dropping anything
 * that doesn't validate rather than failing the whole save.
 *
 * `trusted` is the set of URLs already stored in this share's manifest, and
 * only deliver-update passes it. It exists so that a file which was accepted
 * when the share was created can never be dropped on edit by a rule tightened
 * afterwards — a copy-edit to the description must not quietly delete a file
 * the client can already see. Everything NOT in that set has to be a URL in
 * our own Blob store, which for an edit means a file just uploaded into this
 * share's own prefix.
 */
export function normalizeFiles(raw, trusted) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const f of raw) {
    if (!f || !f.url || !f.name) continue;
    const url = String(f.url);
    if (seen.has(url)) continue; // same blob listed twice = one row, not two
    const known = !!(trusted && trusted.has(url));
    if (!known && !cleanBlobUrl(url, MAX_FILE_URL)) continue;
    seen.add(url);
    const thumbUrl = cleanBlobUrl(f.thumbUrl);
    out.push({
      name: String(f.name).slice(0, 300),
      url,
      size: Number(f.size) || 0,
      ...(thumbUrl ? { thumbUrl } : {}),
    });
    if (out.length >= MAX_FILES) break;
  }
  return out;
}
