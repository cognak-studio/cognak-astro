#!/usr/bin/env python3
"""
Generate branded Open Graph share images for every project.

Mirrors the old WordPress og-image.php compositor: the project's hero (or hover)
image on the right panel, the client name centered in the left panel, on top of
assets/images/og-template.jpg.

Usage:
    pip install pillow pyyaml
    python3 scripts/generate-og.py

Output: public/og/<slug>.jpg  (1200x630)

Run this after adding or renaming a project so its social share card exists.
(If you skip it, the site falls back to the project's hero image for sharing.)
"""
import os, glob, yaml
from PIL import Image, ImageDraw, ImageFont

# Repo root = parent of this script's directory
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS   = os.path.join(BASE, "public/wp-content/themes/cognak-black/assets")
TEMPLATE = os.path.join(ASSETS, "images/og-template.jpg")
FONT     = os.path.join(ASSETS, "fonts/Inter-Medium.ttf")
OUT      = os.path.join(BASE, "public/og")
PROJ     = os.path.join(BASE, "src/content/projects")

HERO_X, HERO_W = 590, 610
TEXT_CX, TEXT_Y, TSIZE = 291, 468, 39

os.makedirs(OUT, exist_ok=True)

def load_front(md):
    t = open(md, encoding="utf-8").read()
    if not t.startswith("---"):
        return None
    return yaml.safe_load(t.split("---", 2)[1])

def pick_img(folder, fm):
    for key in ("hover", "hero", "thumbnail"):
        v = fm.get(key)
        if v:
            p = os.path.join(folder, v.lstrip("./"))
            if os.path.exists(p):
                return p
    return None

made = skipped = 0
for folder in sorted(glob.glob(PROJ + "/*")):
    md = os.path.join(folder, "index.md")
    if not os.path.exists(md):
        continue
    fm = load_front(md)
    if not fm or fm.get("draft"):
        skipped += 1
        continue
    slug = fm.get("slug") or os.path.basename(folder)
    title = str(fm.get("title", ""))
    himg = pick_img(folder, fm)

    canvas = Image.open(TEMPLATE).convert("RGB")
    CW, CH = canvas.size
    if himg:
        hero = Image.open(himg).convert("RGB")
        hw, hh = hero.size
        scale = HERO_W / hw
        dst_h = min(int(hh * scale), CH)
        hero_y = max(0, (CH - dst_h) // 2)
        shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        for i in range(5, 0, -1):
            t = i / 5
            expand = int(t * 25)
            op = max(0, int((127 - (118 + t * 8)) / 127 * 255))
            sd.rectangle([HERO_X - expand, hero_y + 6, HERO_X + HERO_W + expand, hero_y + dst_h + 6 + expand], fill=(0, 0, 0, op))
        canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB")
        canvas.paste(hero.resize((HERO_W, dst_h)), (HERO_X, hero_y))

    d = ImageDraw.Draw(canvas)
    if len(title) > 18:
        size, lh = 34, 52
        words = title.split(" ")
        mid, run, best_i, best_d = len(title) / 2, 0, 1, 10**9
        for w in range(len(words) - 1):
            run += len(words[w]) + 1
            if abs(run - mid) < best_d:
                best_d, best_i = abs(run - mid), w + 1
        lines = [" ".join(words[:best_i]), " ".join(words[best_i:])]
        font = ImageFont.truetype(FONT, size)
        y1 = TEXT_Y - lh // 2 - 5
        for li, line in enumerate(lines):
            d.text((TEXT_CX, y1 + li * lh), line, font=font, fill=(255, 255, 255), anchor="ms")
    else:
        font = ImageFont.truetype(FONT, TSIZE)
        d.text((TEXT_CX, TEXT_Y), title, font=font, fill=(255, 255, 255), anchor="ms")

    canvas.save(os.path.join(OUT, slug + ".jpg"), quality=92)
    made += 1

print(f"Generated {made} OG images, skipped {skipped} (drafts).")
