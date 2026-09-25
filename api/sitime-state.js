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
import { readState, writeState, readAllDecisions, stateHistory, readStateAt } from './_lib/sitimeStore.mjs';
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

/* Slot structure is seed-owned too: a slot added to the seed (the homepage
   rebuild of 2026-09-23 added IMG-9001..9008) is appended with its seed
   defaults, and a slot that already exists takes the seed's name, priority,
   page, originals and `where` (the one-line placement note, 9/24) while keeping everything worked on in the tool (picks,
   candidates, generated images, edited brief and terms, batch). Slots are
   ordered as the seed orders them; anything not in the seed stays, at the end. */
const SEED_OWNED = ['name', 'priority', 'page', 'pageId', 'section', 'url', 'originals', 'where', 'mask'];
const seedIndex = new Map(seed.slots.map((s, i) => [s.id, i]));
/* Retired slots (Pierce, 2026-09-24: About Us pages not in SITE MAP 0409, and
   the investor pages Q4 hosts) leave the working list but are never thrown
   away: whatever was worked on them moves to state.retiredSlots, and the
   seed keeps their definitions in seed.retiredSlots / seed.retired, so any of
   them can be brought back by moving the id back into seed.slots. */
const RETIRED = new Set((seed.retiredSlots || []).map((s) => s.id));
const livePages = () => seed.pages.filter((p) => !p.retired);
function syncSlots(allSlots, parked) {
  const keep = new Map((parked || []).map((s) => [s.id, s]));
  (allSlots || []).forEach((s) => { if (RETIRED.has(s.id)) keep.set(s.id, s); });
  const slots = (allSlots || []).filter((s) => !RETIRED.has(s.id));
  const have = new Map(slots.map((s) => [s.id, s]));
  // a slot un-retired in the seed comes back with its old work, not blank
  seed.slots.forEach((sd) => { if (!have.has(sd.id) && keep.has(sd.id)) { slots.push(keep.get(sd.id)); have.set(sd.id, keep.get(sd.id)); keep.delete(sd.id); } });
  syncSlots.parked = Array.from(keep.values());
  const out = slots.map((s) => {
    const i = seedIndex.get(s.id);
    if (i == null) return s;
    const sd = seed.slots[i]; const o = { ...s };
    SEED_OWNED.forEach((k) => { if (k in sd) o[k] = sd[k]; else delete o[k]; });
    return o;
  });
  seed.slots.forEach((sd) => { if (!have.has(sd.id)) out.push(sd); });
  const at = (s) => (seedIndex.has(s.id) ? seedIndex.get(s.id) : 1e9);
  return out.sort((a, b) => at(a) - at(b));
}

export default async function handler(req, res) {
  const who = await requireEditor(req, res);
  if (!who) return;

  if (req.method === 'GET' && req.query && req.query.history) {
    if (who.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
    try { return res.status(200).json({ ok: true, history: await stateHistory() }); }
    catch (err) { console.error('sitime-state history failed', err); return res.status(502).json({ error: 'Could not load the history.' }); }
  }

  if (req.method === 'GET') {
    try {
      let state = await readState();
      let seeded = false;
      if (!state) { state = mergeSeed(null); await writeState(state); seeded = true; }
      const tokens = (state.batches || []).map((b) => b.token);
      const decisions = tokens.length ? await readAllDecisions(tokens) : {};
      /* Pages are seed-owned (nothing in the admin edits them), so they are
         always served from the deployed seed. That is how a re-crawl of the
         live site (page.current, scripts/sitime-crawl-current.py) reaches the
         tool on the next deploy without a reseed, which would drop generated
         images, added candidates and edited briefs. */
      const liveSlots = syncSlots(state.slots, state.retiredSlots);
      const withPages = { ...state, pages: livePages(), slots: liveSlots, retiredSlots: syncSlots.parked };
      const out = who.role === 'admin' ? withPages : { ...withPages, reviewPass: undefined };
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
        const r = await writeState(state, who.name + ' (reseed)');
        return res.status(200).json({ ok: true, savedAt: r.savedAt, state });
      }
      /* Restore an earlier version: written as a NEW version, so a restore
         can itself be undone from the same list. Decisions live in their
         own append-only files and are untouched either way. */
      if (body && body.restore) {
        if (who.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
        const old = await readStateAt(body.restore);
        if (!old || !Array.isArray(old.slots)) return res.status(404).json({ error: 'That version is no longer stored.' });
        const { savedAt: _s, savedBy: _b, ...rest } = old;
        const r = await writeState({ ...rest, restoredFrom: Number(body.restore) }, who.name + ' (restore)');
        return res.status(200).json({ ok: true, savedAt: r.savedAt });
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
      // never let a save drop parked (retired) slot work
      if (current && Array.isArray(current.retiredSlots) && !Array.isArray(state.retiredSlots)) state.retiredSlots = current.retiredSlots;
      const r = await writeState(state, who.name);
      return res.status(200).json({ ok: true, savedAt: r.savedAt });
    } catch (err) {
      console.error('sitime-state POST failed', err);
      return res.status(502).json({ error: 'Could not save.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
