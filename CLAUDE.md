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
