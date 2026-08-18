/**
 * POST /api/deliver-update — Vercel serverless function.
 *
 * Admin-only. Rewrites an already-sent share: a different client, a fixed
 * project line, a file added, a file pulled back out. The token — and so the
 * cognak.com/files/<token> link already sitting in somebody's inbox — never
 * changes, which is the whole point. Pierce sends a link, then notices a file
 * is missing or the description reads wrong, and correcting it must not mean
 * sending a second link and explaining which one to use (Pierce, 2026-08-18).
 *
 * Three things are deliberately NOT editable here:
 *
 *   createdAt — editing a share is not re-sending it. "Sent Aug 18" stays
 *   "sent Aug 18", because that's the date the client got the email.
 *
 *   expiresAt — locked at creation. If every edit re-armed the countdown, a
 *   share kept tidy with small corrections would quietly outlive the 7/30/90
 *   cap, which is the one mechanism that gets a forgotten share off Blob
 *   storage (see api/deliver-create.js and api/deliver-sweep.js). An expired
 *   share is therefore not editable back to life: delete it and send a new one.
 *
 *   downloadedAt — the client either opened something or didn't. Adding a
 *   file doesn't un-download the ones already taken.
 *
 * The body is the FULL desired file list, not a diff: /send sends every file
 * the share should end up with, existing ones included. Anything in the old
 * manifest that isn't in that list is treated as removed, and its blob is
 * deleted outright — removing a file from a sent share is a revoke, so the
 * raw blob URL has to stop working too, not just the row on /receive
 * (Pierce, 2026-08-18). That is irreversible, and /send confirms first.
 */
import { del } from '@vercel/blob';
import { requireAdmin } from './_lib/adminAuth.mjs';
import { TOKEN_RE, cleanBlobUrl, cleanText, normalizeFiles, shareSummary } from './_lib/manifest.mjs';
import { readManifest, writeManifest } from './_lib/manifestStore.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (requireAdmin(req, res)) return;

  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { data = null; }
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Bad request' });
  }

  const token = String(data.token || '');
  if (!TOKEN_RE.test(token)) {
    return res.status(400).json({ error: 'Bad share link.' });
  }

  let prev;
  try {
    prev = await readManifest(token);
  } catch (err) {
    console.error('Delivery update lookup failed', err);
    return res.status(502).json({ error: 'Could not load this share. Please try again.' });
  }
  if (!prev) {
    return res.status(404).json({ error: 'This share no longer exists.' });
  }

  const prevFiles = Array.isArray(prev.files) ? prev.files : [];
  /* Existing files are trusted by URL: they were validated when the share was
     created and the client can already see them, so a rule tightened since
     then must not silently drop one during an unrelated copy-edit. Everything
     else has to be a fresh upload into our own Blob store. */
  const files = normalizeFiles(data.files, new Set(prevFiles.map((f) => String(f.url))));
  if (!files.length) {
    return res.status(400).json({ error: 'A share needs at least one file.' });
  }

  const client = cleanText(data.client, 'Client');
  const project = cleanText(data.project);
  const avatarUrl = cleanBlobUrl(data.avatarUrl);

  const manifest = {
    token: prev.token || token,
    client,
    ...(avatarUrl ? { avatarUrl } : {}),
    project,
    createdAt: prev.createdAt || new Date().toISOString(),
    /* Spread rather than assigned: a manifest written before expiry existed
       has no expiresAt at all, and "no key" is what deliver-get and
       deliver-sweep read as "never expires". Writing `expiresAt: null` would
       be the same thing to them today but is a different shape on disk, and
       there is no reason for an edit to change a share's shape. */
    ...(prev.expiresAt ? { expiresAt: prev.expiresAt } : {}),
    ...(prev.downloadedAt ? { downloadedAt: prev.downloadedAt } : {}),
    files,
  };

  try {
    await writeManifest(token, manifest);
  } catch (err) {
    console.error('Delivery manifest update failed', err);
    return res.status(502).json({ error: 'Could not save this share. Please try again.' });
  }

  /* Only now, with the new manifest committed, do the old blobs go. In this
     order a failed write leaves everything exactly as it was, and a failed
     DELETE leaves orphans that deliver-sweep.js reclaims when the share
     expires — the two failure modes are "nothing happened" and "you paid for
     some bytes a while longer", neither of which loses a file.

     A file re-uploaded under a name already in the share lands on the same
     blob pathname, so it keeps the same URL and never appears here; its old
     PREVIEW does, because the new upload mints a fresh thumbnail key. */
  const keep = new Set();
  files.forEach((f) => { keep.add(f.url); if (f.thumbUrl) keep.add(f.thumbUrl); });
  const doomed = new Set();
  for (const f of prevFiles) {
    const url = String(f.url);
    const next = files.find((n) => n.url === url);
    if (!next) doomed.add(url);
    if (f.thumbUrl && (!next || next.thumbUrl !== f.thumbUrl)) doomed.add(String(f.thumbUrl));
  }
  // Belt and braces: never delete something the manifest we just wrote points
  // at. A stray thumbnail costs pennies; a deleted live file is a dead link.
  keep.forEach((url) => doomed.delete(url));

  if (doomed.size) {
    try {
      await del(Array.from(doomed));
    } catch (err) {
      console.error('Delivery update: removed blobs left behind', token, err);
    }
  }

  return res.status(200).json({
    ok: true,
    url: 'https://cognak.com/files/' + token,
    // The updated row, so /send can repaint it immediately instead of
    // re-listing and hoping the write is already visible.
    share: shareSummary(manifest),
  });
}
