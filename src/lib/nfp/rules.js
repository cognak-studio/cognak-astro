/**
 * Nutrition Facts rules — 21 CFR 101.9 as amended by the 2016 final rule
 * (81 FR 33742), the version in force since the 2020/2021 compliance dates.
 *
 * Everything the FDA could plausibly change lives in this one file: the Daily
 * Values (c)(8)(iv) and (c)(9), the rounding increments in (c), the
 * insignificance thresholds behind the simplified format (f), and the nutrient
 * order and labels in (c) and (d). The layout code never hard-codes a number
 * from here.
 *
 * Nothing in this module touches the DOM.
 */

/* ------------------------------------------------------------ rounding --- */

const near = (v, inc) => Math.round(v / inc) * inc;
const fmtNum = (v) => {
  // 0.5-gram increments print as "1.5", whole numbers never print a decimal.
  const s = (Math.round(v * 10) / 10).toString();
  return s;
};

/** Calories: <5 → 0; ≤50 nearest 5; >50 nearest 10.  (c)(1)(i) */
export function roundCalories(v) {
  if (v < 5) return 0;
  if (v <= 50) return near(v, 5);
  return near(v, 10);
}

/** Fats (total, sat, trans, poly, mono): <0.5 → 0; <5 nearest 0.5; ≥5 nearest 1.  (c)(2) */
export function roundFat(v) {
  if (v < 0.5) return 0;
  if (v < 5) return near(v, 0.5);
  return near(v, 1);
}

/** Cholesterol: <2 → 0; 2–5 → "less than 5"; >5 nearest 5.  (c)(3) */
export function roundChol(v) {
  if (v < 2) return { n: 0 };
  if (v <= 5) return { n: 5, lt: true };
  return { n: near(v, 5) };
}

/** Sodium and potassium: <5 → 0; 5–140 nearest 5; >140 nearest 10.  (c)(4) */
export function roundSodium(v) {
  if (v < 5) return 0;
  if (v <= 140) return near(v, 5);
  return near(v, 10);
}

/** Carbohydrate family and protein: <0.5 → 0; <1 → "less than 1"; ≥1 nearest 1.  (c)(6), (c)(7) */
export function roundGram(v) {
  if (v < 0.5) return { n: 0 };
  if (v < 1) return { n: 1, lt: true };
  return { n: near(v, 1) };
}

/**
 * %DV for the macronutrients: nearest whole percent.  (d)(7)(ii)
 * The rule permits calculating from either the declared (rounded) amount or
 * the actual amount; this tool uses the actual amount, which is what most
 * labs report and what avoids double rounding.
 */
export const pctDV = (raw, dv) => (dv ? Math.round((raw / dv) * 100) : null);

/**
 * %DV for vitamins and minerals: nearest 2% up to 10, nearest 5% to 50,
 * nearest 10% above.  (c)(8)(iii)
 */
export function pctDVMicro(raw, dv) {
  const p = (raw / dv) * 100;
  if (p <= 10) return near(p, 2);
  if (p <= 50) return near(p, 5);
  return near(p, 10);
}

/* ------------------------------------------------------- daily values --- */

/** DRVs (c)(9) and RDIs (c)(8)(iv), adults and children 4+. */
export const DV = {
  fat: 78, sat: 20, chol: 300, sodium: 2300, carb: 275, fiber: 28, addedSugars: 50, protein: 50,
  vitD: 20, calcium: 1300, iron: 18, potassium: 4700,
  vitA: 900, vitC: 90, vitE: 15, vitK: 120, thiamin: 1.2, riboflavin: 1.3, niacin: 16, vitB6: 1.7,
  folate: 400, vitB12: 2.4, biotin: 30, pantothenic: 5, phosphorus: 1250, iodine: 150,
  magnesium: 420, zinc: 11, selenium: 55, copper: 0.9, manganese: 2.3, chromium: 35,
  molybdenum: 45, chloride: 2300, choline: 550,
};

/* -------------------------------------------------------- nutrient table --- */

/**
 * Every declarable nutrient, in label order.
 *   key       input id
 *   label     full name; `abbr` is the form permitted on packages ≤40 sq in (j)(13)(ii)
 *   unit      g / mg / mcg
 *   level     0 = bold top-level row, 1 = indented, 2 = doubly indented
 *   round     which rounding rule applies
 *   dv        Daily Value key, or null where no %DV is declared
 *   mandatory true for the fifteen the rule always requires
 *   micro     vitamins and minerals (listed below the thick bar)
 *   inc       quantitative rounding increment for vitamins and minerals — from
 *             FDA's rounding table for the 2016 label; verify against the
 *             current table before relying on an uncommon one.
 */
export const NUTRIENTS = [
  { key: 'fat', label: 'Total Fat', unit: 'g', level: 0, round: 'fat', dv: 'fat', mandatory: true },
  { key: 'sat', label: 'Saturated Fat', abbr: 'Sat. Fat', unit: 'g', level: 1, round: 'fat', dv: 'sat', mandatory: true },
  { key: 'trans', label: 'Trans Fat', unit: 'g', level: 1, round: 'fat', dv: null, mandatory: true, trans: true },
  { key: 'poly', label: 'Polyunsaturated Fat', abbr: 'Polyunsat. Fat', unit: 'g', level: 1, round: 'fat', dv: null, voluntary: true },
  { key: 'mono', label: 'Monounsaturated Fat', abbr: 'Monounsat. Fat', unit: 'g', level: 1, round: 'fat', dv: null, voluntary: true },
  { key: 'chol', label: 'Cholesterol', abbr: 'Cholest.', unit: 'mg', level: 0, round: 'chol', dv: 'chol', mandatory: true },
  { key: 'sodium', label: 'Sodium', unit: 'mg', level: 0, round: 'sodium', dv: 'sodium', mandatory: true },
  { key: 'carb', label: 'Total Carbohydrate', abbr: 'Total Carb.', unit: 'g', level: 0, round: 'gram', dv: 'carb', mandatory: true },
  { key: 'fiber', label: 'Dietary Fiber', abbr: 'Fiber', unit: 'g', level: 1, round: 'gram', dv: 'fiber', mandatory: true },
  { key: 'solFiber', label: 'Soluble Fiber', abbr: 'Sol. Fiber', unit: 'g', level: 2, round: 'gram', dv: null, voluntary: true },
  { key: 'insolFiber', label: 'Insoluble Fiber', abbr: 'Insol. Fiber', unit: 'g', level: 2, round: 'gram', dv: null, voluntary: true },
  { key: 'sugars', label: 'Total Sugars', unit: 'g', level: 1, round: 'gram', dv: null, mandatory: true },
  { key: 'addedSugars', label: 'Added Sugars', unit: 'g', level: 2, round: 'gram', dv: 'addedSugars', mandatory: true, includes: true },
  { key: 'sugarAlc', label: 'Sugar Alcohol', abbr: 'Sugar Alc.', unit: 'g', level: 1, round: 'gram', dv: null, voluntary: true },
  { key: 'protein', label: 'Protein', unit: 'g', level: 0, round: 'gram', dv: null, mandatory: true },
  // Vitamins and minerals — the four mandatory ones first, then the rest in
  // the order of (c)(8)(iv).
  { key: 'vitD', label: 'Vitamin D', abbr: 'Vit. D', unit: 'mcg', micro: true, dv: 'vitD', mandatory: true, inc: 0.1 },
  { key: 'calcium', label: 'Calcium', unit: 'mg', micro: true, dv: 'calcium', mandatory: true, inc: 10 },
  { key: 'iron', label: 'Iron', unit: 'mg', micro: true, dv: 'iron', mandatory: true, inc: 0.1 },
  { key: 'potassium', label: 'Potassium', abbr: 'Potas.', unit: 'mg', micro: true, dv: 'potassium', mandatory: true, round: 'sodium' },
  { key: 'vitA', label: 'Vitamin A', abbr: 'Vit. A', unit: 'mcg', micro: true, dv: 'vitA', voluntary: true, inc: 10 },
  { key: 'vitC', label: 'Vitamin C', abbr: 'Vit. C', unit: 'mg', micro: true, dv: 'vitC', voluntary: true, inc: 1 },
  { key: 'vitE', label: 'Vitamin E', abbr: 'Vit. E', unit: 'mg', micro: true, dv: 'vitE', voluntary: true, inc: 0.1 },
  { key: 'vitK', label: 'Vitamin K', abbr: 'Vit. K', unit: 'mcg', micro: true, dv: 'vitK', voluntary: true, inc: 1 },
  { key: 'thiamin', label: 'Thiamin', unit: 'mg', micro: true, dv: 'thiamin', voluntary: true, inc: 0.1 },
  { key: 'riboflavin', label: 'Riboflavin', unit: 'mg', micro: true, dv: 'riboflavin', voluntary: true, inc: 0.1 },
  { key: 'niacin', label: 'Niacin', unit: 'mg', micro: true, dv: 'niacin', voluntary: true, inc: 0.1 },
  { key: 'vitB6', label: 'Vitamin B6', abbr: 'Vit. B6', unit: 'mg', micro: true, dv: 'vitB6', voluntary: true, inc: 0.1 },
  { key: 'folate', label: 'Folate', unit: 'mcg DFE', micro: true, dv: 'folate', voluntary: true, inc: 10 },
  { key: 'vitB12', label: 'Vitamin B12', abbr: 'Vit. B12', unit: 'mcg', micro: true, dv: 'vitB12', voluntary: true, inc: 0.1 },
  { key: 'biotin', label: 'Biotin', unit: 'mcg', micro: true, dv: 'biotin', voluntary: true, inc: 1 },
  { key: 'pantothenic', label: 'Pantothenic Acid', abbr: 'Pantothenic Acid', unit: 'mg', micro: true, dv: 'pantothenic', voluntary: true, inc: 0.1 },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg', micro: true, dv: 'phosphorus', voluntary: true, inc: 10 },
  { key: 'iodine', label: 'Iodine', unit: 'mcg', micro: true, dv: 'iodine', voluntary: true, inc: 1 },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', micro: true, dv: 'magnesium', voluntary: true, inc: 10 },
  { key: 'zinc', label: 'Zinc', unit: 'mg', micro: true, dv: 'zinc', voluntary: true, inc: 0.1 },
  { key: 'selenium', label: 'Selenium', unit: 'mcg', micro: true, dv: 'selenium', voluntary: true, inc: 1 },
  { key: 'copper', label: 'Copper', unit: 'mg', micro: true, dv: 'copper', voluntary: true, inc: 0.1 },
  { key: 'manganese', label: 'Manganese', unit: 'mg', micro: true, dv: 'manganese', voluntary: true, inc: 0.1 },
  { key: 'chromium', label: 'Chromium', unit: 'mcg', micro: true, dv: 'chromium', voluntary: true, inc: 1 },
  { key: 'molybdenum', label: 'Molybdenum', unit: 'mcg', micro: true, dv: 'molybdenum', voluntary: true, inc: 1 },
  { key: 'chloride', label: 'Chloride', unit: 'mg', micro: true, dv: 'chloride', voluntary: true, inc: 10 },
  { key: 'choline', label: 'Choline', unit: 'mg', micro: true, dv: 'choline', voluntary: true, inc: 10 },
];

export const byKey = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));

/* ------------------------------------------------------------ declare --- */

/**
 * Turn a raw per-serving amount into what prints.
 * Returns { text, pct } where text is e.g. "8g", "less than 1g", "0mg", and
 * pct is the %DV as a whole number or null.
 */
export function declare(n, raw) {
  if (raw == null || !Number.isFinite(raw)) raw = 0;
  if (raw < 0) raw = 0;
  let text;
  let pct = null;
  if (n.micro) {
    const dv = DV[n.dv];
    let q;
    if (n.round === 'sodium') q = roundSodium(raw);
    else q = near(raw, n.inc);
    // Keep the increment's own precision: 0.1 → one decimal, 10 → none.
    const dp = n.inc && n.inc < 1 ? 1 : 0;
    text = `${q.toFixed(dp)}${n.unit}`.replace(/\.0(?=\D)/, '');
    pct = pctDVMicro(raw, dv);
  } else if (n.round === 'fat') {
    text = `${fmtNum(roundFat(raw))}${n.unit}`;
  } else if (n.round === 'chol') {
    const r = roundChol(raw);
    text = r.lt ? `less than ${r.n}${n.unit}` : `${r.n}${n.unit}`;
  } else if (n.round === 'sodium') {
    text = `${roundSodium(raw)}${n.unit}`;
  } else {
    const r = roundGram(raw);
    text = r.lt ? `less than ${r.n}${n.unit}` : `${r.n}${n.unit}`;
  }
  if (!n.micro && n.dv) pct = pctDV(raw, DV[n.dv]);
  return { text, pct };
}

/**
 * "Insignificant" for the simplified format (f): an amount that may be
 * declared as zero, or for carbohydrate, fiber, sugars and protein, as
 * "less than 1 gram".
 */
export function isInsignificant(n, raw) {
  raw = raw || 0;
  if (n.key === 'calories') return raw < 5;
  if (n.round === 'fat') return raw < 0.5;
  if (n.round === 'chol') return raw < 2;
  if (n.round === 'sodium') return raw < 5;
  if (n.micro) return (raw / DV[n.dv]) * 100 < 2;
  return raw < 1;
}

/** The simplified format may be used when 8 or more of these are insignificant.  (f)(1) */
export const SIMPLIFIED_POOL = ['calories', 'fat', 'sat', 'trans', 'chol', 'sodium', 'carb', 'fiber', 'sugars', 'addedSugars', 'protein', 'vitD', 'calcium', 'iron', 'potassium'];
/** These are always declared, simplified or not.  (f)(2)(i) */
export const SIMPLIFIED_REQUIRED = ['calories', 'fat', 'sodium', 'carb', 'protein'];

/* ------------------------------------------------------------ servings --- */

/**
 * Servings per container, (b)(8): whole numbers, except that between 2 and 5
 * servings the count is rounded to the nearest 0.5, and "about" precedes any
 * count that was rounded.
 */
export function servingsText(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  let r;
  if (n >= 2 && n <= 5) r = Math.round(n * 2) / 2;
  else r = Math.round(n);
  const about = Math.abs(r - n) > 1e-9 ? 'about ' : '';
  const num = r.toString();
  return { text: `${about}${num}`, n: r, single: r === 1 };
}

/* ------------------------------------------------------------ footnote --- */

export const FOOTNOTE = 'The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.';

/* ----------------------------------------------------------- packages --- */

/**
 * Package tiers by total surface area available to bear labeling, (j)(13):
 *   > 40 sq in  standard formats; tabular only where 3 in of continuous
 *               vertical space is unavailable, (d)(11)(iii)
 *   ≤ 40 sq in  tabular or linear permitted, abbreviations permitted, reduced
 *               type minimums
 *   < 12 sq in  may omit the panel and give an address or phone number
 *               instead; if declared, the small-package rules apply
 */
export function tierFor(areaSqIn) {
  if (!Number.isFinite(areaSqIn) || areaSqIn <= 0) return 'standard';
  if (areaSqIn < 12) return 'tiny';
  if (areaSqIn <= 40) return 'small';
  return 'standard';
}
