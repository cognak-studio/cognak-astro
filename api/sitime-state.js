/**
 * /api/sitime-state — admin-only, the working state of the SiTime image tool.
 *
 *   GET            → { ok, state, decisions }  (seeds from sitime-seed.json on first call)
 *   POST { state } → writes a new version      (whole document; the admin page is one person)
 *   POST { state, baseSavedAt } → 409 { conflict, state } if someone else saved
 *                    after baseSavedAt; the page merges and retries.
 *   Team editors (sitimeAuth.mjs) may save, but batches, the review passcode
 *   and each slot's batch link are kept from the stored state -- those stay
 *   admin-only however the request is built.
 *   POST { reseed: true }  (admin only) → replaces slots/pages from the seed but keeps picks, batches, library
 *
 * Decisions come back alongside the state so the dashboard can show batch
 * progress without a second round-trip; they live in their own append-only
 * files (see _lib/sitimeStore.mjs) and are never written here.
 */
import { requireEditor } from './_lib/sitimeAuth.mjs';
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
  const who = await requireEditor(req, res);
  if (!who) return;

  if (req.method === 'GET') {
    try {
      let state = await readState();
      let seeded = false;
      if (!state) { state = mergeSeed(null); await writeState(state); seeded = true; }
      const tokens = (state.batches || []).map((b) => b.token);
      const decisions = tokens.length ? await readAllDecisions(tokens) : {};
      const out = who.role === 'admin' ? state : { ...state, reviewPass: undefined };
      return res.status(200).json({ ok: true, state: out, decisions, seeded, me: who });
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
        if (who.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
        const state = mergeSeed(await readState());
        const r = await writeState(state);
        return res.status(200).json({ ok: true, savedAt: r.savedAt, state });
      }
      const state = body && body.state;
      if (!state || !Array.isArray(state.slots)) return res.status(400).json({ error: 'No state.' });
      const current = await readState();
      const base = Number(body.baseSavedAt) || 0;
      // Only a NEWER stored version is a conflict. An older one just means the
      // listing has not caught up with this page's own last save yet.
      if (current && current.savedAt && base && current.savedAt > base) {
        return res.status(409).json({ conflict: true, state: current });
      }
      if (who.role !== 'admin' && current) {
        state.batches = current.batches || [];
        state.reviewPass = current.reviewPass;
        const was = new Map((current.slots || []).map((s) => [s.id, s.batch || null]));
        // Team may take a slot OUT of a batch (Pick a replacement) but never put
        // one into a batch.
        state.slots.forEach((s) => { const w = was.has(s.id) ? was.get(s.id) : null; s.batch = s.batch == null ? null : w; });
      }
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
