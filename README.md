# cognak.com — Astro site

Static [Astro](https://astro.build) rebuild of cognak.com. Deploys to Vercel.
Content lives as Markdown + images in the repo — no CMS, no database.

---

## Run it locally

```bash
npm install      # first time only
npm run dev      # http://localhost:4321
```

`npm run build` produces the static site in `dist/`. `npm run preview` serves that build.

---

## Adding a new project

A project is just a folder under `src/content/projects/<slug>/` containing an
`index.md` and its images. The `<slug>` becomes the URL: `/projects/<slug>`.

1. **Create the folder + images.** Drop in:
   - `thumb.jpg` — the square tile shown in the home + projects grids
   - `hero.jpg` — the large image at the top of the project page
   - (optional) `hover.jpg` — the cursor-preview image on hover
   - any gallery images you want in the body

2. **Create `src/content/projects/<slug>/index.md`:**

```markdown
---
title: Acme Co
slug: acme-co
category: Web, Branding, Logo        # the tag shown in the projects list
date: 2026-06-01                     # drives the "newest" sort
projectType: Web Design              # shown in the home hover metadata
projectYear: 2026
thumbnail: ./thumb.jpg               # required
hero: ./hero.jpg                     # required
hover: ./hover.jpg                   # optional
homepageFeature: true                # show on the homepage grid?
homepagePosition: 5                  # order on the homepage (lower = earlier)
metaDescription: One-line description for SEO + social.
# heroVideo: /wp-content/uploads/2026/06/acme.mp4   # optional video hero
# noindex: true                      # hide from search engines + sitemap
---

<!-- Everything below the --- is the project's image gallery (HTML or Markdown). -->
<p><img src="/wp-content/uploads/2026/06/acme-1.jpg" alt="" width="2048" height="1200" /></p>
![Another shot](./02.jpg)
```

3. **Generate its share card** (optional but nice):

```bash
npm run og       # builds public/og/<slug>.jpg for every project
```
   If you skip this, sharing the page just uses the hero image instead.

4. **Deploy** (see below). Done — the project page, both grids, the sitemap, and
   prev/next navigation all update automatically.

### Image notes
- `thumbnail` / `hero` / `hover` are optimized automatically (resized + WebP).
- Gallery images in the body referenced as `/wp-content/uploads/...` must exist
  under `public/wp-content/uploads/...`. Images referenced as `./file.jpg`
  (relative) are optimized like the hero.

---

## Editing an existing project

Open `src/content/projects/<slug>/index.md` and edit the fields or body. To swap an
image, replace the file in the project folder (keep the same name) or update the
path in the frontmatter. Re-run `npm run og` if you changed the title or hero, then
deploy.

### Common tweaks
- **Feature on homepage:** set `homepageFeature: true` and a `homepagePosition`.
- **Hide a project from Google:** add `noindex: true` (also drops it from the sitemap).
- **Take a project offline without deleting it:** add `draft: true`.

---

## Deploying

**If Git auto-deploy is set up (recommended):** just commit and push.
```bash
git add -A && git commit -m "Add Acme Co project" && git push
```
Vercel builds and publishes automatically (~1 min). Pull requests get their own
preview URLs.

**Manual (no Git):**
```bash
npx vercel --prod
```

---

## Project structure

```
src/
  pages/            # routes: index (home), projects/, projects/[slug], studio, privacy-policy, 404
  layouts/BaseLayout.astro   # <head>, analytics/consent, cursor, cookie banner, footer, scripts
  content/projects/ # one folder per project (the content)
  content/config.ts # the project schema (frontmatter fields)
public/
  js/               # ported site behaviors (cursor, lenis, animations) — edit with care
  wp-content/...     # mirrored fonts, CSS, theme assets + uploaded gallery images
  og/               # generated social share cards
scripts/generate-og.py   # regenerates the og/ cards
vercel.json         # 301 redirects (/project/* -> /projects/*)
astro.config.mjs    # site config + sitemap
```
