/**
 * api/_lib/manifestStore.mjs — how a delivery manifest is stored and read back.
 *
 * WHY VERSIONED FILES, NOT ONE manifest.json: Vercel Blob overwrites at a
 * fixed pathname can take up to ~60s to propagate. A read moments after a
 * write can return the OLD content even with a cache-busting query, because
 * the staleness is propagation, not just CDN caching. This repo already paid
 * for that lesson once — see api/_lib/clientsIndex.mjs and the "DuVine isn't
 * saving" bug of 2026-08-08, where two saves a second apart silently dropped
 * the first.
 *
 * That was survivable while a manifest was only ever written ONCE, at
 * creation. It stopped being survivable when /send learned to edit a share
 * after sending it (api/deliver-update.js): editing is read-modify-write, so
 * with a fixed path, adding a file and then fixing a typo a moment later
 * would read a pre-edit base and quietly revert the file. And /receive would
 * go on serving the old file list for a minute after a save, which reads as
 * "the edit didn't work" and invites a second, conflicting edit.
 *
 * So each write goes to a NEW path, deliveries/<token>/manifest/<ms>.json,
 * and a read lists that prefix and fetches the lexicographically-latest one.
 * Content at a given path never changes, so a fetched file can never be
 * stale; the only lag left is list() visibility of a brand-new file, which is
 * far tighter than overwrite propagation and, for a one-admin tool where
 * saves are sequential awaited round-trips, effectively closed.
 *
 * Everything still lives under deliveries/<token>/, so api/deliver-delete.js
 * and api/deliver-sweep.js — both of which delete by prefix — keep working
 * unchanged, and the files, thumbnails and manifest history of a share are
 * still one thing that goes away together.
 *
 * THE LEGACY PATH STAYS READABLE FOREVER. Every share sent before this file
 * existed has its manifest at deliveries/<token>/manifest.json and there are
 * live links out with clients pointing at them. Readers prefer a versioned
 * file and fall back to the legacy one; a legacy share that gets edited picks
 * up a versioned manifest at that point and the old file is simply ignored
 * from then on (it's a few hundred bytes and goes with the share when the
 * share goes, so it isn't worth a delete that could race a concurrent read).
 */
import { put, list, del } from '@vercel/blob';

const KEEP_VERSIONS = 3;
/* Only a 13-digit millisecond stamp counts as a version. This matters:
   deliveries/<token>/ is also where the client's own FILES land, so the
   pattern has to be narrow enough that nothing a filename can produce is ever
   mistaken for a manifest. (api/deliver-upload-token.js additionally refuses
   to hand out an upload token for anything under manifest/, so an uploaded
   file cannot land on this prefix in the first place.) */
const VERSION_RE = /\/manifest\/\d{13}\.json$/;
const LEGACY_RE = /\/manifest\.json$/;
const ANY_MANIFEST_RE = /^deliveries\/([^/]+)\/manifest(?:\/\d{13})?\.json$/;

const versionDir = (token) => 'deliveries/' + token + '/manifest/';

/** list() caps at 1000 blobs per page; follow the cursor so a big store
    doesn't silently truncate the share list (or a sweep). */
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

/** Newest versioned manifest in a group of blobs, else the legacy one. */
function pickNewest(blobs) {
  const versions = blobs
    .filter((b) => VERSION_RE.test(b.pathname))
    // 13-digit ms stamps sort correctly as strings until the year 2286.
    .sort((a, b) => (a.pathname < b.pathname ? 1 : -1));
  if (versions.length) return versions[0];
  return blobs.find((b) => LEGACY_RE.test(b.pathname)) || null;
}

async function fetchManifest(blob) {
  if (!blob) return null;
  /* The cache-buster is load-bearing on the LEGACY path (overwritten in place,
     therefore CDN-cached under a URL whose content changed) and harmless on a
     versioned one, whose content is immutable by construction. */
  const r = await fetch(blob.url + '?_=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) return null;
  const m = await r.json();
  return m && typeof m === 'object' ? m : null;
}

/** One share's current manifest, or null if there isn't one. */
export async function readManifest(token) {
  // Prefix covers both deliveries/<token>/manifest.json and .../manifest/*.
  const blobs = await listAll('deliveries/' + token + '/manifest');
  return fetchManifest(pickNewest(blobs));
}

/** Write a new version of a share's manifest. Returns the pathname written. */
export async function writeManifest(token, manifest) {
  const pathname = versionDir(token) + Date.now() + '.json';
  await put(pathname, JSON.stringify(manifest), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
  /* Prune older versions, best-effort — the write above is already the source
     of truth and an unpruned version costs kilobytes. Never touches the newest
     KEEP_VERSIONS, so a read in flight can't have its file deleted out from
     under it. */
  try {
    const blobs = await listAll(versionDir(token));
    const old = blobs
      .filter((b) => VERSION_RE.test(b.pathname))
      .sort((a, b) => (a.pathname < b.pathname ? 1 : -1))
      .slice(KEEP_VERSIONS)
      .map((b) => b.url);
    if (old.length) await del(old);
  } catch (e) { /* prune next time */ }
  return pathname;
}

/**
 * Every share's current manifest, in one pass over the store — what
 * api/deliver-list.js renders and api/deliver-sweep.js walks.
 *
 * Entries whose manifest couldn't be read come back with `manifest: null`
 * rather than being dropped, because the two callers want opposite things
 * from that case: the dashboard skips it, the sweep must NOT treat it as
 * "no expiry set" and must leave those blobs alone.
 */
export async function listManifests() {
  const blobs = await listAll('deliveries/');
  const byToken = new Map();
  for (const b of blobs) {
    const m = b.pathname.match(ANY_MANIFEST_RE);
    if (!m) continue;
    if (!byToken.has(m[1])) byToken.set(m[1], []);
    byToken.get(m[1]).push(b);
  }
  return Promise.all(
    Array.from(byToken, async ([token, group]) => {
      const blob = pickNewest(group);
      let manifest = null;
      try { manifest = await fetchManifest(blob); } catch (e) { manifest = null; }
      return { token, pathname: blob ? blob.pathname : '', manifest };
    })
  );
}

/**
 * Delete everything belonging to one share — files, thumbnails, and every
 * version of the manifest. Shared by api/deliver-delete.js (by hand) and
 * api/deliver-sweep.js (on expiry) so the two can't come to disagree about
 * what "the whole share" means. Returns how many blobs went.
 */
export async function purgeShare(token) {
  const blobs = await listAll('deliveries/' + token + '/');
  if (blobs.length) await del(blobs.map((b) => b.url));
  return blobs.length;
}
