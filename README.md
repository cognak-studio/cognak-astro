# cognak.com — Astro site

Static [Astro](https://astro.build) rebuild of cognak.com, hosted on Vercel.
It's plain files — text in Markdown, images in folders. No CMS, no database, no
hosting panel. You edit files, push to GitHub, and Vercel rebuilds and publishes
in ~30 seconds.

- **Live site:** https://cognak.com
- **Local folder:** `/Users/pierceliefeld/Local Sites/clients/cognak-astro`
- **Deploys:** auto-builds on every push to `main`; pull requests get preview URLs.

---

## The only commands you need

Run these from the project folder (or use the double-click launchers).

| I want to…                        | Do this                                            |
|-----------------------------------|----------------------------------------------------|
| Preview the site on my computer   | Double-click **`dev.command`** (or `npm run dev`)  |
| Start a new project               | `npm run new -- "Project Name"`                    |
| Make its share image              | `npm run og`                                       |
| Compress big gallery images       | `npm run optimize`                                 |
| Check for mistakes before pushing | `npm run check`                                    |
| Publish changes                   | Commit + push in **GitHub Desktop** (auto-deploys) |
| Manual deploy (fallback)          | `npm run deploy`                                   |

First time only: `npm install`. `npm run build` produces the static site in
`dist/`; `npm run preview` serves that build.

---

## Add a project — quick version

1. `npm run new -- "Acme Co"` → creates the folder + a starter `index.md`
2. Drop `thumb.jpg` (square) and `hero.jpg` (large) into that new folder
3. Open its `index.md`, fill in the text, then commit + push

That's it — the project page, both grids, the projects count, prev/next
navigation, and the sitemap all update automatically. A copy-paste starter also
lives at `src/content/projects/_template/`.

### Full workflow

A project is just a folder under `src/content/projects/<slug>/` containing an
`index.md` and its images. The `<slug>` becomes the URL: `/projects/<slug>`.

1. **Scaffold it:** `npm run new -- "Acme Co"` creates
   `src/content/projects/acme-co/index.md` with the title, slug, and today's
   date prefilled.
2. **Add images** to that folder:
   - `thumb.jpg` — square tile for the home + projects grids (**required**)
   - `hero.jpg` — large image atop the project page (**required**)
   - `hover.jpg` — optional cursor-preview image on hover
   - any gallery images, e.g. `01.jpg`, `02.jpg`
3. **Fill in the text** — edit the frontmatter (category, the about/work/details
   blurbs, metaDescription). To feature it on the homepage, set
   `homepageFeature: true` and a `homepagePosition` (lower = earlier).
4. **Generate its share card** (optional but nice): `npm run og`. If you skip
   this, sharing the page just uses the hero image instead.
5. **Preview** — double-click `dev.command` and visit
   `http://localhost:4321/projects/acme-co`.
6. **Publish** — commit + push in GitHub Desktop. Vercel auto-builds and it's
   live at `cognak.com/projects/acme-co`.

### Frontmatter reference

```markdown
---
title: Acme Co
slug: acme-co
category: Web, Branding, Logo     # tag shown in the projects list
date: 2026-06-21                  # drives the "newest" sort
projectType: Web Design           # shown in home grid hover metadata
projectYear: 2026
thumbnail: ./thumb.jpg            # REQUIRED
hero: ./hero.jpg                  # REQUIRED
hover: ./hover.jpg               # OPTIONAL cursor-preview image
homepageFeature: false            # true = on homepage grid
homepagePosition: 7               # order if featured
metaDescription: One line for SEO + social.
aboutTheClient: <p>Who they are.</p>
theWork: <p>What COGNAK did.</p>
moreDetails: <p>• Point one</p><p>• Point two</p>
# heroVideo: /uploads/2026/06/acme.mp4   # optional video hero
# noindex: true                   # hide from Google + sitemap
# draft: true                     # build but hide
---

<!-- Below the --- is the image gallery (HTML or Markdown): -->
![](./01.jpg)
![](./02.jpg)
```

### Image notes

- `thumbnail` / `hero` / `hover` are optimized automatically (resized + WebP).
- Gallery images referenced relatively as `./file.jpg` are optimized like the
  hero. Images referenced as `/uploads/...` must exist under `public/uploads/...`
  and are served as-is — run `npm run optimize` to generate their WebP versions.

---

## Editing a project

Open `src/content/projects/<slug>/index.md` and edit the fields or body. To swap
an image, replace the file in the project folder (keep the same name) or update
the path in the frontmatter, then commit + push. If you changed the **title or
hero**, run `npm run og` first to refresh the share card.

Common tweaks:

- **Feature on homepage:** set `homepageFeature: true` and a `homepagePosition`.
- **Hide from Google:** add `noindex: true` (also drops it from the sitemap).
- **Take offline without deleting:** add `draft: true`.

---

## Deploying

**Git auto-deploy (recommended):** just commit and push — in GitHub Desktop, or:

```bash
git add -A && git commit -m "Add Acme Co project" && git push
```

Vercel builds and publishes automatically (~1 min). Pull requests get their own
preview URLs.

**Manual (fallback):** `npm run deploy` (i.e. `npx vercel --prod`).

---

## Repo structure

```
src/
  pages/            routes: home, projects/, projects/[slug], studio, privacy-policy, 404
  layouts/BaseLayout.astro   <head>, analytics/consent, cursor, cookie banner, footer, scripts
  content/projects/ one folder per project (the content) + _template/
  content.config.ts the project schema (frontmatter fields)
  styles/           reset.css, screen.css, custom.css (bundled via site.css)
public/
  js/               ported site behaviors (cursor, lenis, animations) — edit with care
  theme/            fonts, CSS, theme assets ported from the old site
  uploads/          gallery images (mirrors the old /wp-content/uploads paths)
  og/               generated social share cards
scripts/            new-project.mjs, generate-og.py, optimize-images.mjs
dev.command         double-click launcher for local preview
vercel.json         301 redirects (/project/* → /projects/*, /wp-content/* → current paths) + headers/CSP
astro.config.mjs    site config + sitemap
```

Other docs: **`SUBLIME-SETUP.md`** (editor setup) · **`ACCESSIBILITY-AUDIT.md`**
(WCAG 2.1 AA review record).

---

## SEO / entity disambiguation (2026-07-08)

To help Google treat "COGNAK" as a distinct entity rather than an autocorrect
target for "cognac":

- Created two Wikidata items: **COGNAK** ([Q140469493](https://www.wikidata.org/wiki/Q140469493))
  and **Pierce Liefeld** ([Q140469514](https://www.wikidata.org/wiki/Q140469514)),
  linked via founder (P112).
- Added the COGNAK Wikidata URL to the `sameAs` array in the `ProfessionalService`
  JSON-LD schema in `src/layouts/BaseLayout.astro`.
- Wrapped the three CSSDA award badges on the studio page
  (`src/pages/studio.astro`, `#award-badges-pop`) in links to the
  [CSS Design Awards listing](https://www.cssdesignawards.com/sites/cognak/35561/).
  Intentionally left non-interactive in practice (`pointer-events: none` except
  during the brief `.is-active` hover/tap state, and even then the hover
  trigger is bound only to the "award-winning" text, not the badges) — the
  links exist for crawlers without visually announcing that the award is for
  cognak.com itself.

---

## JS cache busting (2026-07-09)

The scripts in `public/js/` aren't content-hashed by the build, but Vercel serves
them with a 24-hour cache (+30-day stale-while-revalidate, see `vercel.json`).
After a deploy, phones could keep running day-old cached JS against fresh
HTML/CSS — this is what broke the WebGL backgrounds on the mobile homepage and
`/studio` (a private tab worked; the normal tab served stale scripts).

Fix: `src/layouts/BaseLayout.astro` appends `?v=${jsV}` to every `/js/` script
tag, where `jsV` is the first 8 chars of the deploy's commit SHA
(`VERCEL_GIT_COMMIT_SHA`, falling back to an hour-rounded timestamp locally).
The value is stable across a build, changes every deploy, and makes browsers
fetch fresh copies immediately.

**If you add a new script under `public/js/`, load it through BaseLayout with
the same `?v=${jsV}` pattern** — a bare `<script src="/js/...">` tag reintroduces
the stale-cache problem.

---

## Migration summary (for context)

cognak.com was migrated off WordPress + GoDaddy hosting onto this static Astro
site on Vercel. The rebuild pixel-matches the old site across all six page types
(home, projects archive, single project, studio, privacy-policy, 404) and ports
every behavior verbatim: the WebGL hero (UnicornStudio), Lenis smooth scroll, the
custom cursor (including the idle → 🐃 yak), the typewriter/scramble headline,
project card tilt, the particle field, the projects matrix-glow, the "type
cognak for sparkles" easter egg, the 🐃 tab-title swap, native page transitions,
and GA4 + Google Ads tracking with a consent banner.

Every project (text + images) was migrated from the live server, along with the
branded OG share cards, 301 redirects, an XML sitemap (noindex projects
excluded), `robots.txt`, and the favicon. Git auto-deploy and the helper scripts
above complete the workflow. Email and domain are independent of deploys —
pushing code never touches them.
