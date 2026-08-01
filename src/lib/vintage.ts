/* THE CASK GRADE — one implementation, imported everywhere it appears.

   It renders in three places (project detail, the /projects list, the homepage
   hover-meta) and it must never disagree with itself: a project that reads XO
   in the archive and VSOP on its own page breaks the one conceit the site is
   built on. Those three used to carry three separate copies of this arithmetic.
   They now all call this.

   ── What it measures, and what it used to ──
   Until 2026-08-01 the grade was computed from `date`, which is the WORDPRESS
   PUBLISH TIMESTAMP — when the case study was posted, not when the work
   happened or how long the relationship ran. Accorin was published in December
   2015, so it graded XO · 10y while its own copy read "5+ year relationship".
   The site's central metaphor was keyed to a CMS artifact.

   It now measures ENGAGEMENT LENGTH, from `engagementMonths` — lifted verbatim
   from each project's own authored duration line ("5+ year relationship",
   "6-month project"), so these are the studio's own statements rather than
   anything derived. 52 of 53 published projects had one.

   ── Live growth for active clients ──
   Where a client is active AND a real start year is known, the grade is
   computed from that start instead, so it accrues on its own — which is what
   the old "ongoing relationship" copy was selling. Only ten projects carry a
   confirmed start year (from `projectYear`); the rest fall back to their
   authored duration, which is static. Adding `engagementStart` to an active
   project is what switches it to live.

   ── Granularity ──
   Months, not years. The old version could only say "<1y", which collapsed a
   two-week HubSpot sprint and an eleven-month build into the same string. */

/* BNIC's real thresholds are VS under 4 years, VSOP 4–10, XO 10+ — which is
   correct for brandy and punishing for a design studio: on true engagement
   lengths it grades one project XO and forty-three VS. These are scaled to the
   life of a client relationship instead. Change them here and all three
   surfaces move together. */
export const GRADE_YEARS = { vsop: 1, xo: 4 };

export type VintageInput = {
  engagementMonths?: number;
  engagementStart?: number;
  activeClient?: boolean;
};

/** Engagement length in months, or null when the project doesn't state one. */
export function monthsOf(d: VintageInput, now = new Date()): number | null {
  if (d.activeClient === true && d.engagementStart) {
    const months =
      (now.getFullYear() - d.engagementStart) * 12 + now.getMonth() + 1;
    if (months > 0) return months;
  }
  return d.engagementMonths ?? null;
}

/** "VSOP · 5y", "VS · 6mo", "VS · <1mo" — or '' when there's nothing to say. */
export function vintageOf(d: VintageInput, now = new Date()): string {
  const months = monthsOf(d, now);
  if (months === null || months <= 0) return '';
  const years = months / 12;
  const grade =
    years >= GRADE_YEARS.xo ? 'XO' : years >= GRADE_YEARS.vsop ? 'VSOP' : 'VS';
  const span =
    months < 1 ? '<1mo' : months < 12 ? Math.round(months) + 'mo' : Math.floor(years) + 'y';
  return grade + ' · ' + span;
}

/** The scale in words, generated from the thresholds above so the two
    explainers (the hover note on a project page, the legend on /projects)
    can never describe a scale the code no longer uses — which is exactly what
    happened the first time these moved. */
export function gradeLegend(): string {
  const { vsop, xo } = GRADE_YEARS;
  const y = (n: number) => (n === 1 ? '1 year' : n + ' years');
  return `VS under ${y(vsop)} \u00b7 VSOP ${vsop}\u2013${xo} \u00b7 XO ${xo}+`;
}
