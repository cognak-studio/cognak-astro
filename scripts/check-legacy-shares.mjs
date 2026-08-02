/**
 * Counts /send deliveries that have NO expiresAt — the pre-2026-07-28 shares.
 * Both api/deliver-get.js and api/deliver-sweep.js treat a missing expiresAt as
 * "never expires", so these stay downloadable forever and the sweep skips them.
 * The privacy policy's File Delivery clause promises expiry, so this should
 * read zero.
 *
 * Run locally (the token is not in the repo):
 *   vercel env pull .env.local
 *   node --env-file=.env.local scripts/check-legacy-shares.mjs
 *
 * Read-only. It lists manifests and prints a table; it deletes nothing.
 */
import { list } from '@vercel/blob';

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN missing. Run: vercel env pull .env.local');
  process.exit(1);
}

const { blobs } = await list({ prefix: 'deliveries/', limit: 1000 });
const manifests = blobs.filter((b) => b.pathname.endsWith('/manifest.json'));

const rows = [];
for (const b of manifests) {
  try {
    const m = await fetch(b.url).then((r) => r.json());
    rows.push({
      token: m.token,
      client: m.client || '',
      created: (m.createdAt || '').slice(0, 10),
      expires: m.expiresAt ? m.expiresAt.slice(0, 10) : 'NEVER',
      files: (m.files || []).length,
      mb: +((m.files || []).reduce((s, f) => s + (Number(f.size) || 0), 0) / 1e6).toFixed(1),
    });
  } catch { /* unreadable manifest — ignore, deliver-list does the same */ }
}

const legacy = rows.filter((r) => r.expires === 'NEVER');
const live = rows.filter((r) => r.expires !== 'NEVER' && Date.parse(r.expires) > Date.now());

console.log(`shares: ${rows.length}   no-expiry: ${legacy.length}   still-live: ${live.length}`);
if (legacy.length) {
  console.log('\nNO EXPIRY (these never sweep):');
  console.table(legacy);
  console.log('Delete from /send, or set an expiry by re-sending.');
} else {
  console.log('\nNothing without an expiry. The policy claim holds.');
}
