#!/usr/bin/env python3
"""
Copy every picked SiTime image into the Site Imagery folder (Pierce, 9/24).

For each slot with a main or backup in the image tool, the file behind the
pick lands in that slot's folder under _source/:

  upload          the file as uploaded (pick.orig); older uploads fall back to
                  the same file name found in the SiTime Drive folder, then to
                  the tool's 2400px web copy
  Adobe Stock     the comp (1000px, watermarked), until it is licensed
  SiTime library  the original from Image Mapping/<path>
  generated       the generated image
  current site    the image from sitime.com

Named IMG-xxxx_<main|backup>_<source>_<name>.<ext>. When a pick changes, the
old file for that role moves to _superseded/ (never deleted). picks-log.csv
gets source_file and desc filled per row, and rows added for new picks.
Treated finals (B&W etc.) at the slot folder's root are not touched.

Signs in with the team passcode (Library > Team access):
  SITIME_TEAM_PASS=... python3 scripts/sitime-sync-imagery.py [--sitime DIR] [--dry-run]
"""
import argparse, csv, http.cookiejar, json, os, re, shutil, sys, urllib.request

SITE = os.environ.get('SITIME_SITE', 'https://cognak.com')
DEFAULT_SITIME = os.path.expanduser('~/Library/CloudStorage/GoogleDrive-pliefeld@gmail.com/My Drive/COGNAK/Clients/SiTime')
SECTIONS = {'Homepage': '01 Homepage', 'About Us': '02 About Us'}
LOG_COLS = ['page', 'slot_id', 'slot', 'role', 'file', 'source', 'asset_id', 'license_status', 'notes', 'source_file', 'desc']

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
opener.addheaders = [('User-Agent', 'Mozilla/5.0 (COGNAK imagery sync)')]


def api(path, body=None):
    req = urllib.request.Request(SITE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json'} if body is not None else {})
    with opener.open(req, timeout=60) as r:
        return json.loads(r.read().decode())


def fetch(url):
    with opener.open(url, timeout=120) as r:
        return r.read()


def slug(s, n=48):
    s = re.sub(r'\.[a-z0-9]{2,5}$', '', str(s or ''), flags=re.I)
    s = re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()
    return s[:n].rstrip('-') or 'image'


def clean(s):
    return re.sub(r'\s+', ' ', re.sub(r'[/:\\·]+', '-', str(s or ''))).strip(' -')


def ext_of(url, default='jpg'):
    m = re.search(r'\.(jpe?g|png|webp|tiff?|gif)(?:$|\?)', url or '', re.I)
    return (m.group(1).lower().replace('jpeg', 'jpg') if m else default)


def find_slot_dir(sec_dir, sid):
    for root, dirs, _ in os.walk(sec_dir):
        if root.count(os.sep) - sec_dir.count(os.sep) > 2:
            dirs[:] = []
            continue
        for d in dirs:
            if d.endswith('(' + sid + ')'):
                return os.path.join(root, d)
    return None


def slot_dir(imagery, s, order, dry):
    sec = SECTIONS.get(s.get('section'))
    if not sec:
        return None
    sec_dir = os.path.join(imagery, sec)
    found = find_slot_dir(sec_dir, s['id'])
    if found:
        return found
    if s['section'] == 'Homepage':
        parent = sec_dir
        n = order['slot']
        label = clean(s['name'].replace('Hero carousel', 'Hero').replace('Applications', 'Card').replace('Careers block', 'Careers'))
    else:
        pages = order['pages']
        page_name = '%02d %s' % (pages.index(s['page']) + 1, clean(s['page']))
        parent = os.path.join(sec_dir, page_name)
        n = order['slot']
        label = clean(s['name'])
    d = os.path.join(parent, '%02d %s (%s)' % (n, label, s['id']))
    if not dry:
        os.makedirs(d, exist_ok=True)
    return d


def find_local(sitime, name, skip, skip_names=()):
    """A same-named file in the SiTime folder outside Site Imagery; failing
    that, in Site Imagery itself (a slot's _color/ or _candidates/), never in
    the _source/ or _superseded/ folders this script writes."""
    if not name:
        return None
    for root, dirs, files in os.walk(sitime, followlinks=True):
        dirs[:] = [d for d in dirs if os.path.join(root, d) != skip and d not in skip_names and not d.startswith('.')]
        if name in files:
            return os.path.join(root, name)
    return None


def source_of(p, sitime, imagery, lib):
    """-> (label, ext, getter, kind, asset_id). getter() returns bytes or a local path."""
    src = p.get('source')
    title = p.get('title') or ''
    if src == 'stock':
        aid = str(p.get('id') or '')
        return ('adobe-%s_comp' % aid, ext_of(p.get('url')), lambda: fetch(p['url']), 'Adobe Stock comp', aid)
    if src == 'library':
        entry = lib.get(p.get('id')) or {}
        tier = p.get('tier') or entry.get('tier')
        orig = p.get('orig') or entry.get('orig')
        path = p.get('path') or entry.get('path') or ''
        if tier == 'upload' or (not tier and '/' not in path):
            name = entry.get('name') or title
            if orig:
                return ('upload_' + slug(name), ext_of(orig), lambda: fetch(orig), 'Upload (original)', '')
            local = find_local(sitime, name, imagery) or find_local(imagery, name, None, skip_names=('_source', '_superseded'))
            if local:
                kind = 'Envato Elements (Image Library)' if '/Image Library/' in local else 'Upload (original, from Drive)'
                return (('envato_' if 'Envato' in kind else 'upload_') + slug(name), ext_of(local), lambda: local, kind, '')
            return ('upload_' + slug(name) + '_web2400', ext_of(p.get('url')), lambda: fetch(p['url']), 'Upload (tool web copy, 2400px)', '')
        local = os.path.join(sitime, 'Image Mapping', path) if path else None
        if local and os.path.exists(local):
            return ('sitime-library_' + slug(os.path.basename(path)), ext_of(local), lambda: local, 'SiTime licensed library', '')
        return ('sitime-library_' + slug(title) + '_web', ext_of(p.get('url')), lambda: fetch(p['url']), 'SiTime licensed library (web copy)', '')
    if src == 'generated':
        return ('generated_' + slug(p.get('id') or title), ext_of(p.get('url'), 'png'), lambda: fetch(p['url']), 'Generated (Gemini)', '')
    if src == 'existing':
        return ('current-site_' + slug(os.path.basename(p.get('url') or '')), ext_of(p.get('url')), lambda: fetch(p['url']), 'Current sitime.com image', '')
    return ('pick_' + slug(title), ext_of(p.get('url')), lambda: fetch(p['url']), src or 'unknown', '')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sitime', default=DEFAULT_SITIME, help='the SiTime Drive folder')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    imagery = os.path.join(a.sitime, 'Site Imagery')
    if not os.path.isdir(imagery):
        sys.exit('No Site Imagery folder at ' + imagery)
    pw = os.environ.get('SITIME_TEAM_PASS', '').strip()
    if not pw:
        sys.exit('Set SITIME_TEAM_PASS to the team passcode (admin > Library > Team access).')
    try:
        api('/api/sitime-team', {'action': 'login', 'name': 'Imagery sync', 'pass': pw})
        data = api('/api/sitime-state')
    except urllib.error.HTTPError as e:
        sys.exit('Sign-in or load failed: %s %s' % (e.code, e.read().decode()[:200]))
    state = data['state']
    lib = {l['id']: l for l in state.get('library') or []}
    slots = [s for s in state['slots'] if s.get('section') in SECTIONS]

    # numbering for folders that don't exist yet: seed order within page / section
    about_pages = []
    for s in slots:
        if s['section'] == 'About Us' and s['page'] not in about_pages:
            about_pages.append(s['page'])
    counters = {}

    log_path = os.path.join(imagery, 'picks-log.csv')
    rows = []
    if os.path.exists(log_path):
        with open(log_path, newline='') as f:
            rows = list(csv.DictReader(f))
    by_key = {(r['slot_id'], r['role']): r for r in rows}

    copied = kept = moved = failed = 0
    for s in slots:
        key = s['page'] if s['section'] == 'About Us' else s['section']
        counters[key] = counters.get(key, 0) + 1
        for role in ('main', 'backup'):
            p = s.get(role)
            if not p or not p.get('url'):
                continue
            d = slot_dir(imagery, s, {'slot': counters[key], 'pages': about_pages}, a.dry_run)
            if not d:
                continue
            label, ext, get, kind, aid = source_of(p, a.sitime, imagery, lib)
            fname = '%s_%s_%s.%s' % (s['id'], role, label, ext)
            src_dir = os.path.join(d, '_source')
            target = os.path.join(src_dir, fname)
            prefix = '%s_%s_' % (s['id'], role)
            if os.path.isdir(src_dir):
                for old in os.listdir(src_dir):
                    if old.startswith(prefix) and old != fname:
                        sup = os.path.join(d, '_superseded')
                        print('  superseded', old)
                        if not a.dry_run:
                            os.makedirs(sup, exist_ok=True)
                            dest = os.path.join(sup, old)
                            if os.path.exists(dest):
                                dest = os.path.join(sup, re.sub(r'(\.[^.]+)$', r'_%d\1' % int(os.path.getmtime(os.path.join(src_dir, old))), old))
                            shutil.move(os.path.join(src_dir, old), dest)
                        moved += 1
            if os.path.exists(target):
                kept += 1
            else:
                print('%s %s -> %s' % (s['id'], role, os.path.relpath(target, imagery)))
                if not a.dry_run:
                    os.makedirs(src_dir, exist_ok=True)
                    try:
                        got = get()
                    except Exception as e:
                        print('  FAILED:', e)
                        failed += 1
                        continue
                    if isinstance(got, str):
                        shutil.copy2(got, target)
                    else:
                        with open(target + '.part', 'wb') as f:
                            f.write(got)
                        os.replace(target + '.part', target)
                copied += 1
            r = by_key.get((s['id'], role))
            if not r:
                r = {'page': s['page'], 'slot_id': s['id'], 'slot': clean(s['name']), 'role': role}
                rows.append(r)
                by_key[(s['id'], role)] = r
            r['source_file'] = os.path.relpath(target, os.path.dirname(os.path.dirname(target)))
            r['desc'] = p.get('desc') or ''
            if not r.get('source'):
                r['source'] = kind
            if aid and not r.get('asset_id'):
                r['asset_id'] = aid
            if kind == 'Adobe Stock comp' and not r.get('license_status'):
                r['license_status'] = 'Comp only - license after approval'

    order = {sid: i for i, sid in enumerate(s['id'] for s in slots)}
    rows.sort(key=lambda r: (order.get(r['slot_id'], 1e9), 0 if r['role'] == 'main' else 1))
    if not a.dry_run:
        with open(log_path + '.part', 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=LOG_COLS, extrasaction='ignore')
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k, '') for k in LOG_COLS})
        os.replace(log_path + '.part', log_path)
    print('%d copied, %d already there, %d superseded, %d failed%s' % (copied, kept, moved, failed, ' (dry run)' if a.dry_run else ''))


if __name__ == '__main__':
    main()
