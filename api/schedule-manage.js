/**
 * GET  /api/schedule-manage?t=<token>          -> the booking's state + time
 * POST /api/schedule-manage { t, action: 'cancel' } -> deletes it
 *
 * The token comes from the reschedule/cancel links printed in the invite
 * (see _lib/scheduleManage.mjs). Moving a booking goes through
 * /api/schedule-book with `reschedule: <token>`, so it re-uses the same
 * slot rules and live freeBusy re-check as a new booking.
 */
import { getBookingEvent, cancelBookingEvent } from './_lib/googleCalendar.mjs';
import { parseManageToken, describeBooking } from './_lib/scheduleManage.mjs';
import { checkAndRecordAttempt } from './_lib/scheduleRateLimit.mjs';
import { notifyBooking } from './_lib/scheduleNotify.mjs';

const INVALID = 'That link isn’t valid. Check the one in your calendar invite, or email hello@cognak.com.';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const eventId = parseManageToken(req.query && req.query.t);
    if (!eventId) return res.status(404).json({ error: INVALID });
    try {
      const b = describeBooking(await getBookingEvent(eventId));
      if (b.state === 'unknown') return res.status(404).json({ error: INVALID });
      return res.status(200).json(b);
    } catch (e) {
      console.error('schedule-manage GET failed', e);
      return res.status(502).json({ error: 'Couldn’t load that booking right now. Please try again shortly.' });
    }
  }

  if (req.method === 'POST') {
    let data = req.body;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = null; } }
    if (!data || data.action !== 'cancel') return res.status(400).json({ error: 'Invalid request.' });
    const eventId = parseManageToken(data.t);
    if (!eventId) return res.status(404).json({ error: INVALID });

    const rl = await checkAndRecordAttempt(req);
    if (!rl.allowed) {
      return res.status(429).json({ error: 'Too many attempts. Please try again in a bit.', retryAfterSec: rl.retryAfterSec });
    }

    try {
      const b = describeBooking(await getBookingEvent(eventId));
      if (b.state === 'unknown') return res.status(404).json({ error: INVALID });
      if (b.state === 'cancelled') return res.status(200).json({ ok: true, state: 'cancelled' });
      if (b.state === 'past') {
        return res.status(409).json({ error: 'That call has already started, so it can’t be cancelled here.', state: 'past' });
      }
      await cancelBookingEvent(eventId);
      await notifyBooking('cancelled', b);
      return res.status(200).json({ ok: true, state: 'cancelled', start: b.start });
    } catch (e) {
      console.error('schedule-manage cancel failed', e);
      return res.status(502).json({ error: 'Couldn’t cancel just now. Please try again, or email hello@cognak.com.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
