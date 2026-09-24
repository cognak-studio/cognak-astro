/**
 * POST /api/sitime-batch — public. The reviewer page posts { token } and gets
 * the batch back: its slots with main and backup images, plus the decisions
 * already recorded. The token is the credential, like /files/<token>.
 *
 * Only the fields the reviewer needs cross the wire; Ace's candidate lists,
 * prompts and the rest of the working state stay admin-side. The page's
 * current sitime.com images go along as `original` (public URLs already).
 */
import { readState, readDecisions, TOKEN_RE } from './_lib/sitimeStore.mjs';
import seed from './_lib/sitime-seed.json' with { type: 'json' };

/* What the slot's page shows on sitime.com today, for the reviewer's
   "Show original" view. A slot with its own seed `originals` list (the
   homepage slots map to the exact old banner or category tile) uses that;
   an empty list means nothing to show. Otherwise a hero slot (named hero, or the page's first slot)
   gets the page's hero images; any other slot gets the rest of the page.
   Falls back to the whole list when the split leaves nothing. Capped at 8. */
const pages = new Map((seed.pages || []).map((p) => [p.id, p]));
const seedSlots = new Map((seed.slots || []).map((s) => [s.id, s]));
function originals(s) {
  const own = (seedSlots.get(s.id) || {}).originals;
  if (Array.isArray(own)) return own.slice(0, 8).map((url) => ({ url, name: decodeURIComponent(url.split('/').pop()) }));
  const p = pages.get(s.pageId);
  const cur = (p && (p.current || (p.drupalImages || []).map((u) => [u, u === p.drupalHero ? 1 : 0]))) || [];
  if (!cur.length) return [];
  const heroSlot = /hero/i.test(s.name || '') || ((p.slotIds || [])[0] === s.id);
  const part = cur.filter(([, h]) => (heroSlot ? h : !h));
  return (part.length ? part : cur).slice(0, 8).map(([url]) => ({ url, name: decodeURIComponent(url.split('/').pop()) }));
}

function img(pick) {
  if (!pick) return null;
  return {
    source: pick.source || null,
    url: pick.url || null,
    thumb: pick.thumb || pick.url || null,
    title: pick.title || '',
    id: pick.id || null,
    ref: pick.source === 'stock' ? 'Adobe Stock ' + (pick.id || '') : pick.source === 'library' ? 'SiTime library' : pick.source === 'existing' ? 'Current site' : 'COGNAK',
    link: pick.source === 'stock' && pick.id ? 'https://stock.adobe.com/images/x/' + pick.id : null,
    bw: !!pick.bw,
    flip: !!pick.flip,
  };
}

// Same rule as admin.astro autoDisplay(): card-type slots review as a tall card.
function autoDisplay(s) { return /\bcards?\b|^Applications ·|^Explore ·|^Culture is Key|focus area|tile/i.test(s.name || '') ? 'card' : 'hero'; }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const token = String((body && body.token) || '');
  if (!TOKEN_RE.test(token)) return res.status(404).json({ error: 'This link is not valid.' });

  try {
    const state = await readState();
    const batch = state && (state.batches || []).find((b) => b.token === token);
    if (!batch) return res.status(404).json({ error: 'This link is not valid.' });
    /* Shared passcode on top of the link (Pierce, 2026-09-14: "silicon").
       Set in the admin Library tab; compared case-insensitively. */
    const want = String((state.reviewPass == null ? 'silicon' : state.reviewPass) || '').trim().toLowerCase();
    const got = String((body && body.pass) || '').trim().toLowerCase();
    if (want && got !== want) return res.status(401).json({ error: got ? 'That passcode isn\u2019t right.' : 'Passcode required.', needPass: true });

    const byId = new Map((state.slots || []).map((s) => [s.id, s]));
    const slots = (batch.slotIds || []).map((id) => byId.get(id)).filter(Boolean).map((s) => ({
      id: s.id,
      page: s.page,
      section: s.section,
      url: s.url,
      name: s.name,
      main: img(s.main),
      backup: img(s.backup),
      original: originals(s),
      display: s.display === 'card' || s.display === 'hero' ? s.display : autoDisplay(s),
    }));

    const { latest } = await readDecisions(token);
    return res.status(200).json({
      ok: true,
      batch: { token, num: batch.num, name: batch.name, status: batch.status },
      mock: state.mock || null,
      slots,
      decisions: latest,
    });
  } catch (err) {
    console.error('sitime-batch failed', err);
    return res.status(502).json({ error: 'Could not load this batch. Please try again.' });
  }
}
