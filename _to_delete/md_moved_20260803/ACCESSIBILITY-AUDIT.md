# Accessibility Audit: cognak.com
**Standard:** WCAG 2.1 AA · **Date:** 2026-06-22 · **Pages reviewed:** Home, Projects (list/grid), Project detail, Studio

### Summary
**Issues found:** 6 — **Critical:** 0 · **Major:** 3 · **Minor:** 3

The site is in good shape structurally: it ships a skip link, proper `main`/`nav`/`footer` landmarks, a single `<h1>` per page with logical heading order, excellent body/heading contrast, and it genuinely respects `prefers-reduced-motion` (WebGL, stagger animations, and transitions all disabled). The findings below are mostly content-level (alt text), one brand-color contrast call, and motion/target-size polish.

---

### Findings

#### Perceivable
| # | Issue | WCAG | Severity | Recommendation |
|---|-------|------|----------|----------------|
| 1 | Project **gallery images use empty `alt=""`** (inherited from the old WordPress export). Screen-reader users get nothing for the actual portfolio work. | 1.1.1 Non-text Content | 🟡 Major | Add descriptive alt to body images (e.g. "Xtract Group brand guide spread"). Hero images already have alt. |
| 2 | **Brand purple `#9F50FF` on white = 4.15:1** — used for category labels, inline links, and "Start a project". Just under the 4.5:1 threshold for normal-size text. | 1.4.3 Contrast | 🟡 Major | Darken slightly to ~`#8B3AEF` (≈4.6:1) for text use, or only use the lighter purple at ≥24px (large-text needs just 3:1). |
| 3 | Founder portrait (Pierce) has empty `alt=""`. | 1.1.1 | 🟢 Minor | Add `alt="Pierce Liefeld"` (it's meaningful, not decorative). |

#### Operable
| # | Issue | WCAG | Severity | Recommendation |
|---|-------|------|----------|----------------|
| 4 | **Auto-playing, looping hero/studio videos** (>5s) have no pause control — the hero "mute" button toggles sound, not motion. | 2.2.2 Pause, Stop, Hide (Level A) | 🟡 Major | Pause videos under `prefers-reduced-motion`, and/or add a pause control. (Reduced-motion users currently still get looping video.) |
| 5 | Small tap targets: top-nav links ("Projects" ~54×13px, "Studio" ~42×13px) and the grid/list view-toggle buttons are under the 24px min height. | 2.5.8 (2.2) / 2.5.5 | 🟢 Minor | Increase tappable height (padding/min-height ≥24px, ideally 44px). Inline links inside body text are exempt. |

#### Understandable / Robust
| # | Issue | WCAG | Severity | Recommendation |
|---|-------|------|----------|----------------|
| 6 | Inactive view-toggle + placeholder text use `rgba(58,49,59,0.35)` (~2:1 effective). | 1.4.3 / 1.4.11 | 🟢 Minor | Bump inactive-state opacity to ~0.6 so the control is perceivable. |

---

### Color Contrast Check
| Element | Foreground | Background | Ratio | Required | Pass |
|---------|-----------|------------|-------|----------|------|
| Project title H1 | #3A313B | #FFFFFF | 12.48:1 | 4.5:1 | ✅ |
| Body text | #3A313B | #F7F1FF | ~11:1 | 4.5:1 | ✅ |
| Footer email link | #3A313B | #F1EFF4 | 10.93:1 | 4.5:1 | ✅ |
| Category / link purple | #9F50FF | #FFFFFF | 4.15:1 | 4.5:1 | ❌ (normal text) |
| Inactive view toggle | rgba(58,49,59,.35) | #F7F1FF | ~2:1 | 4.5:1 | ❌ |

### What's already good
- Skip-to-main link present and functional
- `main` / `nav` / `footer` landmarks; one `<h1>` per page; logical heading order
- `:focus-visible` styles defined for project navigation
- `prefers-reduced-motion` fully respected (animations, WebGL, view transitions disabled)
- Hero images and the og share images have alt text

### Priority fixes
1. **Alt text on gallery images** (#1) — biggest real-world impact for screen-reader users; it's a content edit across the project markdown.
2. **Brand-purple contrast** (#2) — a tiny hex tweak fixes labels/links/CTA site-wide.
3. **Pause looping video for reduced-motion** (#4) — respects users who opt out of motion.
4. Touch targets (#5) and inactive-control contrast (#6) — quick polish.

> Note: this automated + heuristic audit catches the structural and contrast issues. A manual pass with VoiceOver/NVDA and keyboard-only navigation is still worth doing before you'd call it fully certified.
