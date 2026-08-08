/**
 * /api/clients — Vercel serverless function. Admin-only.
 *
 * The saved-clients address book behind /send's client picker. Same
 * "one small JSON blob is the database" pattern as the delivery manifests:
 * the whole list lives at clients/index.json in Vercel Blob, and avatars
 * live under clients/avatars/<id>.* (uploaded browser-side through
 * api/deliver-upload-token.js, which allows that prefix for exactly this).
 *
 *   GET                                  -> { ok, clients: [...] }
 *   POST { action:'save', id?, name, avatarUrl? }  -> upsert, returns the client
 *   POST { action:'delete', id }         -> removes it + its avatar blobs
 *
 * One admin, low write volume — a read-modify-write on one blob is fine here
 * the same way it is for manifests. Each client: { id, name, avatarUrl,
 * createdAt, updatedAt }.
 */
import { put, list, del } from '@vercel/blob';
import { requireAdmin } from './_lib/adminAuth.mjs';

const INDEX_PATH = 'clients/index.json';
const MAX_CLIENTS = 500;

/* Same rule as deliver-create's cleanThumbUrl: this URL goes straight into an
   <img src> on pages we serve (/send and the client-facing /receive), so only
   our own Blob store is ever accepted. Fails closed to "no avatar". */
function cleanAvatarUrl(v) {
  if (typeof v !== 'string' || v.length > 500) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:') return null;
    if (!/(^|\.)blob\.vercel-storage\.com$/.test(u.hostname)) return null;
    return u.href;
  } catch (e) {
    return null;
  }
}

async function readIndex() {
  const { blobs } = await list({ prefix: INDEX_PATH, limit: 1 });
  if (!blobs.length) return [];
  try {
    const data = await fetch(blobs[0].url).then((r) => r.json());
    return Array.isArray(data.clients) ? data.clients : [];
  } catch (e) {
    return [];
  }
}

async function writeIndex(clients) {
  await put(INDEX_PATH, JSON.stringify({ clients }), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

function randomId() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export default async function handler(req, res) {
  if (requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    try {
      const clients = await readIndex();
      clients.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
      return res.status(200).json({ ok: true, clients });
    } catch (err) {
      console.error('Client list failed', err);
      return res.status(502).json({ error: 'Could not load clients.' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { data = null; }
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Bad request' });
  }

  try {
    if (data.action === 'save') {
      const name = String(data.name || '').trim().slice(0, 200);
      if (!name) return res.status(400).json({ error: 'A client needs a name.' });
      const avatarUrl = cleanAvatarUrl(data.avatarUrl);
      const clients = await readIndex();
      const now = new Date().toISOString();

      let client = data.id ? clients.find((c) => c.id === data.id) : null;
      /* Upsert by name too (case-insensitive) so typing "Duvine" twice never
         creates a second "DuVine" — the picker treats names as identity. */
      if (!client) {
        client = clients.find((c) => String(c.name).toLowerCase() === name.toLowerCase());
      }
      if (client) {
        client.name = name;
        if (avatarUrl) client.avatarUrl = avatarUrl;
        else if (data.avatarUrl === null) client.avatarUrl = null; // explicit removal
        client.updatedAt = now;
      } else {
        if (clients.length >= MAX_CLIENTS) {
          return res.status(400).json({ error: 'Client list is full.' });
        }
        client = { id: randomId(), name, avatarUrl: avatarUrl || null, createdAt: now, updatedAt: now };
        clients.push(client);
      }
      await writeIndex(clients);
      return res.status(200).json({ ok: true, client });
    }

    if (data.action === 'delete') {
      const id = String(data.id || '');
      if (!id) return res.status(400).json({ error: 'Bad request' });
      const clients = await readIndex();
      const next = clients.filter((c) => c.id !== id);
      if (next.length !== clients.length) await writeIndex(next);
      /* Best-effort avatar cleanup — the index is already consistent, and an
         orphaned avatar blob costs kilobytes, not correctness. */
      try {
        const { blobs } = await list({ prefix: 'clients/avatars/' + id, limit: 10 });
        if (blobs.length) await del(blobs.map((b) => b.url));
      } catch (e) {
        console.warn('Avatar cleanup skipped for client ' + id, e);
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('Client save failed', err);
    return res.status(502).json({ error: 'Could not save. Please try again.' });
  }
}
