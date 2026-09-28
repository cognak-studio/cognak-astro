/**
 * /api/sitime-team — who may edit the SiTime image tool.
 *   GET                                  → { ok, role, name, uid, teamOn, clientOn }   (who am I)
 *   POST { action:'login', pass, name? } public, rate limited. A personal
 *                                        passcode signs its owner in; a shared
 *                                        passcode needs a name (400 + needName
 *                                        until one is given).
 *   POST { action:'logout' }
 *   POST { action:'set', which, pass }   admin: a shared passcode; blank turns it off
 *   People (admin only, Pierce 9/27):
 *   POST { action:'users' }                          → { users }   (no hashes)
 *   POST { action:'user-add', name, email, role }    → { user, passcode }  passcode shown once
 *   POST { action:'user-edit', id, name, email, role }
 *   POST { action:'user-pass', id }                  → { user, passcode }  new passcode, old session ends
 *   POST { action:'user-delete', id }
 * See api/_lib/sitimeAuth.mjs.
 */
import { isAdmin } from './_lib/adminAuth.mjs';
import { sitimeEditor, teamLogin, clearTeamCookie, setTeamPass, readTeam, readClient, passMatches, readUsers, publicUser, addUser, editUser, resetUserPass, deleteUser } from './_lib/sitimeAuth.mjs';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const who = await sitimeEditor(req);
      const team = await readTeam(); const client = await readClient();
      return res.status(200).json({ ok: true, role: who ? who.role : null, name: who ? who.name : null, uid: who ? who.uid || null : null, teamOn: !!team.hash, clientOn: !!client.hash });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    body = body || {};
    if (body.action === 'login') {
      const r = await teamLogin(req, body.name, body.pass);
      if (!r.ok) return res.status(r.status).json({ error: r.error, ...(r.needName ? { needName: true } : {}) });
      res.setHeader('Set-Cookie', r.cookie);
      return res.status(200).json({ ok: true, name: r.name, role: r.role });
    }
    if (body.action === 'logout') { res.setHeader('Set-Cookie', clearTeamCookie()); return res.status(200).json({ ok: true }); }

    if (!isAdmin(req)) return res.status(401).json({ error: 'Admin only.' });
    if (body.action === 'set') {
      const which = body.which === 'client' ? 'client' : 'team';
      const other = which === 'client' ? await readTeam() : await readClient();
      if (String(body.pass || '').trim() && passMatches(other, body.pass)) return res.status(400).json({ error: 'Use a different passcode from the ' + (which === 'client' ? 'team' : 'SiTime') + ' one.' });
      await setTeamPass(body.pass, which);
      const on = !!String(body.pass || '').trim();
      return res.status(200).json({ ok: true, which, teamOn: which === 'team' ? on : undefined, clientOn: which === 'client' ? on : undefined });
    }
    if (body.action === 'users') return res.status(200).json({ ok: true, users: (await readUsers()).map(publicUser) });
    if (body.action === 'user-add') { const r = await addUser(body); if (r.error) return res.status(400).json({ error: r.error }); return res.status(200).json({ ok: true, ...r }); }
    if (body.action === 'user-edit') { const r = await editUser(String(body.id || ''), body); if (r.error) return res.status(400).json({ error: r.error }); return res.status(200).json({ ok: true, ...r }); }
    if (body.action === 'user-pass') { const r = await resetUserPass(String(body.id || '')); if (r.error) return res.status(400).json({ error: r.error }); return res.status(200).json({ ok: true, ...r }); }
    if (body.action === 'user-delete') { const r = await deleteUser(String(body.id || '')); if (r.error) return res.status(400).json({ error: r.error }); return res.status(200).json({ ok: true }); }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error('sitime-team failed', err);
    return res.status(502).json({ error: 'Something went wrong. Try again.' });
  }
}
