# cognak.com → Vercel Migration Runbook

**Goal:** Move cognak.com off GoDaddy hosting. Kill WordPress. Rebuild as a static Astro site on Vercel, with content as markdown in the repo. Keep Google Workspace email working throughout.

**Domain stays registered at GoDaddy. Only hosting moves.** Email never moves — it already lives on Google's servers.

---

## Target Stack

- **Framework:** Astro (static output)
- **Host:** Vercel (same as CoverStory.studio)
- **Content:** Markdown/MDX in the repo via Astro content collections. No CMS, no API, no build webhook.
- **Images:** Astro's built-in image optimization (responsive sizes, lazy load, format conversion) configured once.
- **DNS:** Stays at GoDaddy during cutover (lowest-risk path for email). Can move to Vercel/Cloudflare later once stable.

Rationale: content is templatized (hero + an arbitrary image list), updates are infrequent, and editing happens directly in the repo everywhere else. A CMS would only buy a dashboard for non-technical editors — not the situation here.

---

## Content Model

Each project = one markdown file with frontmatter + an images array (or an auto-globbed image folder). Schema is enforced by Astro content collections, so every project is structurally identical — a project can't be malformed.

### Example project schema (Astro content collection)

```ts
// src/content/config.ts
import { defineCollection, z } from "astro:content";

const projects = defineCollection({
  type: "content",
  schema: ({ image }) => z.object({
    title: z.string(),
    client: z.string().optional(),
    year: z.number().optional(),
    hero: image(),                 // optimized at build
    images: z.array(image()),      // "as many as I can conjure"
    order: z.number().optional(),  // manual sort control
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects };
```

### Example project file

```md
---
title: Project Name
client: Client Name
year: 2025
hero: ./hero.jpg
images:
  - ./01.jpg
  - ./02.jpg
  - ./03.jpg
order: 1
---
```

Adding a project = new file + drop images in its folder. Done.

### Studio page content (resolved — no collection needed)

The Studio page ACF is just: **title + unlinked tags + 3 text blocks**. Tags are plain strings rendered as type (no taxonomy, no URLs). This becomes a single tiny data file, not a content collection:

```json
// src/data/studio.json
{
  "title": "...",
  "tags": ["...", "...", "..."],
  "text": ["block one", "block two", "block three"]
}
```

That's the entire studio content reproduction. ACF is out of the risk column.

---

## What WordPress is actually doing (and why this isn't a file copy)

The theme files (HTML structure, CSS, JS, animations) are portable code. But WordPress does several things **at runtime** that aren't sitting in those files:

- **Renders templates** — PHP loops over post/ACF data to assemble the final HTML per request.
- **Serves/transforms images** — generates `srcset` sizes; plugins (Imagify, LiteSpeed) compress/lazy-load/rewrite URLs.
- **Injects plugin output** — Yoast meta + JSON-LD, CookieYes banner, LiteSpeed combined/optimized CSS-JS.

So the rebuild = **reproduce the rendered page**, by reading the compiled HTML/CSS off the live site and rebuilding the templates in Astro. Design assets port directly; assembly logic gets redone.

---

## Pixel-match expectations

Visually identical is achievable. Known friction points:

- **WebGL pieces (3 of them)** — all client-side JS, behave identically once ported. WordPress being gone is irrelevant to them. Lowest-risk category. See the WebGL inventory below.
- **Scroll/animation libs** (GSAP, Lenis, etc.) — port directly, but triggers/timing get rewired by hand. This is where "looks right but a scroll-trigger fires 100px early" bugs live. *(Remaining swing factor — confirm what, if anything, animates beyond the WebGL.)*
- **Fonts** — carry the actual font files + license; re-host if WP loaded them via plugin.
- **CSS specificity ghosts** — plugins inject styles not in the theme. Occasionally something's 98% right because a plugin nudged a margin. Diff-and-fix.
- **Responsive breakpoints** — verify every breakpoint; easy to miss by eye.

None are walls. It's "matches exactly after a careful diff pass," not "matches automatically."

### WebGL / custom-canvas inventory

Each of these is self-contained client-side JS — carry over the source + any assets, mount in an Astro island, verify canvas sizing/resize logic. No re-choreography needed (unlike scroll-triggered motion).

| Location | What it is | Notes |
|---|---|---|
| Home hero | WebGL hero | The one cropped for the display ads. Portable as-is. |
| Studio page | WebGL background | Same treatment — drop into an island behind the content. |
| Projects page | Custom kanji hover (built by desktop Claude) | The source already exists from that build — reuse it directly rather than reverse-engineering off the live site. |

Because all three are JS-driven and don't depend on WP's render, the hero/studio/projects backgrounds drop out of the high-risk column. Remaining variance is scroll motion (if any) + the CSS diff pass.

---

## Effort Estimate

| Phase | Time |
|---|---|
| Scaffold + Astro setup + content schema + Vercel/DNS wiring | ~0.5–1 day |
| Rebuild templates to pixel-match (the real work) | 2–4 days |
| Content migration (projects → markdown + image optimization) | 1–2 days |
| Diff pass, responsive QA, redirects, meta/JSON-LD, email DNS | ~1 day |

**Realistic total: 4–8 focused working days** (~1–2 weeks calendar with review cycles). Variance is almost entirely "how much custom motion/WebGL."

---

## Email — Google Workspace (DO NOT BREAK)

Mail lives entirely on Google's servers. GoDaddy only holds the DNS records pointing mail at Google. **Keeping DNS at GoDaddy means these records never move — zero email risk.**

### Records that must remain intact

| Record | Purpose | Notes |
|---|---|---|
| **MX** | Routes mail to Google | `smtp.google.com` (modern) OR the 5 `aspmx`/`alt#.aspmx.l.google.com` records (older accounts) |
| **SPF (TXT)** | Authorizes Google to send | `v=spf1 include:_spf.google.com ~all` |
| **DKIM (TXT)** | Signs outbound mail | Google-issued key. Easy to forget — not obviously "email" |
| **DMARC (TXT)** | Policy at `_dmarc` | If one was set up |
| **CNAMEs** | Workspace service URLs | `mail.`, `calendar.`, etc. if custom URLs are used |

### The safe approach

1. **Before touching anything**, export/screenshot the full GoDaddy DNS zone. Capture every record.
2. **Site migration only touches two records:** the apex `A` record and the `www` `CNAME`. Everything mail-related stays untouched.
3. If DNS is ever moved to Vercel/Cloudflare later, recreate every mail record by hand — that's the one moment email can break, so do it deliberately, not during the host cutover.

---

## Cutover Sequence

1. Build + deploy the Astro site to a Vercel preview URL. QA fully (desktop + mobile, every breakpoint).
2. Run the visual diff pass against the live WordPress site until pixel-matched.
3. Reimplement SEO/GEO: meta tags, the Organization + CreativeWork JSON-LD (from prior `cognak-json-ld.md` work), image alt text.
4. Set up 301 redirects for any trimmed/changed URLs (preserve SEO).
5. In Vercel: add the custom domain, get the target A/CNAME values Vercel provides.
6. **In GoDaddy DNS:** change ONLY the apex `A` record and `www` `CNAME` to point at Vercel. **Leave all MX/TXT/DKIM/DMARC/CNAME mail records untouched.**
7. Watch propagation. Confirm site loads on the real domain.
8. **Test email both directions** (send + receive) after the switch as a sanity check, even though mail records didn't change.
9. Once stable, cancel GoDaddy hosting (NOT the domain registration).

---

## Pre-Build Open Questions

- **Resolved:** Hero, studio background, and projects (kanji hover) are all WebGL/canvas — see inventory above. The kanji hover source already exists from a prior desktop build; reuse it.
- **Resolved:** Studio ACF = title + unlinked tags + 3 text blocks → single `studio.json`.
- Is there any **scroll-triggered motion** beyond the three WebGL pieces? This is now the main time variance.
- Exact field list from current **project pages** → finalize the project content schema (studio is already settled).
- Are the **fonts** self-hosted files we have, or plugin-loaded (need to re-host)?
- Confirm whether any **GoDaddy-specific services** (forwarding, parked subdomains) are in play beyond hosting + DNS.
