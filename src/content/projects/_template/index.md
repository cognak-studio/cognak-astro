---
# ─────────────────────────────────────────────────────────────
# PROJECT TEMPLATE — duplicate this folder to add a new project.
# The leading underscore on "_template" keeps it OUT of the build,
# so this file is just a reference. Copy it, don't edit it.
# ─────────────────────────────────────────────────────────────

title: Project Name            # shown everywhere (grid, page title, OG card)
slug: project-name             # the URL → /projects/project-name  (lowercase, hyphens)
category: Web, Branding, Logo  # the tag in the projects list view
date: 2026-06-21               # publish date — drives the "newest" sort
projectType: Web Design        # shown in the home grid hover metadata
projectYear: 2026

thumbnail: ./thumb.jpg         # REQUIRED — the square tile in both grids
hero: ./hero.jpg               # REQUIRED — the big image atop the project page
# hover: ./hover.jpg           # OPTIONAL — cursor-preview image on hover

homepageFeature: false         # true = show on the homepage grid
# homepagePosition: 7          # if featured, its order (lower number = earlier)

metaDescription: One sentence describing the project, for SEO + social sharing.

# ── Optional flags ──
# heroVideo: /media/2026/06/project.mp4   # autoplay video hero instead of image
# noindex: true                # hide from Google + sitemap
# draft: true                  # build-but-hide (not published)

# ── Optional rich text columns (HTML allowed) ──
aboutTheClient: <p>Who the client is.</p>
theWork: <p>What COGNAK did.</p>
moreDetails: <p>• Bullet one</p><p>• Bullet two</p>
---

<!-- Everything below the --- is the project's image gallery.
     Use Markdown for images stored in THIS folder: -->
![](./01.jpg)
![](./02.jpg)

<!-- ...or raw HTML for full-width images already in /public/media/: -->
<p><img src="/media/2026/06/project-wide.jpg" alt="Project Name — wide" width="2048" height="1200" /></p>
