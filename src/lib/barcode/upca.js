/**
 * UPC-A encoder.
 *
 * Produces a resolution-independent "doc" (millimetre geometry) that the
 * emitters in ./emit.js turn into SVG, PDF or EPS.
 *
 * Geometry follows the GS1 General Specifications nominal (100% magnification)
 * UPC-A symbol:
 *   X dimension        0.33 mm
 *   symbol width      113X = 37.29 mm  (95X symbol + 9X quiet zone each side)
 *   bar height        22.85 mm
 *   overall height    25.91 mm  (guard bars descend to the HRI baseline)
 *   HRI cap height     2.75 mm
 * Everything scales linearly with `magnification` (GS1 permits 80%–200%).
 */

// Left-hand (odd parity) encodings, digit 0-9. Right-hand is the complement.
const L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];

const X_MM = 0.33;          // module width at 100%
const BAR_H_MM = 22.85;     // main bar height at 100%
const TOTAL_H_MM = 25.91;   // overall symbol height incl. HRI at 100%
const HRI_CAP_MM = 2.75;    // HRI digit cap height at 100%
const HELV_CAP = 0.717;     // Helvetica cap height as a fraction of em
const HELV_DIGIT_ADV = 0.556; // Helvetica digit advance width (all digits equal)

const QUIET = 9;            // quiet zone, in modules, each side
const SYMBOL = 95;          // encoded symbol width, in modules
const TOTAL_MODULES = QUIET + SYMBOL + QUIET; // 113

/** Mod-10 check digit for the first 11 digits of a UPC-A. */
export function upcCheckDigit(d11) {
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += Number(d11[i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Accepts 11 digits (check digit computed) or 12 (check digit verified).
 * Returns { ok, digits, error, computed } where `digits` is the full 12.
 */
export function normalizeUpc(input) {
  const raw = String(input || '').replace(/[\s-]/g, '');
  if (!raw) return { ok: false, error: 'Enter a UPC number.' };
  if (!/^\d+$/.test(raw)) return { ok: false, error: 'Digits only — no letters or symbols.' };

  if (raw.length === 11) {
    const check = upcCheckDigit(raw);
    return { ok: true, digits: raw + check, computed: true, check };
  }
  if (raw.length === 12) {
    const check = upcCheckDigit(raw.slice(0, 11));
    if (check !== Number(raw[11])) {
      return {
        ok: false,
        error: `Check digit doesn't match — the last digit should be ${check}, not ${raw[11]}.`,
      };
    }
    return { ok: true, digits: raw, computed: false, check };
  }
  return {
    ok: false,
    error: `UPC-A is 12 digits (or 11 and we'll add the check digit). You entered ${raw.length}.`,
  };
}

/** Full 95-module bar pattern as a '0'/'1' string. */
export function upcModules(digits) {
  let s = '101'; // left guard
  for (let i = 0; i < 6; i++) s += L[Number(digits[i])];
  s += '01010'; // centre guard
  for (let i = 6; i < 12; i++) {
    s += L[Number(digits[i])].replace(/[01]/g, (c) => (c === '0' ? '1' : '0'));
  }
  s += '101'; // right guard
  return s;
}

// Module index ranges that are guard bars — these descend to the HRI baseline.
const GUARDS = [[0, 3], [45, 50], [92, 95]];
const isGuard = (i) => GUARDS.some(([a, b]) => i >= a && i < b);

const r4 = (n) => Math.round(n * 1e4) / 1e4;

/**
 * @param {string} digits  12-digit UPC-A (already validated)
 * @param {object} [opts]
 * @param {number} [opts.magnification=1]  0.8–2.0 per GS1
 * @param {number} [opts.bwr=0]  bar width reduction in mm, for press gain
 * @param {boolean} [opts.background=true]  draw a white plate behind the symbol
 * @param {boolean} [opts.hri=true]  draw the human-readable digits
 */
export function buildUpcA(digits, opts = {}) {
  const mag = opts.magnification ?? 1;
  const bwr = opts.bwr ?? 0;
  const background = opts.background !== false;
  const hri = opts.hri !== false;

  const x = X_MM * mag;
  const barH = BAR_H_MM * mag;
  const totalH = TOTAL_H_MM * mag;
  const totalW = TOTAL_MODULES * x;
  const fontSize = (HRI_CAP_MM / HELV_CAP) * mag;

  const pattern = upcModules(digits);
  const rects = [];

  // Merge runs of dark modules into single bars, but never merge across the
  // boundary between a guard bar and a data bar — they have different heights.
  let i = 0;
  while (i < SYMBOL) {
    if (pattern[i] === '0') { i++; continue; }
    const guard = isGuard(i);
    let j = i;
    while (j < SYMBOL && pattern[j] === '1' && isGuard(j) === guard) j++;
    const left = (QUIET + i) * x;
    const width = (j - i) * x;
    rects.push({
      x: r4(left + bwr / 2),
      y: 0,
      w: r4(Math.max(width - bwr, x * 0.2)),
      h: r4(guard ? totalH : barH),
    });
    i = j;
  }

  const texts = [];
  if (hri) {
    const baseline = r4(totalH);
    const at = (mod) => r4((QUIET + mod) * x);
    // Number system digit: right-aligned to 8X, i.e. inside the left quiet zone.
    texts.push({
      x: r4((QUIET - 1) * x - (HELV_DIGIT_ADV * fontSize) / 2),
      y: baseline, size: r4(fontSize), text: digits[0],
    });
    // Left half, digits 2-6, each centred under its own 7-module cell.
    for (let k = 1; k <= 5; k++) {
      texts.push({ x: at(3 + 7 * k + 3.5), y: baseline, size: r4(fontSize), text: digits[k] });
    }
    // Right half, digits 7-11.
    for (let k = 0; k <= 4; k++) {
      texts.push({ x: at(50 + 7 * k + 3.5), y: baseline, size: r4(fontSize), text: digits[6 + k] });
    }
    // Check digit: left-aligned from 105X, i.e. inside the right quiet zone.
    texts.push({
      x: r4(at(SYMBOL) + x + (HELV_DIGIT_ADV * fontSize) / 2),
      y: baseline, size: r4(fontSize), text: digits[11],
    });
  }

  return {
    kind: 'upca',
    w: r4(totalW),
    h: r4(totalH),
    rects,
    texts,
    background: background ? '#FFFFFF' : null,
    fill: '#000000',
    title: `UPC-A ${digits}`,
  };
}

export const UPCA_NOMINAL = { X_MM, BAR_H_MM, TOTAL_H_MM, TOTAL_MODULES };
