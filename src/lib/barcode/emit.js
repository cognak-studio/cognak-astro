/**
 * Vector emitters. Each takes a "doc" from ./upca.js or ./qr.js and returns a
 * string ready to be wrapped in a Blob and downloaded.
 *
 * The doc's coordinate system is millimetres, origin top-left, y increasing
 * downward (SVG convention). PDF and EPS both use points, origin bottom-left,
 * so those two flip on the way out.
 *
 * Human-readable digits are emitted as OCR-B outlines, never as live text.
 * OCR-B is not one of the PDF base-14 fonts, so live text in that face would
 * have to be embedded or it would silently substitute to Courier on someone
 * else's machine — outlines remove that failure mode, and mean the SVG renders
 * correctly for anyone who doesn't have OCR-B installed.
 */

import { OCRB } from './ocrb-digits.js';

const MM_TO_PT = 72 / 25.4;
const r = (n, p = 4) => (Math.round(n * 10 ** p) / 10 ** p).toString();

/**
 * Expand a doc glyph into drawing commands in the target space.
 *
 * Glyph outlines are stored in em fractions with y up from the baseline; docs
 * are in millimetres with y down from the top. `flip` handles PDF and EPS,
 * whose origin is bottom-left, and `unit` converts mm to the output's units.
 *
 * Yields ['M',x,y] | ['L',x,y] | ['C',x1,y1,x2,y2,x,y] | ['Z'].
 */
function glyphPath(g, docH, { flip, unit }) {
  const cmds = OCRB.glyphs[g.char];
  if (!cmds) return [];
  const px = (gx) => (g.x + gx * g.em) * unit;
  const py = (gy) => (flip ? (docH - g.y + gy * g.em) : (g.y - gy * g.em)) * unit;
  const out = [];
  for (const c of cmds) {
    switch (c[0]) {
      case 0: out.push(['M', px(c[1]), py(c[2])]); break;
      case 1: out.push(['L', px(c[1]), py(c[2])]); break;
      case 2: out.push(['C', px(c[1]), py(c[2]), px(c[3]), py(c[4]), px(c[5]), py(c[6])]); break;
      case 3: out.push(['Z']); break;
    }
  }
  return out;
}

/* --------------------------------------------------------------- SVG ---- */

export function toSvg(doc) {
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ` +
    `width="${r(doc.w)}mm" height="${r(doc.h)}mm" ` +
    `viewBox="0 0 ${r(doc.w)} ${r(doc.h)}">`,
  );
  parts.push(`<title>${escapeXml(doc.title)}</title>`);
  if (doc.background) {
    parts.push(`<rect x="0" y="0" width="${r(doc.w)}" height="${r(doc.h)}" fill="${doc.background}"/>`);
  }
  parts.push(`<g fill="${doc.fill}">`);
  for (const b of doc.rects) {
    parts.push(`<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.w)}" height="${r(b.h)}"/>`);
  }
  for (const g of doc.glyphs || []) {
    const d = glyphPath(g, doc.h, { flip: false, unit: 1 })
      .map((c) => c[0] + c.slice(1).map((n) => r(n)).join(' '))
      .join('');
    if (d) parts.push(`<path d="${d}"/>`);
  }
  parts.push('</g></svg>');
  return parts.join('\n');
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

/* --------------------------------------------------------------- PDF ---- */

export function toPdf(doc) {
  const W = doc.w * MM_TO_PT;
  const H = doc.h * MM_TO_PT;
  const pt = (mm) => r(mm * MM_TO_PT, 3);

  const ops = [];
  if (doc.background) {
    ops.push(`${rgb(doc.background)} rg`, `0 0 ${r(W, 3)} ${r(H, 3)} re f`);
  }
  ops.push(`${rgb(doc.fill)} rg`);
  for (const b of doc.rects) {
    // Flip y: PDF's origin is bottom-left.
    ops.push(`${pt(b.x)} ${pt(doc.h - b.y - b.h)} ${pt(b.w)} ${pt(b.h)} re f`);
  }
  for (const g of doc.glyphs || []) {
    const cmds = glyphPath(g, doc.h, { flip: true, unit: MM_TO_PT });
    if (!cmds.length) continue;
    for (const c of cmds) {
      const n = c.slice(1).map((v) => r(v, 3)).join(' ');
      if (c[0] === 'M') ops.push(`${n} m`);
      else if (c[0] === 'L') ops.push(`${n} l`);
      else if (c[0] === 'C') ops.push(`${n} c`);
      else ops.push('h');
    }
    // Nonzero winding, which is what CFF outlines are drawn for — it keeps the
    // counters in 0, 4, 6, 8 and 9 open.
    ops.push('f');
  }
  const stream = ops.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${r(W, 3)} ${r(H, 3)}] ` +
      '/Resources << >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  // Deliberately all-ASCII (no binary marker comment) so character offsets and
  // byte offsets stay identical — the xref table below depends on that.
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  out += `startxref\n${xrefAt}\n%%EOF\n`;
  return out;
}

function rgb(hex) {
  const h = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return v.map((n) => r(n, 3)).join(' ');
}

/* --------------------------------------------------------------- EPS ---- */

export function toEps(doc) {
  const W = doc.w * MM_TO_PT;
  const H = doc.h * MM_TO_PT;
  const pt = (mm) => r(mm * MM_TO_PT, 3);

  const L = [];
  L.push('%!PS-Adobe-3.0 EPSF-3.0');
  L.push(`%%Creator: COGNAK barcode tool`);
  L.push(`%%Title: ${doc.title.replace(/[\r\n]/g, ' ')}`);
  L.push(`%%BoundingBox: 0 0 ${Math.ceil(W)} ${Math.ceil(H)}`);
  L.push(`%%HiResBoundingBox: 0 0 ${r(W, 3)} ${r(H, 3)}`);
  L.push('%%EndComments');
  // Illustrator does not build an artboard from %%BoundingBox when it opens a
  // plain EPS — it makes a document from whatever new-document profile is
  // current and drops the art onto it, which is why an unrelated artboard
  // shows up. These are Illustrator's own private comments for artboard and
  // canvas size; any RIP that doesn't recognise them ignores them as ordinary
  // DSC comments. Open the PDF instead if you want a guaranteed tight artboard.
  L.push(`%AI7_ArtboardBox: 0 0 ${r(W, 3)} ${r(H, 3)}`);
  L.push(`%AI5_ArtSize: ${r(W, 3)} ${r(H, 3)}`);
  L.push(`%AI3_Cropmarks: 0 0 ${r(W, 3)} ${r(H, 3)}`);
  L.push('%AI3_Margin: 0 0 0 0');
  L.push('%%BeginProlog');
  // x y w h R — an explicitly constructed rectangle path, rather than the
  // Level 2 `rectfill`, because some EPS importers still parse conservatively.
  L.push('/R { /rh exch def /rw exch def /ry exch def /rx exch def');
  L.push('  newpath rx ry moveto rw 0 rlineto 0 rh rlineto rw neg 0 rlineto closepath fill } bind def');
  L.push('%%EndProlog');

  if (doc.background) {
    L.push(`${rgbPs(doc.background)} setrgbcolor`);
    L.push(`0 0 ${r(W, 3)} ${r(H, 3)} R`);
  }
  L.push(`${rgbPs(doc.fill)} setrgbcolor`);
  for (const b of doc.rects) {
    L.push(`${pt(b.x)} ${pt(doc.h - b.y - b.h)} ${pt(b.w)} ${pt(b.h)} R`);
  }
  for (const g of doc.glyphs || []) {
    const cmds = glyphPath(g, doc.h, { flip: true, unit: MM_TO_PT });
    if (!cmds.length) continue;
    L.push('newpath');
    for (const c of cmds) {
      const n = c.slice(1).map((v) => r(v, 3)).join(' ');
      if (c[0] === 'M') L.push(`${n} moveto`);
      else if (c[0] === 'L') L.push(`${n} lineto`);
      else if (c[0] === 'C') L.push(`${n} curveto`);
      else L.push('closepath');
    }
    L.push('fill');
  }
  L.push('showpage');
  L.push('%%EOF');
  return L.join('\n');
}

function rgbPs(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => r(parseInt(h.slice(i, i + 2), 16) / 255, 3)).join(' ');
}

export const FORMATS = [
  { ext: 'svg', mime: 'image/svg+xml', emit: toSvg },
  { ext: 'pdf', mime: 'application/pdf', emit: toPdf },
  { ext: 'eps', mime: 'application/postscript', emit: toEps },
];
