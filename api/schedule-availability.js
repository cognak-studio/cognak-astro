/**
 * GET /api/schedule-availability?duration=30|60
 *
 * Returns real open slots on Pierce's actual Google Calendar — queries
 * freeBusy for the whole HORIZON_DAYS window in one call, then runs the
 * Mon-Thu/10-5/15-min-buffer rules in scheduleSlots.mjs over it. See that
 * file for the rules themselves; this handler is just HTTP plumbing.
 *
 * Response: { timeZone, durationMinutes, days: [{ date, weekday, slots }] }
 */
import { getBusyIntervals } from './_lib/googleCalendar.mjs';
import { computeAvailableSlots, DURATIONS, HORIZON_DAYS, TIME_ZONE } from './_lib/scheduleSlots.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const durationMinutes = parseInt(req.query?.duration, 10);
  if (!DURATIONS.includes(durationMinutes)) {
    return res.status(400).json({ error: 'duration must be one of: ' + DURATIONS.join(', ') });
  }

  try {
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + (HORIZON_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    const busy = await getBusyIntervals(timeMin, timeMax);
    const days = computeAvailableSlots({ busy, durationMinutes, now });

    // Slots are real availability, not static content — don't let any CDN or
    // browser cache them, or a booked slot could still show as open.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ timeZone: TIME_ZONE, durationMinutes, days });
  } catch (e) {
    console.error('schedule-availability failed', e);
    return res.status(502).json({ error: 'Could not load availability right now. Please try again shortly.' });
  }
}
