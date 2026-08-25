/**
 * Pure business-logic for /schedule's availability: no I/O, no fetch — just
 * "given these busy intervals and these rules, which start times are
 * bookable?" Kept separate from googleCalendar.mjs so it's trivially testable
 * (`node -e` or a future test file) without live credentials, and so
 * schedule-book.js can re-run the SAME rules server-side to validate a
 * submitted slot instead of trusting whatever the client posts.
 *
 * Rules (Pierce, 2026-08-25): Mon–Thu only, no Friday calls, 10am–5pm
 * Pacific, 15 min buffer around existing events, 30 or 60 min calls.
 */

export const TIME_ZONE = 'America/Los_Angeles';
export const ALLOWED_WEEKDAYS = [1, 2, 3, 4]; // Mon–Thu (JS getUTCDay: Sun=0)
export const BUSINESS_START_HOUR = 10;
export const BUSINESS_END_HOUR = 17;
export const BUFFER_MINUTES = 15;
export const MIN_LEAD_HOURS = 4;
export const SLOT_STEP_MINUTES = 30;
export const HORIZON_DAYS = 28; // how many calendar days out to compute
export const DURATIONS = [30, 60];

/** { year, month, day, hour, minute } as they read on a wall clock in `timeZone`. */
function getZonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = parseInt(p.value, 10);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

/** Converts a wall-clock time IN `timeZone` to the UTC instant it represents. */
function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  // Two passes converge even across a DST boundary; a business-hours-only
  // (10am-5pm) slot generator never lands on the 2am transition itself, so
  // this doesn't need to handle the ambiguous/nonexistent-time edge case.
  for (let i = 0; i < 2; i++) {
    const p = getZonedParts(new Date(guess), timeZone);
    const guessReadAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
    guess += Date.UTC(year, month - 1, day, hour, minute, 0) - guessReadAsUtc;
  }
  return new Date(guess);
}

function pad2(n) { return String(n).padStart(2, '0'); }
function dateKey(year, month, day) { return year + '-' + pad2(month) + '-' + pad2(day); }

/** Adds `days` calendar days to a {year,month,day} triple (handles month/year rollover). */
function addCalendarDays({ year, month, day }, days) {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * busy: array of { start, end } ISO strings (as returned by freeBusy.query).
 * Returns: [{ date: 'YYYY-MM-DD', weekday: 'Mon'..'Thu', slots: [isoUTC, ...] }]
 * for days that have at least one open slot. `now` is injectable for testing.
 */
export function computeAvailableSlots({ busy, durationMinutes, now = new Date() }) {
  if (!DURATIONS.includes(durationMinutes)) {
    throw new Error('Unsupported duration: ' + durationMinutes);
  }

  // Expand each busy interval by the buffer so a slot can't start 5 min
  // after a call ends or end 5 min before the next one starts.
  const bufferMs = BUFFER_MINUTES * 60 * 1000;
  const expandedBusy = (busy || []).map((b) => ({
    start: new Date(b.start).getTime() - bufferMs,
    end: new Date(b.end).getTime() + bufferMs,
  }));

  const earliestStart = now.getTime() + MIN_LEAD_HOURS * 60 * 60 * 1000;
  const today = getZonedParts(now, TIME_ZONE);
  const days = [];

  for (let offset = 0; offset < HORIZON_DAYS; offset++) {
    const { year, month, day } = addCalendarDays(today, offset);
    const weekdayNum = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (!ALLOWED_WEEKDAYS.includes(weekdayNum)) continue;

    const slots = [];
    const lastStartHour = BUSINESS_END_HOUR - durationMinutes / 60;
    for (let mins = BUSINESS_START_HOUR * 60; mins <= lastStartHour * 60; mins += SLOT_STEP_MINUTES) {
      const hour = Math.floor(mins / 60);
      const minute = mins % 60;
      const startUtc = zonedTimeToUtc(year, month, day, hour, minute, TIME_ZONE);
      const startMs = startUtc.getTime();
      const endMs = startMs + durationMinutes * 60 * 1000;

      if (startMs < earliestStart) continue;
      const overlaps = expandedBusy.some((b) => startMs < b.end && endMs > b.start);
      if (overlaps) continue;

      slots.push(startUtc.toISOString());
    }

    if (slots.length) {
      const weekdayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekdayNum];
      days.push({ date: dateKey(year, month, day), weekday: weekdayLabel, slots });
    }
  }

  return days;
}

/**
 * Re-derives whether `startISO` is a legitimate, currently-open slot for
 * `durationMinutes` given the same busy list — schedule-book.js calls this
 * right before writing so a booking can only ever land on a slot the rules
 * actually produced (never an arbitrary client-supplied timestamp).
 */
export function isSlotStillOpen({ startISO, durationMinutes, busy, now = new Date() }) {
  const days = computeAvailableSlots({ busy, durationMinutes, now });
  return days.some((d) => d.slots.includes(startISO));
}
