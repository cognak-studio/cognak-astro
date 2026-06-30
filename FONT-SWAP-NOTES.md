# Font swap notes

Working log for the typeface evaluation on cognak.com (replacing Inter to avoid the
"default / vibecoded" look). All trial fonts below are **Test/Trial** weights — **not
licensed for production**. Buy the real license before launch and swap the files.

_Last updated: 2026-06-30_

---

## Currently active: ABC Diatype (Test, variable)

Diatype is repointed onto the existing `'Inter'` and `'Geist Mono'` family names, so
every existing `font-weight` maps 1:1 and **no usage sites were touched** — only the
`@font-face` definitions changed.

- Body / UI (`'Inter'`)  → **ABC Diatype Plus Variable** — `public/theme/assets/fonts/diatype/diatype-var.ttf`
- Mono (`'Geist Mono'`)  → **ABC Diatype Mono Variable** — `public/theme/assets/fonts/diatype/diatype-mono-var.ttf`
- Defined in `src/styles/custom.css`, block tagged `DIATYPE TEST SWAP (2026-06-30)`.
- Variable weight axis 100–900. **No italic axis** in the trial → italics are
  browser-synthesised (faux). The licensed family ships separate italics.

### Revert to Inter
In `src/styles/custom.css`: delete the `DIATYPE TEST SWAP` block and uncomment the
`ORIGINAL FONTS` block directly beneath it. Original Inter/Geist files are untouched at
`public/theme/assets/fonts/`.

---

## Already tried

- **Söhne (Test)** — repointed per-weight onto `'Inter'`/`'Geist Mono'`, then reverted in
  favor of Diatype. Dead files still sit in `public/theme/assets/fonts/soehne/` (the
  sandbox couldn't delete them — drag that folder to trash in Finder; nothing references
  it). Söhne weight map for reference: Extraleicht 200 / Leicht 300 / Buch 400 /
  Kräftig 500 / Halbfett 600 / Dreiviertelfett 700 / Fett 800 / Extrafett 900.

---

## Spacing / sizing tweaks made during the Diatype eval

These are **independent of the font** and worth keeping even if we revert to Inter
(Diatype renders a touch smaller than Inter at the same px, which prompted the bumps).
All in `src/styles/custom.css` unless noted.

- **Nav text +1px** (Diatype looked small): `.home-nav a`, `.home-bottom-email`,
  `.home-bottom-location`, `.inner-nav-links a`, `.cognak-cookie-label`,
  `.cognak-cookie-opt` all 13 → 14px; `.footer-copy p`, `.footer-links a` 14 → 15px.
- **Studio Approach/Founder tabs** (`.studio-tab`): `clamp(18px,2vw,27px)` →
  `clamp(19px,2vw,28px)`.
- **Footer alignment**: `.footer-bottom` `align-items: flex-end` → `baseline` so
  Projects/Studio sit on the copyright's baseline (Diatype's metrics had diverged).
- **Studio "Currently booking" word spacing**: removed
  `.studio-start-wrap .availability-sub` from the stagger-animation `SELECTORS` array in
  `public/js/cognak-global.js`. It's a flex container, so the splitter's word-spaces were
  discarded and the 6px flex gap inflated word spacing. Home/projects never staggered that
  line, so this just makes studio consistent.
- **Cookie banner row rhythm**: `.cognak-cookie-label` `margin-bottom: 2px` → `-2px` so
  "Decline" lines up with "Studio" (and "This site uses cookies" with "Projects"). Only
  affects the gap under the label; Decline→Accept spacing unchanged. Verified glyph-to-glyph.
- **Considered & reverted**: dropping `.home-nav` to align Projects with "Decline" —
  decided top-edge alignment (Projects ↔ "This site uses cookies") is better and needs no
  conditional shift. No code remains from this.

---

## Pending options for later

- **Rest of the Diatype family** still on disk in `Test Diatype Collection/`: Expanded,
  Condensed, Compressed, Extended, Semi Mono (static OTF per-weight), plus the plain
  `ABC Diatype` (non-Plus). Could test a width variant for headings or the mono.
- **Revisit Söhne** — files still present; quick to re-point if we want a side-by-side.
- **Other paid grotesques discussed**: GT America (Grilli Type), Suisse Int'l (Swiss
  Typefaces), PP Neue Montreal (Pangram Pangram), Neue Haas Grotesk, Untitled Sans (Klim).
- **Before launch**: purchase the chosen license, replace the `*Trial/*Test` files with
  the production weights (incl. real italics), and remove leftover trial folders
  (`diatype/`, `soehne/`, and the `Test … Collection/` source dirs).

---

## How the swap works (for whoever picks this up)

Keeping the CSS family names as `'Inter'` and `'Geist Mono'` is deliberate: it means a
font change is just editing the `@font-face` `src` (one block in `custom.css`) instead of
find-replacing hundreds of `font-family` declarations. When we buy the real font, either
keep the `'Inter'` alias or do a global rename in one pass — either is fine.
