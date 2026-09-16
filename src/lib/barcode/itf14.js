/**
 * ITF-14 encoder — the GTIN-14 shipping-case barcode (Interleaved 2 of 5).
 *
 * Same millimetre "doc" shape as ./upca.js, so ./emit.js renders it unchanged.
 *
 * Geometry follows the GS1 General Specifications for ITF-14 on outer cases:
 *   X dimension        1.016 mm at 100% (GS1 minimum is 0.495 mm, ~49%)
 *   wide : narrow      2.5 : 1
 *   symbol             120.5X (start 4X + 7 digit pairs at 16X + stop 4.5X)
 *   quiet zones        10X each side, inside the bearer bars
 *   bar height         32 mm at 100%, never below the 31.75 mm GS1 minimum
 *   bearer bars        4.83 mm (0.19 in) — the thickness plate-printed
 *                      corrugated needs so the plate doesn't bow into the bars
 * At 100% the framed symbol is 152.4 mm (6 in) wide.
 *
 * The HRI sits below the bottom bearer, grouped 1 08 50028 70219 9
 * (indicator, prefix, then the rest of the GTIN) as outlined OCR-B.
 */

import { OCRB } from './ocrb-digits.js';

// Narrow/wide pattern per digit, five elements each.
const PAT = [
  'nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw',
  'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn',
];

const X_MM = 1.016;
const RATIO = 2.5;
const BAR_H_MM = 32;
const BAR_H_MIN_MM = 31.75;
const BEARER_MM = 4.83;
const QUIET = 10;               // in X
const HRI_PT = 14;              // at 100%
const PT_MM = 25.4 / 72;
const HRI_MIN_PT = 8;

/** GS1 mod-10 check digit for the first 13 digits of a GTIN-14. */
export function gtin14CheckDigit(d13) {
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(d13[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/**
 * Accepts 13 digits (check digit computed) or 14 (check digit verified).
 * Returns { ok, digits, error, computed, check }.
 */
export function normalizeItf14(input) {
  const raw = String(input || '').replace(/[\s-]/g, '');
  if (!raw) return { ok: false, error: 'Enter a GTIN-14 / SCC-14 number.' };
  if (!/^\d+$/.test(raw)) return { ok: false, error: 'Digits only — no letters or symbols.' };
  if (raw.length === 13) {
    const check = gtin14CheckDigit(raw);
    return { ok: true, digits: raw + check, computed: true, check };
  }
  if (raw.length === 14) {
    const check = gtin14CheckDigit(raw.slice(0, 13));
    if (check !== Number(raw[13])) {
      return { ok: false, error: `Check digit doesn't match — the last digit should be ${check}, not ${raw[13]}.` };
    }
    return { ok: true, digits: raw, computed: false, check };
  }
  return {
    ok: false,
    error: `ITF-14 is 14 digits (or 13 and we'll add the check digit). You entered ${raw.length}.`,
  };
}

/**
 * Element widths in X, alternating bar/space starting with a bar.
 * Start nnnn, digit pairs interleaved (first digit = bars, second = spaces),
 * stop w n n.
 */
export function itfElements(digits) {
  const w = (c) => (c === 'w' ? RATIO : 1);
  const els = [1, 1, 1, 1];
  for (let i = 0; i < digits.length; i += 2) {
    const b = PAT[Number(digits[i])];
    const s = PAT[Number(digits[i + 1])];
    for (let k = 0; k < 5; k++) els.push(w(b[k]), w(s[k]));
  }
  els.push(RATIO, 1, 1);
  return els;
}

const r4 = (n) => Math.round(n * 1e4) / 1e4;

/**
 * @param {string} digits  14-digit GTIN (already validated)
 * @param {object} [opts]
 * @param {number} [opts.magnification=1]  0.5–1.0
 * @param {number} [opts.bwr=0]  bar width reduction in mm
 * @param {'frame'|'bars'|'none'} [opts.bearer='frame']
 * @param {boolean} [opts.background=true]
 * @param {boolean} [opts.hri=true]
 */
export function buildItf14(digits, opts = {}) {
  const mag = opts.magnification ?? 1;
  const bwr = opts.bwr ?? 0;
  const bearer = opts.bearer ?? 'frame';
  const background = opts.background !== false;
  const hri = opts.hri !== false;

  const x = X_MM * mag;
  const barH = Math.max(BAR_H_MIN_MM, BAR_H_MM * mag);
  const bt = bearer === 'none' ? 0 : BEARER_MM;
  const side = bearer === 'frame' ? bt : 0;

  const els = itfElements(digits);
  const symbolX = els.reduce((a, b) => a + b, 0); // 120.5
  const innerW = (QUIET * 2 + symbolX) * x;
  const totalW = innerW + side * 2;
  const frameH = barH + bt * 2;

  const rects = [];
  let cx = side + QUIET * x;
  els.forEach((wx, i) => {
    const wmm = wx * x;
    if (i % 2 === 0) {
      rects.push({
        x: r4(cx + bwr / 2),
        y: r4(bt),
        w: r4(Math.max(wmm - bwr, x * 0.2)),
        h: r4(barH),
      });
    }
    cx += wmm;
  });

  if (bt) {
    rects.push({ x: 0, y: 0, w: r4(totalW), h: r4(bt) });
    rects.push({ x: 0, y: r4(bt + barH), w: r4(totalW), h: r4(bt) });
    if (side) {
      // Full height, overlapping the top and bottom bearers, so no
      // antialiasing seam shows at the corners.
      rects.push({ x: 0, y: 0, w: r4(side), h: r4(frameH) });
      rects.push({ x: r4(totalW - side), y: 0, w: r4(side), h: r4(frameH) });
    }
  }

  let totalH = frameH;
  const glyphs = [];
  if (hri) {
    const em = Math.max(HRI_MIN_PT, HRI_PT * mag) * PT_MM;
    const pitch = OCRB.advance * em;
    const gap = 0.35 * em;
    const baseline = frameH + gap + OCRB.top * em;
    // 1 08 50028 70219 9 — spaces are one advance wide.
    const groups = [digits.slice(0, 1), digits.slice(1, 3), digits.slice(3, 8), digits.slice(8, 13), digits.slice(13)];
    const cells = groups.join(' ');
    let gx = (totalW - cells.length * pitch) / 2;
    for (const ch of cells) {
      if (ch !== ' ') glyphs.push({ char: ch, x: r4(gx), y: r4(baseline), em: r4(em) });
      gx += pitch;
    }
    totalH = baseline + Math.abs(OCRB.bottom) * em + 0.1 * mag;
  }

  return {
    kind: 'itf14',
    w: r4(totalW),
    h: r4(totalH),
    rects,
    glyphs,
    background: background ? '#FFFFFF' : null,
    fill: '#000000',
    title: `ITF-14 ${digits}`,
    meta: { x: r4(x), barH: r4(barH), bearer: bt },
  };
}

export const ITF14_NOMINAL = { X_MM, RATIO, BAR_H_MM, BAR_H_MIN_MM, BEARER_MM, QUIET, HRI_PT };
