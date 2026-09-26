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
import ctx from './_lib/sitime-context.json' with { type: 'json' };

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

/* ---- internal review notes and the client role (Pierce, 9/25) ----
   Michael's reviews travel on the images: pick.reviews (internal:true),
   pick.solved (per batch token), and slot.history entries whose picks carry
   those reviews. SiTime's sign-in must never receive them, and a client
   save must never lose them. */
const PICKS = ['main', 'backup'];
const isInt = (r) => !!(r && r.internal);
const url = (p) => (p && p.url) || null;

function stripPick(p, visible) {
  if (!p) return p;
  const o = { ...p };
  if (Array.isArray(o.reviews)) { o.reviews = o.reviews.filter((r) => !isInt(r)); if (!o.reviews.length) delete o.reviews; }
  if (Array.isArray(o.solved)) { o.solved = o.solved.filter((x) => visible.has(x.token)); if (!o.solved.length) delete o.solved; }
  return o;
}
/** The slot as the client may see it: no internal reviews anywhere on it. */
function stripInternal(s, visible) {
  const o = { ...s };
  PICKS.forEach((w) => { if (o[w]) o[w] = stripPick(o[w], visible); });
  if (Array.isArray(o.history)) {
    o.history = o.history.filter((h) => (h.pick && h.pick.reviews || []).some((r) => !isInt(r)))   // an entry that exists only for an internal review is not shown
      .map((h) => ({ ...h, why: (h.pick && h.pick.reviews || []).some(isInt) ? 'Replaced' : h.why, pick: stripPick(h.pick, visible) }));
    if (!o.history.length) delete o.history;
  }
  return o;
}
/** Put the internal notes back onto a slot the client saved, from the stored slot. */
function restoreInternal(s, c, current) {
  const visible = new Set((current.batches || []).filter((b) => !b.internal).map((b) => b.token));
  const hidden = (p) => ({ reviews: (p && p.reviews || []).filter(isInt), solved: (p && p.solved || []).filter((x) => !visible.has(x.token)) });
  const merge = (p, h) => {
    if (!p) return p;
    const reviews = (p.reviews || []).filter((r) => !isInt(r)).concat(h.reviews);
    const solved = (p.solved || []).filter((x) => visible.has(x.token)).concat(h.solved);
    const o = { ...p };
    if (reviews.length) o.reviews = reviews; else delete o.reviews;
    if (solved.length) o.solved = solved; else delete o.solved;
    return o;
  };
  const key = (h) => (h.which || '') + '|' + (url(h.pick) || '') + '|' + (h.at || '');
  const curHist = Array.isArray(c.history) ? c.history : [];
  const curKeys = new Map(curHist.map((h) => [key(h), h]));
  // 1. history the client sent: its own new entries (restore any notes the
  //    stored pick carried), plus stored entries it merely echoed back
  let history = (Array.isArray(s.history) ? s.history : []).map((h) => {
    const stored = curKeys.get(key(h));
    if (stored) return { ...stored };
    const from = PICKS.map((w) => c[w]).find((p) => p && url(p) === url(h.pick));
    return from ? { ...h, pick: merge(h.pick, hidden(from)) } : h;
  });
  // 2. the picks themselves: same image as stored → carry its notes; a
  //    different image → the stored one left the slot, and if it had internal
  //    notes and the client made no history entry for it, make one
  PICKS.forEach((w) => {
    const p = s[w], q = c[w];
    if (p && q && url(p) === url(q)) { s[w] = merge(p, hidden(q)); return; }
    if (q && hidden(q).reviews.length && !history.some((h) => h.which === w && url(h.pick) === url(q))) {
      history.unshift({ which: w, why: 'Replaced', at: Date.now(), pick: { ...q } });
    }
  });
  // 3. stored entries the client never saw come back in their place
  curHist.forEach((h, i) => { if (!history.some((x) => key(x) === key(h))) history.splice(Math.min(i, history.length), 0, { ...h }); });
  history = history.slice(0, 20);
  if (history.length) s.history = history; else delete s.history;
}

/** The state as this role may see it (GET, and the 409 conflict body). */
function viewFor(who, state) {
  if (who.role === 'admin') return state;
  const out = { ...state, reviewPass: undefined };
  if (who.role !== 'client') return out;
  /* SiTime's own sign-in never sees COGNAK's internal reviews (Pierce, 9/25).
     Batches, their decisions and the review log are dropped, and so are the
     review notes copied onto the images themselves (pick.reviews, history,
     solved). POST puts those back from the stored state, so a client save
     never loses them. */
  const visible = new Set((state.batches || []).filter((b) => !b.internal).map((b) => b.token));
  return { ...out, batches: (state.batches || []).filter((b) => !b.internal), reviewLog: undefined,
    slots: (state.slots || []).map((s) => stripInternal(s, visible)), retiredSlots: (state.retiredSlots || []).map((s) => stripInternal(s, visible)) };
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
      /* Pages and slots added in the tool (Pierce, 9/25: SiTime adds its own)
         live in state.customPages and as non-seed slots; the seed never
         touches them. */
      const seedIds = new Set(livePages().map((p) => p.id));
      const custom = (state.customPages || []).filter((p) => p && p.id && !seedIds.has(p.id));
      const withPages = { ...state, pages: livePages().concat(custom), slots: liveSlots, retiredSlots: syncSlots.parked };
      const out = viewFor(who, withPages);
      let decs = decisions;
      if (who.role === 'client') {
        const hide = new Set((withPages.batches || []).filter((b) => b.internal).map((b) => b.token));
        decs = Object.fromEntries(Object.entries(decisions).filter(([t]) => !hide.has(t)));
      }
      return res.status(200).json({ ok: true, state: out, decisions: decs, seeded, me: who, context: ctx });
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
        return res.status(409).json({ conflict: true, state: viewFor(who, current) });   // same view as GET: no passcode for team, no internal notes for the client
      }
      if (who.role !== 'admin' && current) {
        state.batches = current.batches || [];
        state.reviewPass = current.reviewPass;
        state.reviewLog = current.reviewLog || [];
        const was = new Map((current.slots || []).map((s) => [s.id, s.batch || null]));
        // Team may take a slot OUT of a batch (Pick a replacement) but never put
        // one into a batch.
        state.slots.forEach((s) => { const w = was.has(s.id) ? was.get(s.id) : null; s.batch = s.batch == null ? null : w; });
        /* The client never received the internal review notes on the images
           (see GET), so they are not in this document: put them back from the
           stored state, image by image. Parked slots are not shown to the
           client at all, so the stored ones stand. */
        if (who.role === 'client') {
          const cur = new Map((current.slots || []).map((s) => [s.id, s]));
          state.slots.forEach((s) => { const c = cur.get(s.id); if (c) restoreInternal(s, c, current); });
          syncSlots(current.slots, current.retiredSlots); state.retiredSlots = syncSlots.parked;   // the parked list as GET computes it, unstripped
        }
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
