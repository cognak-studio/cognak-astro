/**
 * GET /api/files-page?t=<token> — Vercel serverless function.
 *
 * Serves /files/<token> (and legacy /r/<token>) to LINK-PREVIEW CRAWLERS
 * only — Slack, iMessage, LinkedIn, etc. The user-agent rewrite in
 * vercel.json sends them here; people still get the static /receive page
 * straight from the CDN, untouched.
 *
 * Why it exists: /receive is static, so its preview title is "Files from
 * COGNAK" / "A file delivery from COGNAK." for every share, and crawlers
 * don't run the JS that loads the share. This returns the same /receive
 * HTML with the description line (description, og:description,
 * twitter:description) set to the share's project name — the "Project
 * details" field on /send, e.g. "DuVine Image Selection" — and og:url set to
 * the share's own link. Title and image are unchanged. A bad token, missing
 * or expired share, or blank project name keeps the default description.
 *
 * If the static page can't be fetched, a minimal head with the same tags
 * (and a refresh to the real page, for the odd human who lands here) is
 * returned instead, so a preview never fails outright.
 */
import { TOKEN_RE } from './_lib/manifest.mjs';
import { readManifest } from './_lib/manifestStore.mjs';

const SITE = 'https://cognak.com';
const DEFAULT_DESCRIPTION = 'A file delivery from COGNAK.';

let pageCache = null; // { html, at } — per warm instance
const PAGE_TTL_MS = 10 * 60 * 1000;

async function receiveHtml(host) {
  if (pageCache && Date.now() - pageCache.at < PAGE_TTL_MS) return pageCache.html;
  const origin = host ? 'https://' + host : SITE;
  const r = await fetch(origin + '/receive/', { headers: { 'user-agent': 'cognak-files-page' } });
  if (!r.ok) throw new Error('receive page ' + r.status);
  const html = await r.text();
  pageCache = { html, at: Date.now() };
  return html;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function setMeta(html, attr, key, value) {
  const re = new RegExp('(<meta\\s+' + attr + '="' + key + '"\\s+content=")[^"]*(")');
  return html.replace(re, (_, a, b) => a + esc(value) + b);
}

export default async function handler(req, res) {
  const token = String((req.query && req.query.t) || '');
  const shareUrl = SITE + '/files/' + token;

  let description = DEFAULT_DESCRIPTION;
  if (TOKEN_RE.test(token)) {
    try {
      const m = await readManifest(token);
      const name = m && String(m.project || '').trim();
      const live = m && !(m.expiresAt && Date.parse(m.expiresAt) <= Date.now());
      if (name && live) description = name;
    } catch (e) { /* default description */ }
  }

  let html;
  try {
    html = await receiveHtml(req.headers.host);
    html = setMeta(html, 'name', 'description', description);
    html = setMeta(html, 'property', 'og:description', description);
    html = setMeta(html, 'name', 'twitter:description', description);
    html = setMeta(html, 'property', 'og:url', shareUrl);
  } catch (err) {
    console.error('files-page: falling back to minimal head', err);
    const image = SITE + '/theme/assets/images/cognak-og.jpg';
    html = '<!doctype html><html><head><meta charset="utf-8">'
      + '<title>Files from COGNAK</title>'
      + '<meta name="robots" content="noindex, nofollow">'
      + '<meta property="og:type" content="website">'
      + '<meta property="og:site_name" content="COGNAK">'
      + '<meta name="description" content="' + esc(description) + '">'
      + '<meta property="og:title" content="Files from COGNAK">'
      + '<meta property="og:description" content="' + esc(description) + '">'
      + '<meta property="og:url" content="' + esc(shareUrl) + '">'
      + '<meta property="og:image" content="' + image + '">'
      + '<meta name="twitter:card" content="summary_large_image">'
      + '<meta name="twitter:title" content="Files from COGNAK">'
      + '<meta name="twitter:description" content="' + esc(description) + '">'
      + '<meta name="twitter:image" content="' + image + '">'
      + '<meta http-equiv="refresh" content="0;url=/receive?t=' + esc(token) + '">'
      + '</head><body></body></html>';
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.status(200).send(html);
}
