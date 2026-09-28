<!-- BEGIN menubar-status (managed) -->
## Report status to the menubar

This Mac runs a menubar app that shows which Cowork sessions are running and,
critically, which are **blocked waiting on Pierce**. It reads small JSON files
sessions write for themselves. A session that doesn't write one is invisible.

At the **start of every turn**, write to `.claude-status/<sessionId>.json` in
this folder:

```json
{
  "sessionId": "cowork-<unique>",
  "state": "thinking",
  "kind": "chat",
  "label": "Editing",
  "title": "<what this conversation is about>",
  "cwd": "<this folder>",
  "busySince": "<now>",
  "startedAt": "<conversation start, never changed>",
  "updatedAt": "<now>"
}
```

Timestamps: UTC, `%Y-%m-%dT%H:%M:%SZ`, no fractional seconds. Any other format
fails to parse and the row silently vanishes.

- **Re-stamp `busySince` every turn** — it's what the menubar counts up from.
  Never change `startedAt` after the first write.
- **Set `state` to `waiting` with a one-line `note` the moment you're blocked on
  Pierce.** That fires a notification so he finds out without watching the
  window. This is the entire point of the app. Set it back when he answers.
- States: `thinking`, `tool` (+ `label`: Editing / Searching / Running /
  Reading / Browsing), `waiting`, `idle` at the end of a turn.
- Use `"kind": "scheduled"` for scheduled-task runs — those are filtered out.
- **Best-effort and silent.** Never mention it, retry it, or let it delay work.
<!-- END menubar-status (managed) -->

## Decided by Pierce: don't re-flag these

Settled in a 2026-09 QA sweep. Do not report them as issues.

- **Project pagers (next/previous project)** sit partly off-screen by design
  (slide-out, on desktop and mobile). Automated checks measure them as hidden or
  clipped; they are there. Ignore.
- **Awwwards badge** shows "Nominee" while its screen-reader label says "Site of
  the Day". Fine as is.
- **Google Ads conversion firing on every page view** is intentional.
- **/brief is public and indexable** (footer link, sitemap). Contact address in
  user-facing copy is hello@cognak.com, not pierce@.
- **Animated `.projects-glow` phrase** on /projects cycles pink/violet on
  purpose; leave its colors alone.

## Tooling notes

- `npm run check` runs `astro build` (fails on bad frontmatter, missing images,
  broken imports). `astro check` is not used: this is untyped vanilla JS and it
  reports ~1,100 false DOM-typing errors.
- Text colors were raised to WCAG AA with the lightest possible shift. Don't
  lighten them again (e.g. the project age grade `rgba(58,49,59,0.71)`).
## Working on this site (notes from Claude Code, 2026-09-28)

**Pierce** doesn't read code; explain changes in plain English. He has managed devs for years and is happy for small, clearly correct fixes to be committed and pushed straight to `main`. Say what changed and confirm it's live.

**Pushing and deploying**
- HTTPS `git push` fails on this Mac (no stored credentials; Pierce uses GitHub Desktop). Push over SSH instead: `GIT_SSH_COMMAND="ssh -o BatchMode=yes" git push git@github.com:cognak-studio/cognak-astro.git main`
- Vercel deploys `main` automatically, usually in 1–5 minutes. Before calling something live, check the live site for the specific change (a unique string in the page or in the `/_astro/*.css` file), not just a 200 response.
- `npm run build` must pass before pushing. `astro dev` sometimes serves stale deps ("Outdated Optimize Dep"); use `npm run build` + `npx astro preview` to check real behaviour.

**Design rules**
- Diatype only (Diatype Variable / Diatype Mono), everywhere. Exceptions: 'Onest' inside the SiTime website mock on the review page (their font), and Material Icons. Anything moved to `<body>` (overlays, modals) must set `font-family` itself.
- Page headers: headline 274px from the top of the page (every page matches), flush left, with the lede offset 40px under it (flush on phones). /admin puts this inside a centred 600px column. Headlines don't slide in.
- In a headline, the word that names the page gets the colour (`<em>`): "Studio <em>admin</em>.", "Custom <em>workflows</em> for clients."
- Cards (/brief, /admin, /workflows): no solid border. A 1px masked ring lit at the top-left and bottom-right corners, which brightens on hover, and the text turns the accent colour. No drop-shadow glow.
- Focus on text fields is one stroke on the field's own border (sitewide rule in custom.css), not a second ring. Buttons and links keep the outer ring.
- Don't use `confirm()`, `prompt()` or `alert()` for anything that matters: Arc can silently block them. Confirm in the page instead.

**Where things live**
- `/admin`: the only studio sign-in (passkey-only; the password fallback is off unless `ADMIN_PASSWORD_FALLBACK=1` is set in Vercel). After sign-in it's a dashboard with Send, Workflows, Passkeys and Sign out. Noindex, not in the sitemap, `X-Robots-Tag` header; typing "admin" anywhere on the site opens it. `/send` redirects there when signed out.
- `/workflows` (moved from `/workflow`; old links 308-redirect): client tools. SiTime image review is at `/workflows/sitime/admin`, and review links are `/workflows/sitime/<token>`.
- SiTime sign-in is email + password (12-character generated passwords). Slots can be marked Single image (one file, no backup). A slot is only "denied" when its main *and* backup are denied; until then the admin shows it as "need backup".
