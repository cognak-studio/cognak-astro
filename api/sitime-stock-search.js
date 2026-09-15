/**
 * POST /api/sitime-stock-search — admin-only. Live keyword search against
 * Adobe Stock's catalog, backing the admin Slots drawer's Stock tab search
 * box: type a query, get real thumbnails back, click one to add it as a
 * candidate and assign it -- no more bouncing to stock.adobe.com, right-
 * clicking a comp, and pasting the image address back in.
 *
 * This is the Search API only (free, no license purchase happens here --
 * SiTime still licenses the winning image manually on Stock afterward, same
 * as today). Needs an Adobe Stock API key (Client ID) from a free app
 * registered in the Adobe Developer Console -- see sitime-image-tool-build
 * memory for the registration steps. Nothing here can obtain or store that
 * key itself; it must be set as ADOBE_STOCK_API_KEY in this project's
 * Vercel env vars, same pattern as GEMINI_API_KEY.
 */
import { requireAdmin } from './_lib/adminAuth.mjs';

const SEARCH_URL = 'https://stock.adobe.io/Rest/Media/1/Search/Files';
const RESULT_COLUMNS = [
  'id', 'title', 'creator_name', 'width', 'height',
  'thumbnail_220_url', 'thumbnail_220_width', 'thumbnail_220_height',
  'comp_url', 'comp_width', 'comp_height', 'content_type',
];

async function searchAdobeStock(query, limit, apiKey) {
  const params = new URLSearchParams();
  params.set('search_parameters[words]', query);
  params.set('search_parameters[limit]', String(limit));
  params.set('search_parameters[order]', 'relevance');
  RESULT_COLUMNS.forEach((c) => params.append('result_columns[]', c));
  const r = await fetch(SEARCH_URL + '?' + params.toString(), {
    headers: { 'x-api-key': apiKey, 'X-Product': 'COGNAK SiTime Tool/1.0' },
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = (body && (body.message || (body.error && body.error.message))) || ('HTTP ' + r.status);
    throw new Error('Adobe Stock: ' + msg);
  }
  return (body && (body.files || body.result)) || [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (requireAdmin(req, res)) return;

  const apiKey = process.env.ADOBE_STOCK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ADOBE_STOCK_API_KEY is not set in this project’s Vercel env vars.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  body = body || {};
  const query = String(body.query || '').trim();
  const limit = Math.max(1, Math.min(24, Number(body.limit) || 24));
  if (!query) return res.status(400).json({ error: 'Type something to search for.' });

  try {
    const files = await searchAdobeStock(query, limit, apiKey);
    const results = files.map((f) => ({
      id: f.id,
      title: f.title || '',
      creator: f.creator_name || '',
      width: f.width || null,
      height: f.height || null,
      thumb: f.thumbnail_220_url || f.thumbnail_url || '',
      comp: f.comp_url || f.thumbnail_220_url || f.thumbnail_url || '',
      type: f.content_type || '',
    }));
    return res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error('sitime-stock-search failed', err);
    return res.status(502).json({ error: (err && err.message) ? err.message : 'Search failed.' });
  }
}
