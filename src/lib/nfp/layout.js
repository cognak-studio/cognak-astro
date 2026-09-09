/**
 * Nutrition Facts layout. Takes the form's state, applies ./rules.js, and
 * returns a "doc" the emitters in ../barcode/emit.js can write out: millimetre
 * coordinates, y down, `rects` for rules and bars, `paths` for every glyph.
 *
 * Four formats — standard vertical, vertical with the vitamins and minerals
 * run side by side, tabular, linear — each in a single-column form and, for
 * the two vertical ones, a dual-column form (per serving / per container, or
 * as packaged / as prepared). Simplified versions fall out of the same code:
 * the row list is just shorter and a "Not a significant source of" line is
 * added.
 *
 * Type sizes are the FDA's minimums or the sizes on its own sample labels,
 * per tier, and the whole panel can be scaled up from there. The rule weights
 * (7 pt, 3 pt, hairline) follow the FDA sample. Nothing here is a legal
 * determination; the page says so in its own copy.
 */

import { NUTRIENTS, byKey, DV, declare, roundCalories, isInsignificant, servingsText, FOOTNOTE, SIMPLIFIED_POOL, SIMPLIFIED_REQUIRED } from './rules.js';
import { measure, measureRuns, capHeight, place, wrap } from './text.js';

const PT_TO_MM = 25.4 / 72;
const r3 = (n) => Math.round(n * 1000) / 1000;

/* ---------------------------------------------------------- type specs --- */

export const SIZES = {
  // Standard formats: (d)(1)(iv) minimums — 8 pt nutrients, 10 pt servings,
  // 16 pt "Calories", 22 pt calorie value, 6 pt footnote — at the proportions
  // of the FDA sample label. Heading has to be larger than everything else.
  standard: { heading: 24, serv: 10, amt: 6, cal: 16, calNum: 22, dvh: 6, nut: 8, lead: 4, foot: 6, footLead: 1.5,
    thick: 7, med: 3, hair: 0.5, box: 0.5, pad: 4, indent: 8, colPad: 4 },
  // Packages ≤ 40 sq in, (j)(13)(ii): 9 pt servings, 10 pt "Calories",
  // 14 pt value, 8 pt nutrients; heading still larger than all but the value.
  small: { heading: 15, serv: 9, amt: 6, cal: 10, calNum: 14, dvh: 6, nut: 8, lead: 2.5, foot: 6, footLead: 1,
    thick: 5, med: 2.5, hair: 0.5, box: 0.5, pad: 3, indent: 6, colPad: 3 },
  // < 12 sq in: the linear form may drop to 6 pt (FDA's own sample does).
  tiny: { heading: 12, serv: 8, amt: 6, cal: 10, calNum: 14, dvh: 6, nut: 6, lead: 2, foot: 6, footLead: 1,
    thick: 4, med: 2, hair: 0.4, box: 0.4, pad: 2.5, indent: 5, colPad: 2.5 },
};

/* ------------------------------------------------------------- canvas --- */

class Canvas {
  constructor() { this.rects = []; this.paths = []; }
  rect(x, y, w, h) { if (w > 0 && h > 0) this.rects.push({ x, y, w, h }); }
  hline(x, y, w, th) { this.rect(x, y, w, th); }
  vline(x, y, h, th) { this.rect(x, y, th, h); }
  /** Place one run; returns its width. */
  text(x, y, t, face, size) {
    const g = place(t, face, size, x, y);
    if (g.cmds.length) this.paths.push(g.cmds);
    return g.w;
  }
  /** Place mixed runs left-to-right from x; returns total width. */
  runs(x, y, runs) {
    let cx = x;
    for (const r of runs) cx += this.text(cx, y, r.t, r.face, r.size);
    return cx - x;
  }
  /** Right-aligned runs ending at x. */
  runsRight(x, y, runs) {
    const w = measureRuns(runs);
    this.runs(x - w, y, runs);
    return w;
  }
  /** Centred runs on x. */
  runsCenter(x, y, runs) {
    const w = measureRuns(runs);
    this.runs(x - w / 2, y, runs);
    return w;
  }
  toDoc(W, H, title) {
    const k = PT_TO_MM;
    return {
      w: r3(W * k), h: r3(H * k), title, fill: '#000000', background: null,
      rects: this.rects.map((b) => ({ x: r3(b.x * k), y: r3(b.y * k), w: r3(b.w * k), h: r3(b.h * k) })),
      paths: this.paths.map((cmds) => cmds.map((c) => (c.length === 1 ? c : c.map((v, i) => (i === 0 ? v : r3(v * k)))))),
    };
  }
}

/* ----------------------------------------------------------- content --- */

const lower = (s) => s.replace(/Trans/, 'trans').replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/ Fat| Sugars| Fiber| Carbohydrate/g, (m) => m.toLowerCase());

/**
 * Resolve the form state into columns of declared rows.
 * @param inp  see page script for the shape
 * @returns { cols, simplified, notSignificant, servings, single }
 */
export function resolve(inp) {
  const small = inp.tier !== 'standard';
  const abbr = (n) => (small && n.abbr ? n.abbr : n.label);
  const sv = servingsText(inp.servings);

  // Column sources: per-serving always; second column derived or entered.
  const sources = [{ head: null, cal: inp.calories, n: inp.n }];
  if (inp.columns === 'container' && sv && sv.n > 1) {
    const k = inp.servings;
    const n2 = {};
    for (const key of Object.keys(inp.n)) n2[key] = (inp.n[key] || 0) * k;
    sources[0].head = 'Per serving';
    sources.push({ head: 'Per container', cal: (inp.calories || 0) * k, n: n2 });
  } else if (inp.columns === 'prepared') {
    sources[0].head = inp.colHeads?.[0] || 'As packaged';
    sources.push({ head: inp.colHeads?.[1] || 'As prepared', cal: inp.calories2, n: inp.n2 || {} });
  }

  // Simplified format eligibility is judged on the per-serving column.
  const insig = SIMPLIFIED_POOL.filter((k) => (k === 'calories'
    ? isInsignificant({ key: 'calories' }, inp.calories)
    : isInsignificant(byKey[k], inp.n[k])));
  const eligible = insig.length >= 8;
  const simplified = eligible && inp.simplified;
  const omitted = simplified ? insig.filter((k) => !SIMPLIFIED_REQUIRED.includes(k) && k !== 'calories') : [];

  const visible = NUTRIENTS.filter((n) => {
    if (n.voluntary) return !!inp.show?.[n.key];
    if (simplified && omitted.includes(n.key)) return false;
    return true;
  });

  const cols = sources.map((src) => ({
    head: src.head,
    calories: roundCalories(src.cal || 0),
    rows: visible.filter((n) => !n.micro).map((n) => ({ n, name: abbr(n), ...declare(n, src.n[n.key]) })),
    micros: visible.filter((n) => n.micro).map((n) => ({ n, name: abbr(n), ...declare(n, src.n[n.key]) })),
  }));

  const notSignificant = omitted.length
    ? 'Not a significant source of ' + joinList(omitted.map((k) => lower(byKey[k].label)))
    : null;

  return { cols, simplified, eligible, notSignificant, servings: sv, small };
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** Name runs for a nutrient row: bold at level 0, regular indented otherwise; "Trans" italic. */
function nameRuns(row, S, size) {
  const { n, name } = row;
  const face = n.level === 0 ? 'bold' : 'regular';
  if (n.trans) return [{ t: 'Trans', face: 'italic', size }, { t: ' Fat', face: 'regular', size }];
  if (n.includes) return null; // handled by rowRuns
  return [{ t: name, face, size }];
}

/** Full "name value" runs for a single-column row. */
function rowRuns(row, S, size, small) {
  const { n, text } = row;
  if (n.includes) {
    return [{ t: `${small ? 'Incl.' : 'Includes'} ${text} Added Sugars`, face: 'regular', size }];
  }
  return [...nameRuns(row, S, size), { t: ` ${text}`, face: 'regular', size }];
}

const pctRun = (pct, size, face = 'bold') => (pct == null ? [] : [{ t: `${pct}%`, face, size }]);

/* ----------------------------------------------------- vertical formats --- */

export function layoutVertical(inp, { sideMicros = false } = {}) {
  const S = scaled(SIZES[inp.tier] || SIZES.standard, inp.scale);
  const R = resolve(inp);
  const { cols, small } = R;
  const dual = cols.length === 2;
  const C = new Canvas();
  const nut = S.nut;
  const rowH = S.nut + S.lead;
  const cap = capHeight('bold', nut);
  const base = (top) => top + (rowH + cap) / 2; // baseline inside a row box

  /* --- measure --------------------------------------------------------- */
  const headingW = measure('Nutrition Facts', 'bold', S.heading);
  const nameW = Math.max(...cols[0].rows.map((row) => measureRuns(dual ? (row.n.includes ? rowRunsDual(row, nut, small) : nameRuns(row, S, nut)) : rowRuns(row, S, nut, small)) + row.n.level * S.indent));
  const microW = sideMicros ? 0 : Math.max(0, ...cols[0].micros.map((m) => measure(`${m.name} ${m.text}`, 'regular', nut)));
  let colW = 0;
  if (dual) {
    for (const col of cols) {
      const w1 = Math.max(...col.rows.map((row) => (row.n.includes ? measureRuns(rowRuns(row, S, nut, small)) : measure(row.text, 'regular', nut)) + 6 + measure(`${row.pct ?? 0}%`, 'bold', nut)));
      const w2 = Math.max(...col.micros.map((m) => measure(m.text, 'regular', nut) + 6 + measure(`${m.pct}%`, 'regular', nut)));
      const w3 = measure(col.head, 'bold', S.amt + 1);
      const w4 = measure(String(col.calories), 'bold', S.calNum);
      colW = Math.max(colW, w1, w2, w3, w4);
    }
    colW += 2 * S.colPad;
  }
  const pctW = measure('100%', 'bold', nut);
  const servW = measure('Serving size', 'bold', S.serv) + 8 + measure(inp.servingSize || '', 'bold', S.serv);
  const calW = measure('Calories', 'bold', S.cal) + 8 + measure(String(cols[0].calories), 'bold', S.calNum);
  let inner = Math.max(
    headingW,
    servW,
    dual ? calW : calW,
    dual ? Math.max(nameW, microW) + 10 + 2 * colW : Math.max(nameW, microW) + 8 + pctW,
    inp.tier === 'standard' ? 150 : 110,
  );
  const edge = S.box + S.pad;
  const W = inner + 2 * edge;
  const x0 = edge;
  const x1 = W - edge;

  /* --- draw ------------------------------------------------------------ */
  let y = edge;
  // Heading
  y += capHeight('bold', S.heading);
  C.text(x0, y, 'Nutrition Facts', 'bold', S.heading);
  y += S.pad * 0.8;
  C.hline(x0, y, inner, S.hair);
  y += S.hair;
  // Servings per container
  const sv = R.servings;
  const servH = S.serv + 2;
  if (sv) {
    y += servH;
    C.text(x0, y - 1, `${sv.text} serving${sv.n === 1 ? '' : 's'} per container`, 'regular', S.serv);
  }
  y += servH;
  C.text(x0, y - 1, 'Serving size', 'bold', S.serv);
  C.runsRight(x1, y - 1, [{ t: inp.servingSize || '', face: 'bold', size: S.serv }]);
  y += 3;
  // Thick bar
  C.hline(x0, y, inner, S.thick);
  y += S.thick + 2;

  // Column geometry (dual)
  const colX = (i) => x1 - (2 - i) * colW; // left edge of column i
  const colR = (i) => x1 - (1 - i) * colW - S.colPad; // right (pct) edge inside column i
  const colL = (i) => colX(i) + S.colPad;

  // Amount per serving / column heads
  if (dual) {
    const hs = S.amt + 1;
    y += hs;
    cols.forEach((col, i) => C.runsRight(colR(i), y, [{ t: col.head, face: 'bold', size: hs }]));
    y += 1.5;
  } else {
    y += S.amt;
    C.text(x0, y, 'Amount per serving', 'bold', S.amt);
    y += 1;
  }
  // Calories
  const calCap = capHeight('bold', S.calNum);
  y += calCap + 1;
  C.text(x0, y, 'Calories', 'bold', S.cal);
  if (dual) cols.forEach((col, i) => C.runsRight(colR(i), y, [{ t: String(col.calories), face: 'bold', size: S.calNum }]));
  else C.runsRight(x1, y, [{ t: String(cols[0].calories), face: 'bold', size: S.calNum }]);
  y += 3;
  C.hline(x0, y, inner, S.med);
  y += S.med;
  const colTop = y; // vertical divider starts here in dual layouts

  // % Daily Value heading
  const dvhH = S.dvh + 3;
  y += dvhH;
  if (dual) cols.forEach((col, i) => C.runsRight(colR(i), y - 1.5, [{ t: '% DV*', face: 'bold', size: S.dvh }]));
  else C.runsRight(x1, y - 1.5, [{ t: '% Daily Value*', face: 'bold', size: S.dvh }]);

  // Nutrient rows
  for (const row of cols[0].rows) {
    C.hline(x0, y, inner, S.hair);
    const top = y;
    const b = base(top);
    const nx = x0 + row.n.level * S.indent;
    if (dual) {
      C.runs(nx, b, row.n.includes ? rowRunsDual(row, nut, small) : nameRuns(row, S, nut));
      cols.forEach((col, i) => {
        const r = col.rows.find((q) => q.n.key === row.n.key);
        C.runs(colL(i), b, [{ t: r.text, face: 'regular', size: nut }]);
        C.runsRight(colR(i), b, pctRun(r.pct, nut));
      });
    } else {
      C.runs(nx, b, rowRuns(row, S, nut, small));
      C.runsRight(x1, b, pctRun(row.pct, nut));
    }
    y += rowH;
  }
  // Thick bar after Protein
  C.hline(x0, y, inner, S.thick);
  y += S.thick;

  // Vitamins and minerals
  if (sideMicros && !dual) {
    // One running line, bullets between entries, wrapped to the width.
    // Bullets are glued to the entry that follows them (no-break spaces), so
    // a line can break before a bullet but never leave one dangling.
    const runs = cols[0].micros.map((m, i) => ({ t: `${i ? '\u2022\u00A0' : ''}${m.name}\u00A0${m.text}\u00A0${m.pct}%${i < cols[0].micros.length - 1 ? ' ' : ''}`, face: 'regular', size: nut }));
    const lines = wrap(runs, inner);
    for (const ln of lines) {
      const b = base(y);
      C.runs(x0, b, ln.runs);
      y += rowH;
    }
  } else {
    cols[0].micros.forEach((m, idx) => {
      if (idx) C.hline(x0, y, inner, S.hair);
      const b = base(y);
      if (dual) {
        C.text(x0, b, m.name, 'regular', nut);
        cols.forEach((col, i) => {
          const q = col.micros.find((z) => z.n.key === m.n.key);
          C.runs(colL(i), b, [{ t: q.text, face: 'regular', size: nut }]);
          C.runsRight(colR(i), b, pctRun(q.pct, nut, 'regular'));
        });
      } else {
        C.text(x0, b, `${m.name} ${m.text}`, 'regular', nut);
        C.runsRight(x1, b, pctRun(m.pct, nut, 'regular'));
      }
      y += rowH;
    });
  }
  const colBottom = y;
  if (dual) {
    // Divider between the two value columns.
    C.vline(colX(1) - S.hair / 2, colTop, colBottom - colTop, S.hair);
  }

  // Medium bar, then "Not a significant source" and the footnote
  C.hline(x0, y, inner, S.med);
  y += S.med;
  const footPitch = S.foot + S.footLead;
  if (R.notSignificant) {
    y += 2;
    for (const ln of wrap([{ t: R.notSignificant + '.', face: 'regular', size: S.foot }], inner)) {
      y += footPitch;
      C.runs(x0, y - S.footLead, ln.runs);
    }
    y += 1;
  }
  if (inp.footnote !== false) {
    y += 2;
    const star = measure('* ', 'regular', S.foot);
    const lines = wrap([{ t: FOOTNOTE, face: 'regular', size: S.foot }], inner - star);
    lines.forEach((ln, i) => {
      y += footPitch;
      if (i === 0) C.text(x0, y - S.footLead, '*', 'regular', S.foot);
      C.runs(x0 + star, y - S.footLead, ln.runs);
    });
  }
  y += S.pad;
  const H = y + S.box;

  // Box
  C.rect(0, 0, W, S.box); C.rect(0, H - S.box, W, S.box);
  C.rect(0, 0, S.box, H); C.rect(W - S.box, 0, S.box, H);

  return finish(C, W, H, inp, R, dual ? 'dual' : (sideMicros ? 'vertical-side' : 'vertical'));
}

// In a dual column "Includes" row the label is just "Includes Added Sugars"
// beside the name column; amounts live in the columns like every other row.
function rowRunsDual(row, size, small) {
  return [{ t: `${small ? 'Incl.' : 'Includes'} Added Sugars`, face: 'regular', size }];
}

/* ------------------------------------------------------------- tabular --- */

export function layoutTabular(inp) {
  const S = scaled(SIZES[inp.tier] || SIZES.standard, inp.scale);
  const R = resolve(inp);
  const { cols, small } = R;
  const col = cols[0]; // tabular is single-column only
  const C = new Canvas();
  const nut = S.nut;
  const rowH = S.nut + S.lead;
  const cap = capHeight('bold', nut);
  const base = (top) => top + (rowH + cap) / 2;
  const edge = S.box + S.pad;
  const gutter = S.pad * 1.5;

  // Split nutrients into the two columns the FDA sample uses: fats,
  // cholesterol and sodium on the left; carbohydrate family and protein right.
  const left = col.rows.filter((r) => ['fat', 'sat', 'trans', 'poly', 'mono', 'chol', 'sodium'].includes(r.n.key));
  const right = col.rows.filter((r) => !left.includes(r));
  const pctW = measure('100%', 'bold', nut);
  const colInner = (rows) => Math.max(
    measure('Amount/serving', 'bold', S.dvh) + 10 + measure('% DV*', 'bold', S.dvh),
    ...rows.map((r) => measureRuns(rowRuns(r, S, nut, small)) + r.n.level * S.indent + 6 + pctW),
  );
  const leftW = colInner(left);
  const rightW = colInner(right);

  // Block A: heading, servings, serving size, calories. One routine both
  // measures and draws, so the height can never disagree with the drawing.
  const sv = R.servings;
  const headW = measure('Nutrition Facts', 'bold', S.heading);
  const servLine = sv ? `${sv.text} serving${sv.n === 1 ? '' : 's'} per container` : '';
  const aW = Math.max(headW, measure(inp.servingSize || '', 'bold', S.serv), measure('Serving size', 'bold', S.serv),
    measure(String(col.calories), 'bold', S.calNum) + 6 + measure('per serving', 'regular', S.serv), 90 * inp.scale);
  const servLines = servLine ? wrap([{ t: servLine, face: 'regular', size: S.serv }], aW) : [];
  const blockA = (draw, ax, ay0) => {
    let ay = ay0 + capHeight('bold', S.heading);
    if (draw) C.text(ax, ay, 'Nutrition Facts', 'bold', S.heading);
    ay += 3; if (draw) C.hline(ax, ay, aW, S.hair); ay += S.hair;
    for (const ln of servLines) { ay += S.serv + 2; if (draw) C.runs(ax, ay - 1, ln.runs); }
    ay += S.serv + 2; if (draw) C.text(ax, ay - 1, 'Serving size', 'bold', S.serv);
    ay += S.serv + 2; if (draw) C.text(ax, ay - 1, inp.servingSize || '', 'bold', S.serv);
    ay += 3; if (draw) C.hline(ax, ay, aW, S.thick); ay += S.thick + 2;
    ay += S.amt; if (draw) C.text(ax, ay, 'Amount per serving', 'bold', S.amt);
    ay += capHeight('bold', S.cal) + 2; if (draw) C.text(ax, ay, 'Calories', 'bold', S.cal);
    ay += capHeight('bold', S.calNum) + 3;
    if (draw) {
      const nw = C.text(ax, ay, String(col.calories), 'bold', S.calNum);
      C.text(ax + nw + 4, ay, 'per serving', 'regular', S.serv);
    }
    return ay - ay0;
  };

  // Block D: footnote, wrapped narrow.
  const showFoot = inp.footnote !== false;
  const footW = showFoot ? Math.max(70 * inp.scale, Math.min(120 * inp.scale, aW)) : 0;
  const footPitch = S.foot + S.footLead;
  const star = measure('* ', 'regular', S.foot);
  const footLines = showFoot ? wrap([{ t: FOOTNOTE, face: 'regular', size: S.foot }], footW - star) : [];

  // Heights
  const rowsH = (rows) => S.dvh + 4 + rows.length * rowH;
  const aH = blockA(false, 0, 0);
  const bodyH = Math.max(aH, rowsH(left), rowsH(right), footLines.length * footPitch + 2);

  // Micronutrient band
  const microRuns = [];
  col.micros.forEach((m, i) => {
    const body = small ? `${m.name}\u00A0${m.pct}%` : `${m.name}\u00A0${m.text}\u00A0${m.pct}%`;
    microRuns.push({ t: `${i ? '\u2022\u00A0' : ''}${body}${i < col.micros.length - 1 ? ' ' : ''}`, face: 'regular', size: nut });
  });

  const inner = aW + leftW + rightW + (showFoot ? footW + 6 * gutter : 4 * gutter);
  const W = inner + 2 * edge;
  const x0 = edge;
  const microLines = wrap(microRuns, inner);
  const nsLines = R.notSignificant ? wrap([{ t: R.notSignificant + '.', face: 'regular', size: S.foot }], inner) : [];

  /* --- draw ------------------------------------------------------------ */
  let y = edge;
  blockA(true, x0, y);

  // Nutrient columns
  const drawCol = (x, w, rows) => {
    let cy = y + S.dvh + 2;
    C.text(x, cy, 'Amount/serving', 'bold', S.dvh);
    C.runsRight(x + w, cy, [{ t: '% DV*', face: 'bold', size: S.dvh }]);
    cy += 2;
    for (const row of rows) {
      C.hline(x, cy, w, S.hair);
      const b = base(cy);
      C.runs(x + row.n.level * S.indent, b, rowRuns(row, S, nut, small));
      C.runsRight(x + w, b, pctRun(row.pct, nut));
      cy += rowH;
    }
  };
  const bx = x0 + aW + gutter * 2;
  const cx = bx + leftW + gutter * 2;
  const dx = cx + rightW + gutter * 2;
  C.vline(bx - gutter, y, bodyH, S.hair);
  C.vline(cx - gutter, y, bodyH, S.hair);
  drawCol(bx, leftW, left);
  drawCol(cx, rightW, right);
  if (showFoot) {
    C.vline(dx - gutter, y, bodyH, S.hair);
    let fy = y + 1;
    footLines.forEach((ln, i) => {
      fy += footPitch;
      if (i === 0) C.text(dx, fy - S.footLead, '*', 'regular', S.foot);
      C.runs(dx + star, fy - S.footLead, ln.runs);
    });
  }

  y += bodyH + 4;
  C.hline(x0, y, inner, S.thick);
  y += S.thick;
  for (const ln of microLines) { const b = base(y); C.runs(x0, b, ln.runs); y += rowH; }
  if (nsLines.length) {
    C.hline(x0, y, inner, S.hair);
    for (const ln of nsLines) { y += footPitch + 1; C.runs(x0, y - S.footLead, ln.runs); }
    y += 1;
  }
  y += S.pad;
  const H = y + S.box;
  C.rect(0, 0, W, S.box); C.rect(0, H - S.box, W, S.box);
  C.rect(0, 0, S.box, H); C.rect(W - S.box, 0, S.box, H);
  return finish(C, W, H, inp, R, 'tabular');
}

/* -------------------------------------------------------------- linear --- */

export function layoutLinear(inp) {
  const S = scaled(SIZES[inp.tier] || SIZES.standard, inp.scale);
  const R = resolve(inp);
  const { cols, small } = R;
  const col = cols[0];
  const C = new Canvas();
  const nut = S.nut;
  const edge = S.box + S.pad;
  const inner = Math.max(120, (inp.linearWidthIn || 3.5) * 72 - 2 * edge);
  const W = inner + 2 * edge;
  const x0 = edge;
  const sv = R.servings;

  // Line 1: heading + servings, small bold. Sample: "Nutrition Facts Servings: 12, Serv. size: 1 mint (2g),"
  const head = [{ t: 'Nutrition Facts', face: 'bold', size: S.heading }];
  const servRuns = [
    { t: ` ${sv ? `Servings: ${sv.text}, ` : ''}Serv. size: ${inp.servingSize || ''},`, face: 'bold', size: S.serv },
  ];
  // Body: Amount per serving: Calories N, nutrients...
  const body = [{ t: 'Amount per serving: ', face: 'regular', size: nut }, { t: 'Calories', face: 'bold', size: S.cal }, { t: ` ${col.calories}`, face: 'bold', size: S.calNum }, { t: ', ', face: 'regular', size: nut }];
  col.rows.forEach((row) => {
    if (row.n.includes) {
      // Folded into Total Sugars as "(Incl. Xg Added Sugars, N% DV)"
      return;
    }
    const runs = row.n.trans
      ? [{ t: 'Trans', face: 'italic', size: nut }, { t: ' Fat', face: 'regular', size: nut }]
      : [{ t: row.name, face: row.n.level === 0 ? 'bold' : 'regular', size: nut }];
    let tail = ` ${row.text}`;
    if (row.n.key === 'sugars') {
      const add = col.rows.find((q) => q.n.key === 'addedSugars');
      if (add) tail += ` (${small ? 'Incl.' : 'Includes'} ${add.text} Added Sugars${add.pct != null ? `, ${add.pct}% DV` : ''})`;
    } else if (row.pct != null) tail += ` (${row.pct}% DV)`;
    tail += ', ';
    body.push(...runs, { t: tail, face: 'regular', size: nut });
  });
  col.micros.forEach((m, i) => {
    const last = i === col.micros.length - 1;
    body.push({ t: `${m.name}${small ? '' : ` ${m.text}`} (${m.pct}% DV)${last ? '.' : ', '}`, face: 'regular', size: nut });
  });
  if (R.notSignificant) body.push({ t: ` ${R.notSignificant}.`, face: 'regular', size: nut });

  let y = edge;
  // Heading line(s)
  const l1 = wrap([...head, ...servRuns], inner);
  for (const ln of l1) {
    const mx = Math.max(...ln.runs.map((r) => r.size));
    y += capHeight('bold', mx) + 2;
    C.runs(x0, y, ln.runs);
    y += 1;
  }
  y += 2;
  const lines = wrap(body, inner);
  for (const ln of lines) {
    const mx = Math.max(...ln.runs.map((r) => r.size));
    y += Math.max(nut + 1.5, capHeight('bold', mx) + 2);
    C.runs(x0, y, ln.runs);
  }
  if (inp.footnote === true && inp.tier === 'standard') {
    y += 2;
    const star = measure('* ', 'regular', S.foot);
    wrap([{ t: FOOTNOTE, face: 'regular', size: S.foot }], inner - star).forEach((ln, i) => {
      y += S.foot + S.footLead;
      if (i === 0) C.text(x0, y - S.footLead, '*', 'regular', S.foot);
      C.runs(x0 + star, y - S.footLead, ln.runs);
    });
  }
  y += S.pad;
  const H = y + S.box;
  C.rect(0, 0, W, S.box); C.rect(0, H - S.box, W, S.box);
  C.rect(0, 0, S.box, H); C.rect(W - S.box, 0, S.box, H);
  return finish(C, W, H, inp, R, 'linear');
}

/* ------------------------------------------------------------ helpers --- */

function scaled(S, k = 1) {
  const out = {};
  for (const key of Object.keys(S)) out[key] = S[key] * (k || 1);
  return out;
}

function finish(C, W, H, inp, R, kind) {
  const doc = C.toDoc(W, H, `Nutrition Facts — ${kind}`);
  doc.meta = { kind, tier: inp.tier, simplified: R.simplified, eligible: R.eligible, wPt: r3(W), hPt: r3(H), cols: R.cols.length };
  return doc;
}

/** Entry point: pick the layout for the requested format. */
export function layout(inp) {
  switch (inp.format) {
    case 'tabular': return layoutTabular(inp);
    case 'linear': return layoutLinear(inp);
    case 'vertical-side': return layoutVertical(inp, { sideMicros: true });
    default: return layoutVertical(inp);
  }
}

export { DV, NUTRIENTS };
