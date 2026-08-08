/**
 * Shared read/write for the saved-clients address book (used by
 * api/clients.js and api/deliver-get.js).
 *
 * WHY VERSIONED FILES, NOT ONE index.json: Vercel Blob overwrites at a fixed
 * pathname can take up to ~60s to propagate — a read moments after a write
 * can return the OLD content even with a cache-busting query, because the
 * staleness is propagation, not just CDN caching. With a read-modify-write
 * index that isn't a cosmetic lag: a save that reads a stale base rebuilds
 * the list without the previous write and silently drops clients. (This is
 * exactly how "DuVine isn't saving" happened, 2026-08-08 — save-name and
 * save-photo were two writes ~1s apart, and the second read a base from
 * before the first.)
 *
 * So each write goes to a NEW path, clients/index/<ms-timestamp>.json, and a
 * read lists that prefix and fetches the lexicographically-latest file.
 * Content at a given path never changes, so a fetched file can never be
 * stale — the only lag left is list() visibility of a brand-new file, which
 * is far tighter than overwrite propagation and, for a one-admin tool where
 * saves are sequential awaited round-trips, effectively closed. Old versions
 * are pruned best-effort, newest few kept. The legacy clients/index.json is
 * read as a migration fallback only.
 */
import { put, list, del } from '@vercel/blob';

const DIR = 'clients/index/';
const LEGACY = 'clients/index.json';
const KEEP_VERSIONS = 5;

function versionFiles(blobs) {
  return blobs
    .filter((b) => /\/\d{13}\.json$/.test(b.pathname))
    // 13-digit ms timestamps sort correctly as strings until the year 2286.
    .sort((a, b) => (a.pathname < b.pathname ? 1 : -1));
}

export async function readClientsIndex() {
  let url = null;
  const { blobs } = await list({ prefix: DIR, limit: 1000 });
  const versions = versionFiles(blobs);
  if (versions.length) {
    url = versions[0].url;
  } else {
    const legacy = await list({ prefix: LEGACY, limit: 1 });
    if (!legacy.blobs.length) return [];
    url = legacy.blobs[0].url;
  }
  try {
    // Cache-buster kept for the legacy path (overwritten in place); harmless
    // on versioned paths.
    const data = await fetch(url + '?_=' + Date.now(), { cache: 'no-store' }).then((r) => r.json());
    return Array.isArray(data.clients) ? data.clients : [];
  } catch (e) {
    return [];
  }
}

export async function writeClientsIndex(clients) {
  await put(DIR + Date.now() + '.json', JSON.stringify({ clients }), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
  /* Prune older versions, best-effort — the write above is already the
     source of truth, and an unpruned version costs kilobytes. Never touches
     the newest KEEP_VERSIONS, so a concurrent read can't have its file
     deleted out from under it. */
  try {
    const { blobs } = await list({ prefix: DIR, limit: 1000 });
    const old = versionFiles(blobs).slice(KEEP_VERSIONS).map((b) => b.url);
    if (old.length) await del(old);
  } catch (e) { /* prune later */ }
}
