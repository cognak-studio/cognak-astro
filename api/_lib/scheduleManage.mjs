/**
 * Reschedule/cancel links for /schedule bookings (Pierce, 2026-09-22 — a
 * client needed to cancel and didn't know how; declining the invite left
 * the event on the calendar and the slot blocked).
 *
 * Every booking gets a token `<eventId>.<sig>`: the Google event id we chose
 * at creation, plus an HMAC of it. Holding the token = holding the invite, so
 * it's exactly as private as the invite email it's printed in. Nothing is
 * stored — the signature is the whole check. The key is derived from
 * ADMIN_SECRET (or SCHEDULE_SECRET if set) with a purpose prefix, so these
 * tokens can never be confused with admin session cookies. Rotating the
 * secret invalidates every outstanding link.
 */
import crypto from 'node:crypto';

export const SITE = 'https://cognak.com';

function secret() {
  return process.env.SCHEDULE_SECRET || process.env.ADMIN_SECRET || '';
}

function sign(eventId) {
  return crypto
    .createHmac('sha256', secret())
    .update('schedule-manage:' + eventId)
    .digest('base64url')
    .slice(0, 22);
}

// Google event ids: base32hex (a–v, 0–9), 5–1024 chars. 26 chars ≈ 130 bits.
const B32HEX = '0123456789abcdefghijklmnopqrstuv';
export function newEventId() {
  const bytes = crypto.randomBytes(26);
  let out = '';
  for (const b of bytes) out += B32HEX[b & 31];
  return out;
}

export function makeManageToken(eventId) {
  if (!secret()) throw new Error('No SCHEDULE_SECRET/ADMIN_SECRET set; cannot sign manage links.');
  return eventId + '.' + sign(eventId);
}

/** -> eventId, or null if the token is malformed or the signature is wrong. */
export function parseManageToken(token) {
  if (typeof token !== 'string' || !secret()) return null;
  const m = /^([0-9a-v]{5,1024})\.([A-Za-z0-9_-]{22})$/.exec(token.trim());
  if (!m) return null;
  const expected = Buffer.from(sign(m[1]));
  const actual = Buffer.from(m[2]);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  return m[1];
}

export function manageLinks(token) {
  const t = encodeURIComponent(token);
  return {
    view: SITE + '/schedule?booking=' + t,
    reschedule: SITE + '/schedule?reschedule=' + t,
    cancel: SITE + '/schedule?cancel=' + t,
  };
}

/**
 * Removes [start, end) from a list of busy intervals. Used when moving a
 * booking: the call being moved shouldn't block its own new time (e.g.
 * sliding a 1:30 to 2:00). freeBusy merges overlapping events, so if
 * something else overlapped the old slot that overlap is freed too — an
 * edge the booking rules' buffers already make near-impossible.
 */
export function subtractInterval(busy, startISO, endISO) {
  const s = new Date(startISO).getTime();
  const e = new Date(endISO).getTime();
  const out = [];
  for (const b of busy) {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    if (be <= s || bs >= e) { out.push(b); continue; }
    if (bs < s) out.push({ start: b.start, end: new Date(s).toISOString() });
    if (be > e) out.push({ start: new Date(e).toISOString(), end: b.end });
  }
  return out;
}

/**
 * Reads a fetched event into what the manage page needs.
 * state: 'active' (can move or cancel) | 'cancelled' | 'past' | 'unknown'
 * ('unknown' = an event that isn't a /schedule booking — a valid token can
 * only come from us, so this is belt-and-braces).
 */
export function describeBooking(event, now = new Date()) {
  if (!event || event.status === 'cancelled') return { state: 'cancelled' };
  const isOurs = (event.extendedProperties && event.extendedProperties.private
    && event.extendedProperties.private.cognakBooking === '1')
    || String(event.description || '').includes('cognak.com/schedule');
  if (!isOurs) return { state: 'unknown' };
  const start = event.start && event.start.dateTime;
  const end = event.end && event.end.dateTime;
  if (!start || !end) return { state: 'unknown' };
  const guest = (event.attendees || []).find((a) => !a.organizer && !a.self) || {};
  const durationMinutes = Math.round((new Date(end) - new Date(start)) / 60000);
  const base = {
    meetLink: event.hangoutLink || null,
    calendarLink: event.htmlLink || null,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    durationMinutes,
    name: guest.displayName || '',
    email: guest.email || '',
  };
  if (new Date(start).getTime() <= now.getTime()) return { state: 'past', ...base };
  return { state: 'active', ...base };
}
