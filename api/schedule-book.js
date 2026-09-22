/**
 * POST /api/schedule-book
 * Body: { name, email, notes?, durationMinutes, start (ISO), company?, reschedule? }
 *
 * `reschedule` is a manage token (see _lib/scheduleManage.mjs). When present
 * the existing event is MOVED rather than a new one created — same event,
 * same Meet link, Google sends the guest an updated invite. Name/email/notes
 * are ignored in that case; the booking keeps its original guest.
 *
 * `company` is a honeypot — a field real visitors never see or fill (hidden
 * off-screen in the form, see schedule.astro). A bot that fills every field
 * blind trips it; we quietly report success without touching the calendar,
 * same principle as /tools not tipping off scrapers.
 *
 * Re-derives the slot from LIVE freeBusy right before writing (via
 * isSlotStillOpen — see scheduleSlots.mjs) rather than trusting the client's
 * timestamp: closes both the "someone else booked it 30 seconds ago" race
 * and the "POST an arbitrary time outside business hours" abuse case.
 */
import { getBusyIntervals, createBookingEvent, getBookingEvent, moveBookingEvent } from './_lib/googleCalendar.mjs';
import {
  newEventId, makeManageToken, parseManageToken, manageLinks, describeBooking, subtractInterval,
} from './_lib/scheduleManage.mjs';
import { checkSlot, DURATIONS, HORIZON_DAYS, leadTimeLabel } from './_lib/scheduleSlots.mjs';
import { checkAndRecordAttempt } from './_lib/scheduleRateLimit.mjs';
import { notifyBooking } from './_lib/scheduleNotify.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 120;
const NOTES_MAX = 2000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { data = null; }
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  const { name, email, notes, durationMinutes, start, company, reschedule } = data;

  // Honeypot tripped — pretend it worked, book nothing. Logged with the
  // contact details so a real person caught by it (browser autofill filled
  // the old "Company" field — 2026-09-22) can be found in the Vercel logs
  // and followed up with.
  if (typeof company === 'string' && company.trim()) {
    console.warn('schedule-book honeypot tripped', JSON.stringify({
      name: typeof name === 'string' ? name.slice(0, 120) : null,
      email: typeof email === 'string' ? email.slice(0, 200) : null,
      start: typeof start === 'string' ? start.slice(0, 40) : null,
      company: company.slice(0, 120),
    }));
    return res.status(200).json({ ok: true });
  }

  const rl = await checkAndRecordAttempt(req);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again in a bit.', retryAfterSec: rl.retryAfterSec });
  }

  const rescheduling = typeof reschedule === 'string' && reschedule.length > 0;
  const rescheduleId = rescheduling ? parseManageToken(reschedule) : null;
  if (rescheduling && !rescheduleId) {
    return res.status(404).json({ error: 'That reschedule link isn\u2019t valid. Check the one in your calendar invite.' });
  }

  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, NOTES_MAX) : '';
  const duration = parseInt(durationMinutes, 10);

  if (!rescheduling && (!cleanName || cleanName.length > NAME_MAX)) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }
  if (!rescheduling && !EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!DURATIONS.includes(duration)) {
    return res.status(400).json({ error: 'Invalid call length.' });
  }
  const startDate = new Date(start);
  if (!start || isNaN(startDate.getTime())) {
    return res.status(400).json({ error: 'Invalid time slot.' });
  }
  const startISO = startDate.toISOString();
  const endISO = new Date(startDate.getTime() + duration * 60 * 1000).toISOString();

  try {
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + (HORIZON_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    let busy = await getBusyIntervals(timeMin, timeMax);

    let existing = null;
    let prior = null;
    if (rescheduling) {
      existing = await getBookingEvent(rescheduleId);
      const b = describeBooking(existing, now);
      prior = b;
      if (b.state === 'cancelled') {
        return res.status(410).json({ error: 'That call was cancelled, so there\u2019s nothing to move. Book a new time instead.', state: 'cancelled' });
      }
      if (b.state !== 'active') {
        return res.status(409).json({ error: 'That call can\u2019t be moved anymore. Email hello@cognak.com and we\u2019ll sort it out.', state: b.state });
      }
      // The call being moved mustn't block its own new time.
      busy = subtractInterval(busy, b.start, b.end);
    }

    // Why the reason matters: a page left open drifts out of date two ways —
    // someone else books the slot, OR the minimum lead time catches up
    // with it. Both used to say "that time was just booked", which is a lie in
    // the second case and reads as a broken form. (Pierce, 2026-09-03.)
    const check = checkSlot({ startISO, durationMinutes: duration, busy, now });
    if (!check.ok) {
      const messages = {
        busy: 'That time was just booked. Please pick another.',
        too_soon: 'That one\u2019s too close now \u2014 calls need '
          + leadTimeLabel() + '\u2019 notice. Here\u2019s what\u2019s still open.',
        outside: 'That time isn\u2019t bookable. Please pick one from the calendar.',
      };
      return res.status(409).json({
        error: messages[check.reason] || messages.busy,
        reason: check.reason,
      });
    }

    let event;
    let manageToken;
    if (existing) {
      event = await moveBookingEvent(existing, startISO, endISO);
      manageToken = reschedule;
    } else {
      const eventId = newEventId();
      manageToken = makeManageToken(eventId);
      event = await createBookingEvent({
        eventId,
        startISO,
        endISO,
        attendee: { name: cleanName, email: cleanEmail },
        notes: cleanNotes,
        links: manageLinks(manageToken),
      });
    }

    // Awaited (serverless may freeze after the response) but never throws.
    await notifyBooking(existing ? 'moved' : 'booked', {
      name: existing ? prior.name : cleanName,
      email: existing ? prior.email : cleanEmail,
      start: startISO,
      previousStart: existing ? prior.start : null,
      durationMinutes: duration,
      notes: existing ? '' : cleanNotes,
      calendarLink: event.htmlLink || null,
    });

    return res.status(200).json({
      ok: true,
      rescheduled: !!existing,
      start: startISO,
      end: endISO,
      meetLink: event.hangoutLink || null,
      calendarLink: event.htmlLink || null,
      manageToken,
    });
  } catch (e) {
    console.error('schedule-book failed', e);
    return res.status(502).json({ error: 'Could not book that call right now. Please try again shortly.' });
  }
}
