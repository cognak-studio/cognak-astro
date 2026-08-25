/**
 * Thin REST wrapper around the two Calendar v3 endpoints /schedule needs.
 * Both availability (schedule-availability.js) and booking (schedule-book.js,
 * which re-checks freebusy right before writing) go through here so there's
 * one place that knows the API shapes.
 */
import { getAccessToken } from './googleAuth.mjs';

const API = 'https://www.googleapis.com/calendar/v3';

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_IMPERSONATE_SUBJECT || 'primary';
}

/**
 * Every calendar to check busy time against: the booking calendar itself,
 * plus any extra calendars listed in GOOGLE_EXTRA_BUSY_CALENDAR_IDS (comma-
 * separated, e.g. a personal Gmail calendar shared with the booking
 * account on a "see only free/busy" basis). Bookings are still only ever
 * WRITTEN to calendarId() — the extras are read-only busy checks.
 */
function busyCalendarIds() {
  const extra = (process.env.GOOGLE_EXTRA_BUSY_CALENDAR_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [calendarId(), ...extra];
}

/**
 * Returns an array of { start, end } busy intervals (ISO strings, as Google
 * returns them), merged across every calendar in busyCalendarIds(), between
 * timeMinISO/timeMaxISO.
 */
export async function getBusyIntervals(timeMinISO, timeMaxISO) {
  const token = await getAccessToken();
  const ids = busyCalendarIds();
  const r = await fetch(API + '/freeBusy', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      items: ids.map((id) => ({ id })),
    }),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json) {
    throw new Error('Google freeBusy query failed (HTTP ' + r.status + ')');
  }
  const busy = [];
  for (const id of ids) {
    const cal = json.calendars && json.calendars[id];
    if (cal && cal.errors && cal.errors.length) {
      // Most common cause: the extra calendar hasn't been shared with the
      // impersonated account yet (or was shared with the wrong address).
      throw new Error(
        'Google freeBusy error on ' + id + ': ' + cal.errors.map((e) => e.reason).join(', ')
      );
    }
    if (cal && cal.busy) busy.push(...cal.busy);
  }
  return busy;
}

/**
 * Creates the event with a generated Meet link and sends the guest a Google
 * Calendar invite email (sendUpdates: 'all' — this IS the confirmation email,
 * no separate transactional-email system needed).
 *
 * `attendee` is { name, email }. Returns the created event resource.
 */
export async function createBookingEvent({ startISO, endISO, attendee, notes }) {
  const token = await getAccessToken();
  const id = calendarId();

  const event = {
    summary: 'Call with ' + attendee.name + ' — COGNAK',
    description: (notes && notes.trim())
      ? 'Booked via cognak.com/schedule.\n\n' + notes.trim()
      : 'Booked via cognak.com/schedule.',
    start: { dateTime: startISO, timeZone: 'America/Los_Angeles' },
    end: { dateTime: endISO, timeZone: 'America/Los_Angeles' },
    attendees: [{ email: attendee.email, displayName: attendee.name, responseStatus: 'accepted' }],
    conferenceData: {
      createRequest: {
        // Must be unique per request; Google dedupes on this if a request is
        // retried, so it's tied to the slot + email rather than random.
        requestId: 'cognak-' + Buffer.from(attendee.email + startISO).toString('base64url').slice(0, 40),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: { useDefault: true },
  };

  const url = API + '/calendars/' + encodeURIComponent(id) + '/events'
    + '?conferenceDataVersion=1&sendUpdates=all';

  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json) {
    const detail = json && json.error && json.error.message;
    throw new Error('Google event creation failed' + (detail ? ': ' + detail : ' (HTTP ' + r.status + ')'));
  }
  return json;
}
