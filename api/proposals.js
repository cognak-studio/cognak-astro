/**
 * /api/proposals (2026-09-29)
 *   GET              -> { ok, admin, items:[{slug, client, tag, title, desc, date}] }  (401 when none unlocked)
 *   GET ?slug=<slug> -> { ok, proposal:{ ...meta, lede, html } }                        (401 when not unlocked)
 *   POST { pass }    -> checks the passcode, adds its proposal to the session cookie, returns the list
 *   POST { signout:true } -> clears the proposals cookie (the admin session is left alone)
 *
 * Wrong passcodes are rate limited on their own counter (security/proposal-attempts.json),
 * so guessing here can never lock /admin.
 */
import { allowed, matchPasscode, sessionCookie, clearCookie, sessionSlugs } from './_lib/proposalsAuth.mjs';
import { PROPOSALS, bySlug } from './_lib/proposals/index.mjs';
import { checkLoginAllowed, recordFailure, clearFailures } from './_lib/rateLimit.mjs';

const RL = { path: 'security/proposal-attempts.json' };
const meta = (p) => ({ slug: p.slug, client: p.client, tag: p.tag, title: p.title, desc: p.desc, date: p.date, updated: p.updated || p.date });

function list(req) {
  const a = allowed(req);
  return { admin: a.admin, items: PROPOSALS.filter((p) => a.slugs.includes(p.slug)).map(meta) };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!process.env.ADMIN_SECRET) return res.status(500).json({ error: 'Proposals are not configured yet.' });

  if (req.method === 'GET') {
    const slug = req.query && req.query.slug;
    if (slug) {
      const p = bySlug(String(slug));
      if (!p || !allowed(req).slugs.includes(p.slug)) return res.status(401).json({ error: 'Enter the passcode to view this proposal.' });
      return res.status(200).json({ ok: true, proposal: { ...meta(p), subtitle: p.body.subtitle, lede: p.body.lede, html: p.body.html } });
    }
    const l = list(req);
    if (!l.items.length) return res.status(401).json({ error: 'Not signed in.' });
    return res.status(200).json({ ok: true, ...l });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});

  if (body.signout) {
    res.setHeader('Set-Cookie', clearCookie());
    return res.status(200).json({ ok: true });
  }

  const gate = await checkLoginAllowed(req, RL);
  if (!gate.allowed) {
    res.setHeader('Retry-After', String(gate.retryAfterSec));
    return res.status(429).json({ error: 'Too many attempts. Try again in ' + Math.max(1, Math.ceil(gate.retryAfterSec / 60)) + ' minutes.' });
  }

  const slug = matchPasscode(body.pass);
  if (!slug) {
    await recordFailure(req, RL);
    await new Promise((r) => setTimeout(r, 400));
    return res.status(401).json({ error: 'That passcode did not match a proposal.' });
  }
  await clearFailures(req, RL);
  const slugs = Array.from(new Set([...sessionSlugs(req), slug]));
  res.setHeader('Set-Cookie', sessionCookie(slugs));
  const items = PROPOSALS.filter((p) => slugs.includes(p.slug)).map(meta);
  return res.status(200).json({ ok: true, admin: allowed(req).admin, items, opened: slug });
}
