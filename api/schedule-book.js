/**
 * POST /api/schedule-book
 * Body: { name, email, notes?, durationMinutes, start (ISO), company? }
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
import { getBusyIntervals, createBookingEvent } from './_lib/googleCalendar.mjs';
import { isSlotStillOpen, DURATIONS, HORIZON_DAYS } from './_lib/scheduleSlots.mjs';
import { checkAndRecordAttempt } from './_lib/scheduleRateLimit.mjs';

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

  const { name, email, notes, durationMinutes, start, company } = data;

  // Honeypot tripped — pretend it worked, book nothing.
  if (typeof company === 'string' && company.trim()) {
    return res.status(200).json({ ok: true });
  }

  const rl = await checkAndRecordAttempt(req);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again in a bit.', retryAfterSec: rl.retryAfterSec });
  }

  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, NOTES_MAX) : '';
  const duration = parseInt(durationMinutes, 10);

  if (!cleanName || cleanName.length > NAME_MAX) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }
  if (!EMAIL_RE.test(cleanEmail)) {
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
    const busy = await getBusyIntervals(timeMin, timeMax);

    if (!isSlotStillOpen({ startISO, durationMinutes: duration, busy, now })) {
      return res.status(409).json({ error: 'That time was just booked. Please pick another.' });
    }

    const event = await createBookingEvent({
      startISO,
      endISO,
      attendee: { name: cleanName, email: cleanEmail },
      notes: cleanNotes,
    });

    return res.status(200).json({
      ok: true,
      start: startISO,
      end: endISO,
      meetLink: event.hangoutLink || null,
      calendarLink: event.htmlLink || null,
    });
  } catch (e) {
    console.error('schedule-book failed', e);
    return res.status(502).json({ error: 'Could not book that call right now. Please try again shortly.' });
  }
}
