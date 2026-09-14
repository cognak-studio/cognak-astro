/**
 * POST /api/sitime-decide — public. One reviewer decision:
 *   { token, slotId, which: 'main' | 'backup', decision: 'approve' | 'deny' | 'hold', note }
 *
 * Append-only: each call writes its own file under sitime/decisions/<token>/
 * and never touches the admin state, so a reviewer and the admin page can
 * never race. Re-deciding the same slot simply appends a newer event, which
 * readers prefer. Refused for draft batches (preview links) and for slots
 * that are not in the batch.
 */
import { readState, writeDecision, TOKEN_RE } from './_lib/sitimeStore.mjs';

const DECISIONS = new Set(['approve', 'deny', 'hold']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  body = body || {};
  const token = String(body.token || '');
  const slotId = String(body.slotId || '');
  const which = body.which === 'backup' ? 'backup' : 'main';
  const decision = String(body.decision || '');
  const note = String(body.note || '').slice(0, 2000);

  if (!TOKEN_RE.test(token)) return res.status(404).json({ error: 'This link is not valid.' });
  if (!DECISIONS.has(decision)) return res.status(400).json({ error: 'Unknown decision.' });
  if (!/^[A-Z]{2,3}-\d{3,5}$/.test(slotId)) return res.status(400).json({ error: 'Unknown slot.' });

  try {
    const state = await readState();
    const batch = state && (state.batches || []).find((b) => b.token === token);
    if (!batch) return res.status(404).json({ error: 'This link is not valid.' });
    if (batch.status === 'draft') return res.status(403).json({ error: 'This batch is a preview. Decisions are not saved yet.' });
    if (!(batch.slotIds || []).includes(slotId)) return res.status(400).json({ error: 'That image is not in this batch.' });

    const r = await writeDecision(token, { slotId, which, decision, note });
    return res.status(200).json({ ok: true, at: r.at });
  } catch (err) {
    console.error('sitime-decide failed', err);
    return res.status(502).json({ error: 'Could not save that decision. Please try again.' });
  }
}
