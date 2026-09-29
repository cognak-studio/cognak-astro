/* One-off import (COGNAK, 9/29/26): SiTime product imagery with the 2026 logo.
   Run once in the signed-in admin page (cognak.com/workflows/sitime/admin).
   Uploads each file to the library the same way the drawer upload does,
   fills existing slots' main (only when empty), and adds custom slots
   (IMG-8xxx, custom:true) per part. Safe to re-run: skips what exists. */
async function sitimeImport(dry) {
  const B = '/workflows/sitime/_import/';
  const plan = await (await fetch(B + 'plan.json', { cache: 'no-store' })).json();
  const g = await fetch('/api/sitime-state', { credentials: 'same-origin' });
  const gj = await g.json().catch(() => null);
  if (!g.ok || !gj || !gj.state) return { error: 'GET state failed', status: g.status };
  const S = gj.state; const WHO = 'COGNAK (import)'; const now = new Date().toISOString();
  S.library = S.library || [];
  const sha1 = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
  async function resize(blob, max, mime) {
    const bm = await createImageBitmap(blob);
    const sc = Math.min(1, max / Math.max(bm.width, bm.height));
    const c = document.createElement('canvas'); c.width = Math.round(bm.width * sc); c.height = Math.round(bm.height * sc);
    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
    const out = await new Promise((res) => c.toBlob(res, mime, 0.84));
    const r = { blob: out, w: bm.width, h: bm.height }; bm.close && bm.close(); return r;
  }
  const { upload } = dry ? {} : await import('https://esm.sh/@vercel/blob@1/client');
  const lib = {}; let uploaded = 0;
  for (const [h, f] of Object.entries(plan.files)) {
    const id = await sha1('import-2026logo/' + h);
    let e = S.library.find((l) => l.id === id);
    if (!e && !dry) {
      const blob = await (await fetch(B + f.file)).blob();
      const mime = /png$/i.test(f.file) ? 'image/png' : 'image/jpeg'; const ext = mime === 'image/png' ? 'png' : 'jpg';
      const web = await resize(blob, 2400, mime), th = await resize(blob, 400, mime);
      const o = { access: 'public', handleUploadUrl: '/api/sitime-upload-token', contentType: mime };
      const r1 = await upload('sitime/library/' + id + '.' + ext, web.blob, o);
      const r2 = await upload('sitime/library/t/' + id + '.' + ext, th.blob, o);
      e = { id, path: f.name, name: f.name, group: 'Product imagery (2026 logo)', tier: 'upload', url: r1.url, thumb: r2.url, w: web.w, h: web.h };
      S.library.push(e); uploaded++;
    }
    lib[h] = e || { id, url: 'DRY', thumb: 'DRY', name: f.name, path: f.name, tier: 'upload' };
  }
  const pick = (e) => ({ source: 'library', id: e.id, url: e.url, thumb: e.thumb, title: e.name, path: e.path, tier: e.tier });
  let n = 8000; S.slots.concat(S.retiredSlots || []).forEach((x) => { const m = String(x.id || '').match(/^IMG-(8\d{3})$/); if (m) n = Math.max(n, +m[1]); });
  const rep = { filled: 0, added: 0, skippedFull: [], missing: [], exists: 0 };
  for (const x of plan.plan) {
    const p = pick(lib[x.file]);
    if (x.kind === 'existing') {
      const s = S.slots.find((q) => q.id === x.slotId);
      if (!s) { rep.missing.push(x.slotId); continue; }
      if (s.main && s.main.url !== p.url) { rep.skippedFull.push(x.slotId); continue; }
      if (!s.main) { s.main = p; if (!s.state || s.state === 'unassigned' || s.state === 'unreviewed') s.state = 'assigned'; s.edit = { by: WHO, at: Date.now() }; rep.filled++; }
    } else {
      const a = S.slots.find((q) => q.id === x.anchor);
      if (!a) { rep.missing.push(x.anchor); continue; }
      if (S.slots.some((q) => q.custom && q.pageId === a.pageId && q.name === x.name)) { rep.exists++; continue; }
      S.slots.push({ id: 'IMG-' + (++n), pageId: a.pageId, page: a.page, section: a.section, url: a.url || '', name: x.name, priority: a.priority || 'Medium',
        rec: 'Existing sitime.com image, logo updated to 2026 where it had one (COGNAK, 9/29)', action: 'EXISTING', gen: 'NO', prompt: '', terms: [], shared: false, existing: [], candidates: [],
        main: p, backup: null, state: 'assigned', batch: null, license: null, notes: '', where: x.where || '', custom: true, addedBy: WHO, addedAt: now, edit: { by: WHO, at: Date.now() } });
      rep.added++;
    }
  }
  rep.uploaded = uploaded; rep.library = S.library.length; rep.slots = S.slots.length;
  if (dry) return rep;
  const r = await fetch('/api/sitime-state', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: S, baseSavedAt: S.savedAt || 0 }) });
  rep.post = r.status; rep.resp = await r.json().catch(() => null); if (rep.resp && rep.resp.state) delete rep.resp.state;
  return rep;
}
