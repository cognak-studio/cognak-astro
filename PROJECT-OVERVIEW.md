# cognak.com — Project Overview & How-To

A complete record of the cognak.com rebuild, the workflow, and how to add/edit
projects. Hand this to a fresh chat for full context.

---

## What this site is

cognak.com was migrated **off WordPress + GoDaddy hosting** onto a **static
[Astro](https://astro.build) site hosted on Vercel**. There is no CMS and no
database — every page is built from Markdown files and images that live in this
repo. You edit files, push to GitHub, and Vercel rebuilds and publishes in ~30s.

- **Live site:** https://cognak.com (HTTPS, `www` 301-redirects to the apex)
- **Repo:** `cognak-studio/cognak-astro` on GitHub
- **Host:** Vercel project `cognak-astro` (team COGNAK LLC), Git-connected →
  **auto-deploys on every push to `main`**
- **Local folder:** `/Users/pierceliefeld/Local Sites/cognak/cognak-astro`
- **Domain/DNS:** stays at GoDaddy (apex `A` → Vercel `216.198.79.1`); all
  Google Workspace **email records were left untouched** during migration.

---

## What was done (migration summary)

- Rebuilt all six page types in Astro to **pixel-match the old WordPress site**:
  home, projects archive, single-project, studio, privacy-policy, 404.
- Ported every behavior verbatim: the WebGL hero (UnicornStudio), Lenis smooth
  scroll, custom cursor (incl. the idle → 🐃 yak), the typewriter/scramble
  headline, project card tilt, particle field, matrix-glow on projects, the
  "type cognak for sparkles" easter egg, the 🐃 tab-title swap, native page
  transitions, GA4 + Google Ads tracking + consent banner.
- Migrated **all 51 projects** (text + images) from the live server.
- Recreated the branded **OG social share images**, **301 redirects**
  (`/project/*` → `/projects/*`), an XML **sitemap** (noindex projects
  excluded), `robots.txt`, and the **favicon**.
- Set up **Git auto-deploy**, a content workflow, and helper scripts (below).
- **Google Search Console:** Domain property verified (via DNS), sitemap
  submitted as the full URL `https://cognak.com/sitemap-index.xml`.

---

## The commands (your whole toolkit)

Run these from the project folder in Terminal (or use the double-click launcher):

| Goal | Command |
|---|---|
| Preview locally (auto-opens browser) | double-click **`dev.command`** — or `npm run dev` |
| **Create a new project** | `npm run new -- "Project Name"` |
| Generate social share cards | `npm run og` |
| Compress big gallery images | `npm run optimize` |
| Validate before pushing | `npm run check` |
| Publish | commit + push in **GitHub Desktop** (auto-deploys) |
| Manual deploy (fallback) | `npm run deploy` |

---

## How to ADD a project (full workflow)

1. **Scaffold it** — in Terminal, from the project folder:
   ```bash
   npm run new -- "Acme Co"
   ```
   This creates `src/content/projects/acme-co/index.md` with the title, slug,
   and today's date prefilled.

2. **Add images** to that new folder (`src/content/projects/acme-co/`):
   - `thumb.jpg` — square tile for the home + projects grids (**required**)
   - `hero.jpg` — large image atop the project page (**required**)
   - any gallery images, e.g. `01.jpg`, `02.jpg`

3. **Fill in the text** — open `acme-co/index.md` in Sublime and edit the
   frontmatter (category, the about/work/details blurbs, metaDescription). To
   feature it on the homepage, set `homepageFeature: true` and a
   `homepagePosition` number (lower = earlier).

4. **Generate its share card** (optional but recommended):
   ```bash
   npm run og
   ```

5. **Preview** — double-click `dev.command` and visit
   `http://localhost:4321/projects/acme-co`.

6. **Publish** — in GitHub Desktop: the new folder shows as changes → write a
   summary ("Add Acme Co") → **Commit to main** → **Push origin**. Vercel
   auto-builds and it's live at `cognak.com/projects/acme-co`.

The project page, both grids, the projects count, prev/next navigation, and the
sitemap all update automatically. No other files to touch.

### Project frontmatter reference
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
# heroVideo: /wp-content/uploads/2026/06/acme.mp4   # optional video hero
# noindex: true                   # hide from Google + sitemap
# draft: true                     # build but hide
---

<!-- Below the --- is the image gallery: -->
![](./01.jpg)
![](./02.jpg)
```
A copy-paste starter also lives at `src/content/projects/_template/`.

---

## How to EDIT a project

Open `src/content/projects/<slug>/index.md` in Sublime, change the text or swap
an image (keep the same filename to avoid touching the `.md`), then commit +
push in GitHub Desktop. If you changed the **title or hero**, run `npm run og`
first to refresh the share card.

---

## Repo layout

```
src/
  pages/            routes: home, projects/, projects/[slug], studio, privacy-policy, 404
  layouts/BaseLayout.astro   <head>, analytics/consent, cursor, cookie, footer, scripts
  content/projects/ one folder per project (the content) + _template/
  content/config.ts the project schema
public/
  js/               ported site behaviors (cursor, lenis, animations)
  wp-content/...     fonts, CSS, theme assets + gallery images
  og/               generated social share cards
scripts/            new-project.mjs, generate-og.py, optimize-images.mjs
dev.command         double-click launcher for local preview
vercel.json         301 redirects
astro.config.mjs    site config + sitemap
```

Other docs: `README.md` (detailed), `SUBLIME-SETUP.md` (editor), `RUN-ME-FIRST.md` (cheat sheet).

---

## Open housekeeping (no rush)

- Cancel the GoDaddy **hosting** plan once stable (keep the domain + DNS).
- Run `npm run optimize` once on the Mac to compress gallery images (~7.8 MB), commit + push.
- Delete the leftover `src/content/projects/demo-project/` folder (a draft, harmless).
- Search Console sitemap shows "Success" within a day or two of submission.
