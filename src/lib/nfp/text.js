/**
 * Typesetting over the TeX Gyre Heros outline table: measurement, glyph
 * placement, word-wrapping. Everything is in points, y down, baseline at the given y.
 *
 * A "run" is { t, face, size } where face is 'regular' | 'bold' | 'italic'.
 * Glyph output is a list of command rows in the same shape the barcode
 * emitters draw — [0,x,y] move, [1,x,y] line, [2,…] cubic, [3] close — but
 * already resolved to absolute points, so the emitter only has to scale.
 */

import { FACE } from './heros.js';
const ARIMO = FACE; // historical name; the table is Heros now

const face = (name) => ARIMO[name] || ARIMO.regular;
const r3 = (n) => Math.round(n * 1000) / 1000;

/** Advance width of a string, in points. */
export function measure(t, f, size) {
  const F = face(f);
  let w = 0;
  const s = String(t);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    w += F.adv[ch] ?? F.adv[' '] ?? 0.278;
    if (i + 1 < s.length) w += F.kern[ch + s[i + 1]] || 0;
  }
  return w * size;
}

export const measureRuns = (runs) => runs.reduce((w, r) => w + measure(r.t, r.face, r.size), 0);

/** Cap height in points for a face and size. */
export const capHeight = (f, size) => face(f).metrics.cap * size;

/**
 * Place a string at (x, baseline y). Returns { cmds, w }.
 * Characters missing from the table fall back to their regular-face glyph,
 * and then to nothing (advance only), so an unexpected character never
 * throws mid-render.
 */
export function place(t, f, size, x, y) {
  const F = face(f);
  const s = String(t);
  const cmds = [];
  let cx = x;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const g = F.glyphs[ch] || ARIMO.regular.glyphs[ch];
    const adv = F.adv[ch] ?? ARIMO.regular.adv[ch] ?? 0.278;
    if (g) {
      for (const c of g) {
        switch (c[0]) {
          case 0: case 1:
            cmds.push([c[0], r3(cx + c[1] * size), r3(y - c[2] * size)]); break;
          case 2:
            cmds.push([2,
              r3(cx + c[1] * size), r3(y - c[2] * size),
              r3(cx + c[3] * size), r3(y - c[4] * size),
              r3(cx + c[5] * size), r3(y - c[6] * size)]);
            break;
          default: cmds.push([3]);
        }
      }
    }
    cx += adv * size;
    if (i + 1 < s.length) cx += (F.kern[ch + s[i + 1]] || 0) * size;
  }
  return { cmds, w: cx - x };
}

/**
 * Greedy word wrap over mixed runs. Breaks only at spaces; a run's words keep
 * the run's face and size. Returns an array of lines, each an array of runs
 * (with trailing space trimmed), plus each line's width.
 */
export function wrap(runs, maxW) {
  // Tokenise into words that remember their run styling.
  const words = [];
  for (const r of runs) {
    const parts = String(r.t).split(' ');
    parts.forEach((p, i) => {
      if (p.length) words.push({ t: p, face: r.face, size: r.size, glue: i < parts.length - 1 });
      else if (i < parts.length - 1 && words.length) words[words.length - 1].glue = true;
    });
    // A run ending with a space marks a break opportunity after it.
  }
  const lines = [];
  let line = [];
  let lineW = 0;
  for (const w of words) {
    const ww = measure(w.t, w.face, w.size);
    const sp = line.length ? measure(' ', w.face, w.size) : 0;
    if (line.length && lineW + sp + ww > maxW) {
      lines.push({ runs: line, w: lineW });
      line = [];
      lineW = 0;
    }
    if (line.length) {
      // Merge into the previous run when the style matches, keeping the space.
      const last = line[line.length - 1];
      if (last.face === w.face && last.size === w.size) {
        last.t += ' ' + w.t;
      } else {
        last.t += ' ';
        line.push({ t: w.t, face: w.face, size: w.size });
      }
      lineW += sp + ww;
    } else {
      line.push({ t: w.t, face: w.face, size: w.size });
      lineW = ww;
    }
  }
  if (line.length) lines.push({ runs: line, w: lineW });
  return lines;
}
