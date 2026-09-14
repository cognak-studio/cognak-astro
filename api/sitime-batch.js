/**
 * POST /api/sitime-batch — public. The reviewer page posts { token } and gets
 * the batch back: its slots with main and backup images, plus the decisions
 * already recorded. The token is the credential, like /files/<token>.
 *
 * Only the fields the reviewer needs cross the wire; Ace's candidate lists,
 * prompts, Drupal export URLs and the rest of the working state stay
 * admin-side. preview:true returns the same shape for a draft batch so
 * Michael can look before it goes out; decisions are refused for drafts
 * by sitime-decide.js, not here.
 */
import { readState, readDecisions, TOKEN_RE } from './_lib/sitimeStore.mjs';

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
  };
}

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

    const byId = new Map((state.slots || []).map((s) => [s.id, s]));
    const slots = (batch.slotIds || []).map((id) => byId.get(id)).filter(Boolean).map((s) => ({
      id: s.id,
      page: s.page,
      section: s.section,
      url: s.url,
      name: s.name,
      main: img(s.main),
      backup: img(s.backup),
    }));

    const { latest } = await readDecisions(token);
    return res.status(200).json({
      ok: true,
      batch: { token, num: batch.num, name: batch.name, status: batch.status, sentAt: batch.sentAt || null },
      mock: state.mock || null,
      slots,
      decisions: latest,
    });
  } catch (err) {
    console.error('sitime-batch failed', err);
    return res.status(502).json({ error: 'Could not load this batch. Please try again.' });
  }
}
