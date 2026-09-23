"""
Crawl the live sitime.com for every page in the SiTime image tool's seed and
record the images each page shows today, as page.current = [[url, hero], ...]
(hero first). Feeds the "Currently on sitime.com" strip in admin.astro and the
"Show original" view on review.astro. Written 2026-09-23 because Ace's Drupal
export kept at most two images per page and none for 36 pages that have some.

  python3 scripts/sitime-crawl-current.py            # crawl + write the seed

Only <main> is read (nav, footer and the mega-menu tiles are skipped), styled
derivatives are mapped back to the original file, SVG icons and award logos
are dropped, and anything on more than 50 pages (site-wide pop-ups) is dropped.
Pages that 404 or have no sitime.com path keep Ace's drupalImages as fallback.
"""
import json, re, sys, urllib.parse, collections, concurrent.futures as cf
import requests
from bs4 import BeautifulSoup

SEED = 'api/_lib/sitime-seed.json'
B = 'https://www.sitime.com'
F = B + '/sites/default/files/'
SKIP = ('menu_image_link', 'logo_award', '/icons/', 'favicon')
S = requests.Session(); S.headers['User-Agent'] = 'Mozilla/5.0 (COGNAK image inventory)'

def norm(u):
    u = urllib.parse.urljoin(B, u.split('?')[0].strip())
    m = re.match(r'(https://www\.sitime\.com/sites/default/files/)styles/([^/]+)/public/(.+)$', u)
    style = None
    if m:
        style = m.group(2); u = m.group(1) + m.group(3)
        if re.search(r'\.(jpe?g|png|gif)\.webp$', u, re.I): u = u[:-5]
    return u, style

def crawl(path):
    try:
        r = S.get(B + path.split('#')[0], timeout=30)
        if r.status_code != 200: return path, None
        s = BeautifulSoup(r.text, 'html.parser'); m = s.find('main') or s.body
        out, seen = [], set()
        for el in m.find_all(['source', 'img']):
            raw = el.get('srcset') or el.get('data-srcset') or el.get('src') or el.get('data-src')
            if not raw: continue
            raw = raw.split(',')[0].split()[0]
            if 'sites/default/files' not in raw or any(k in raw for k in SKIP): continue
            if raw.split('?')[0].lower().endswith(('.svg', '.mp4', '.gif')): continue
            u, st = norm(raw)
            if u in seen: continue
            seen.add(u); out.append([u, 1 if ((st and 'hero' in st) or '/heros/' in u) else 0])
        return path, out
    except Exception:
        return path, None

def main():
    seed = json.load(open(SEED))
    pages = seed['pages'] if isinstance(seed['pages'], list) else list(seed['pages'].values())
    paths = sorted({p['url'] for p in pages if (p.get('url') or '').startswith('/') and ' ' not in p['url']})
    res = {}
    with cf.ThreadPoolExecutor(8) as ex:
        for p, v in ex.map(crawl, paths): res[p] = v
    freq = collections.Counter(u for v in res.values() if v for u, _ in v)
    common = {u for u, n in freq.items() if n > 50}
    n_live = n_fb = 0
    for p in pages:
        live = [i for i in (res.get(p.get('url')) or []) if i[0] not in common]
        live.sort(key=lambda i: -i[1])
        if live:
            p['current'] = live; p['currentFrom'] = 'sitime.com 2026-09-23'; n_live += 1
        elif p.get('drupalImages'):
            p['current'] = [[u, 1 if u == p.get('drupalHero') else 0] for u in p['drupalImages']]
            p['current'].sort(key=lambda i: -i[1]); p['currentFrom'] = 'Drupal export'; n_fb += 1
        else:
            p.pop('current', None); p.pop('currentFrom', None)
    json.dump(seed, open(SEED, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('crawled', len(paths), 'live', n_live, 'fallback', n_fb, 'dropped-common', len(common))

if __name__ == '__main__':
    main()
