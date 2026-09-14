/**
 * /api/sitime-state — admin-only, the working state of the SiTime image tool.
 *
 *   GET            → { ok, state, decisions }  (seeds from sitime-seed.json on first call)
 *   POST { state } → writes a new version      (whole document; the admin page is one person)
 *   POST { reseed: true } → replaces slots/pages from the seed but keeps picks, batches, library
 *
 * Decisions come back alongside the state so the dashboard can show batch
 * progress without a second round-trip; they live in their own append-only
 * files (see _lib/sitimeStore.mjs) and are never written here.
 */
import { requireAdmin } from './_lib/adminAuth.mjs';
import { readState, writeState, readAllDecisions } from './_lib/sitimeStore.mjs';
import seed from './_lib/sitime-seed.json' with { type: 'json' };

function mergeSeed(existing) {
  if (!existing) return { ...seed, batches: [], library: [] };
  const keep = new Map((existing.slots || []).map((s) => [s.id, s]));
  const slots = seed.slots.map((s) => {
    const k = keep.get(s.id);
    return k ? { ...s, main: k.main, backup: k.backup, state: k.state, batch: k.batch, license: k.license, notes: k.notes } : s;
  });
  return { ...existing, pages: seed.pages, slots, mock: existing.mock || seed.mock };
}

export default async function handler(req, res) {
  if (requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    try {
      let state = await readState();
      let seeded = false;
      if (!state) { state = mergeSeed(null); await writeState(state); seeded = true; }
      const tokens = (state.batches || []).map((b) => b.token);
      const decisions = tokens.length ? await readAllDecisions(tokens) : {};
      return res.status(200).json({ ok: true, state, decisions, seeded });
    } catch (err) {
      console.error('sitime-state GET failed', err);
      return res.status(502).json({ error: 'Could not load the state.' });
    }
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    try {
      if (body && body.reseed) {
        const state = mergeSeed(await readState());
        const r = await writeState(state);
        return res.status(200).json({ ok: true, savedAt: r.savedAt, state });
      }
      const state = body && body.state;
      if (!state || !Array.isArray(state.slots)) return res.status(400).json({ error: 'No state.' });
      const r = await writeState(state);
      return res.status(200).json({ ok: true, savedAt: r.savedAt });
    } catch (err) {
      console.error('sitime-state POST failed', err);
      return res.status(502).json({ error: 'Could not save.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
