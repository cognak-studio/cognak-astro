/**
 * /api/sitime-team — team access to the SiTime image tool.
 *   GET                         → { ok, role, name, teamOn }   (who am I)
 *   POST { action:'login', name, pass }   public, rate limited
 *   POST { action:'logout' }
 *   POST { action:'set', pass }           admin only; blank turns team access off
 * See api/_lib/sitimeAuth.mjs.
 */
import { isAdmin } from './_lib/adminAuth.mjs';
import { sitimeEditor, teamLogin, clearTeamCookie, setTeamPass, readTeam, readClient, passMatches } from './_lib/sitimeAuth.mjs';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const who = await sitimeEditor(req);
      const team = await readTeam(); const client = await readClient();
      return res.status(200).json({ ok: true, role: who ? who.role : null, name: who ? who.name : null, teamOn: !!team.hash, clientOn: !!client.hash });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    body = body || {};
    if (body.action === 'login') {
      const r = await teamLogin(req, body.name, body.pass);
      if (!r.ok) return res.status(r.status).json({ error: r.error });
      res.setHeader('Set-Cookie', r.cookie);
      return res.status(200).json({ ok: true });
    }
    if (body.action === 'logout') { res.setHeader('Set-Cookie', clearTeamCookie()); return res.status(200).json({ ok: true }); }
    if (body.action === 'set') {
      if (!isAdmin(req)) return res.status(401).json({ error: 'Admin only.' });
      const which = body.which === 'client' ? 'client' : 'team';
      const other = which === 'client' ? await readTeam() : await readClient();
      if (String(body.pass || '').trim() && passMatches(other, body.pass)) return res.status(400).json({ error: 'Use a different passcode from the ' + (which === 'client' ? 'team' : 'SiTime') + ' one.' });
      await setTeamPass(body.pass, which);
      const on = !!String(body.pass || '').trim();
      return res.status(200).json({ ok: true, which, teamOn: which === 'team' ? on : undefined, clientOn: which === 'client' ? on : undefined });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error('sitime-team failed', err);
    return res.status(502).json({ error: 'Something went wrong. Try again.' });
  }
}
