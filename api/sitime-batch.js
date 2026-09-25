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
import { sitimeEditor } from './_lib/sitimeAuth.mjs';
import seed from './_lib/sitime-seed.json' with { type: 'json' };
import ctx from './_lib/sitime-context.json' with { type: 'json' };

/* What the slot's page shows on sitime.com today, for the reviewer's
   "Show original" view. A slot with its own seed `originals` list (the
   homepage slots map to the exact old banner or category tile) uses that;
   an empty list means nothing to show. Otherwise a hero slot (named hero, or the page's first slot)
   gets the page's hero images; any other slot gets the rest of the page.
   Falls back to the whole list when the split leaves nothing. Capped at 8. */
const pages = new Map((seed.pages || []).map((p) => [p.id, p]));
const seedSlots = new Map((seed.slots || []).map((s) => [s.id, s]));
/* Context (Pierce, 9/25): where each slot sits on its page. Page images are
   the newest page designs (Zaelab / COGNAK v3-1) or, for pages not designed
   yet, a full-page capture of the live site; rects are in 1920-wide page px.
   Data: api/_lib/sitime-context.json, images in public/workflow/sitime/context/. */
function contextOf(id) {
  const c = ctx.slots && ctx.slots[id]; const p = c && ctx.pages && ctx.pages[c.page];
  if (!c || !p) return null;
  return { src: p.src, w: p.w, h: p.h, rect: c.rect, live: /^Current/.test(p.from || '') };
}

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

/* Same rule as admin.astro licOf() (Pierce, 9/25): Envato comps need SiTime's own license. */
function licOf(p) {
  if (!p) return null;
  if (p.lic) return p.lic;
  if (p.source === 'stock') return 'adobe';
  if (p.source === 'existing') return 'own';
  if (p.source === 'generated') return 'generated';
  const n = String(p.name || p.title || p.path || '');
  if (/adobe[-_ ]?\d{6,}|_comp\.\w+$/i.test(n)) return 'adobe';
  if (/^(shutterstock|istock|adobestock)[-_ ]|[_-]ss\d{6,}/i.test(n)) return 'sitime';
  if (/-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-utc\.\w+$/i.test(n) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* \d{1,2},? 20\d\d( \(\d+\))?\.\w+$/i.test(n) || /[a-z] 20\d\d\.\w+$/i.test(n)) return 'envato';
  return 'other';
}
function img(pick) {
  if (!pick) return null;
  return {
    source: pick.source || null,
    url: pick.url || null,
    thumb: pick.thumb || pick.url || null,
    title: pick.title || '',
    desc: typeof pick.desc === 'string' ? pick.desc : '',
    id: pick.id || null,
    ref: pick.source === 'stock' ? 'Adobe Stock ' + (pick.id || '') : pick.source === 'library' ? 'SiTime library' : pick.source === 'existing' ? 'Current site' : 'COGNAK',
    link: pick.source === 'stock' && pick.id ? 'https://stock.adobe.com/images/x/' + pick.id : null,
    bw: !!pick.bw,
    flip: !!pick.flip,
    pos: pick.pos && typeof pick.pos.x === 'number' ? { x: pick.pos.x, y: pick.pos.y } : null,
    zoom: typeof pick.zoom === 'number' && pick.zoom > 1 ? pick.zoom : 1,
    lic: licOf(pick),
  };
}

// Same rule as admin.astro autoDisplay(): card-type slots review as a tall card.
function autoDisplay(s) { const m = (seedSlots.get(s.id) || {}).mask; if (m === 'burst' || m === 'arm') return m; return /\bcards?\b|^Applications ·|^Explore ·|^Culture is Key|focus area|tile/i.test(s.name || '') ? 'card' : 'hero'; }

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
    /* Anyone signed in to the tool (Pierce, team, or SiTime's own sign-in)
       skips the review passcode (Pierce, 9/25). */
    const who = await sitimeEditor(req).catch(() => null);
    const want = String((state.reviewPass == null ? 'silicon' : state.reviewPass) || '').trim().toLowerCase();
    const got = String((body && body.pass) || '').trim().toLowerCase();
    if (!who && want && got !== want) return res.status(401).json({ error: got ? 'That passcode isn\u2019t right.' : 'Passcode required.', needPass: true });

    const byId = new Map((state.slots || []).map((s) => [s.id, s]));
    const slots = (batch.slotIds || []).map((id) => byId.get(id)).filter(Boolean).map((s) => ({
      id: s.id,
      page: s.page,
      section: s.section,
      url: s.url,
      name: s.name,
      /* Placement note is seed-owned (sitime-state SEED_OWNED); read it from
         the seed so a batch opened before the next admin save still has it. */
      where: (seedSlots.get(s.id) || {}).where || s.where || '',
      mask: (seedSlots.get(s.id) || {}).mask || null,
      desc: typeof s.desc === 'string' ? s.desc : '',
      main: img(s.main),
      backup: img(s.backup),
      original: originals(s),
      context: contextOf(s.id),
      display: ['hero', 'card', 'burst', 'arm'].includes(s.display) ? s.display : autoDisplay(s),
    }));

    const { latest } = await readDecisions(token);
    return res.status(200).json({
      ok: true,
      batch: { token, num: batch.num, name: batch.name, status: batch.status, internal: !!batch.internal },
      me: who ? { name: who.name, role: who.role } : null,
      mock: state.mock || null,
      slots,
      decisions: latest,
    });
  } catch (err) {
    console.error('sitime-batch failed', err);
    return res.status(502).json({ error: 'Could not load this batch. Please try again.' });
  }
}
