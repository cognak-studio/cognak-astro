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
/**
 * Formats an ISO datetime as e.g. "Tue, Aug 25, 2:00 PM Pacific" so the
 * event description states the timezone explicitly. Added after a booking
 * showed as 7:30pm in the guest's own Google Calendar (displayed in their
 * account's timezone, Eastern) even though 4:30pm Pacific -- the correct
 * slot -- was what actually got booked; start/end already carry the right
 * IANA zone, but a plain-language restatement in the description heads
 * off that exact confusion. (Pierce, 2026-08-27.)
 */
export function formatPacific(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso)) + ' Pacific';
}

function buildDescription(startISO, notes, links) {
  let d = 'Scheduled for ' + formatPacific(startISO) + '.';
  if (links) {
    d += '\n\nView your booking: ' + links.view
      + '\nNeed to move it? ' + links.reschedule
      + '\nCan\u2019t make it? ' + links.cancel;
  }
  d += '\n\nBooked via cognak.com/schedule.';
  if (notes && notes.trim()) d += '\n\n' + notes.trim();
  return d;
}

/**
 * `eventId` is chosen by us (see scheduleManage.mjs newEventId) rather than
 * left to Google, so the reschedule/cancel links can be written into the
 * description in the same request that sends the invite — the invite email
 * carries them from the first send.
 */
export async function createBookingEvent({ eventId, startISO, endISO, attendee, notes, links }) {
  const token = await getAccessToken();
  const id = calendarId();

  const event = {
    id: eventId,
    summary: 'Call with ' + attendee.name + ' — COGNAK',
    description: buildDescription(startISO, notes, links),
    start: { dateTime: startISO, timeZone: 'America/Los_Angeles' },
    end: { dateTime: endISO, timeZone: 'America/Los_Angeles' },
    attendees: [{ email: attendee.email, displayName: attendee.name, responseStatus: 'accepted' }],
    extendedProperties: { private: { cognakBooking: '1' } },
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

function eventUrl(eventId, query) {
  return API + '/calendars/' + encodeURIComponent(calendarId()) + '/events/'
    + encodeURIComponent(eventId) + (query ? '?' + query : '');
}

/**
 * Fetches a booking. Returns null when it doesn't exist; a deleted event
 * comes back with status 'cancelled' (Google keeps it around), which the
 * caller treats the same way.
 */
export async function getBookingEvent(eventId) {
  const token = await getAccessToken();
  const r = await fetch(eventUrl(eventId), { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 404 || r.status === 410) return null;
  const json = await r.json().catch(() => null);
  if (!r.ok || !json) throw new Error('Google event fetch failed (HTTP ' + r.status + ')');
  return json;
}

/** Deletes the event; Google emails the guest a cancellation. */
export async function cancelBookingEvent(eventId) {
  const token = await getAccessToken();
  const r = await fetch(eventUrl(eventId, 'sendUpdates=all'), {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token },
  });
  // 410 = already deleted — the outcome they wanted, so not an error.
  if (!r.ok && r.status !== 410 && r.status !== 404) {
    throw new Error('Google event delete failed (HTTP ' + r.status + ')');
  }
}

/**
 * Moves the event in place: same id, same Meet link, same manage links.
 * Google emails the guest an "updated invitation". The description's
 * "Scheduled for" line is rewritten so it doesn't state the old time.
 */
export async function moveBookingEvent(event, startISO, endISO) {
  const token = await getAccessToken();
  const description = String(event.description || '')
    .replace(/^Scheduled for [^\n]*?Pacific\./, 'Scheduled for ' + formatPacific(startISO) + '.');
  const r = await fetch(eventUrl(event.id, 'sendUpdates=all&conferenceDataVersion=1'), {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start: { dateTime: startISO, timeZone: 'America/Los_Angeles' },
      end: { dateTime: endISO, timeZone: 'America/Los_Angeles' },
      description,
    }),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json) {
    const detail = json && json.error && json.error.message;
    throw new Error('Google event move failed' + (detail ? ': ' + detail : ' (HTTP ' + r.status + ')'));
  }
  return json;
}
