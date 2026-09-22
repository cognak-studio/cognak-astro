/**
 * Emails Pierce when someone books, moves or cancels on /schedule
 * (2026-09-22). Needed because bookings are written to the calendar AS
 * Pierce (domain-wide delegation), and Google never notifies you about
 * events you created yourself — Chet Baker booked two calls and neither
 * produced a message; only his "Accepted" reply did.
 *
 * Sent through the Gmail API as the impersonated user, to
 * SCHEDULE_NOTIFY_TO (defaults to that same user). Needs the gmail.send
 * scope added to the service account's delegation grant in Google Admin
 * (Security → Access and data control → API controls → Domain-wide
 * delegation). Until then, sending fails, gets logged, and the booking
 * itself carries on unaffected.
 *
 * Reply-To is the guest, so replying to the notification writes to them.
 */
import { getAccessToken, GMAIL_SEND_SCOPE } from './googleAuth.mjs';
import { formatPacific } from './googleCalendar.mjs';

function encodeHeader(v) {
  // RFC 2047 so em dashes, curly quotes and accented names survive.
  return /^[\x20-\x7e]*$/.test(v) ? v : '=?UTF-8?B?' + Buffer.from(v, 'utf8').toString('base64') + '?=';
}

function clean(v, max) {
  return String(v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

/**
 * kind: 'booked' | 'moved' | 'cancelled'
 * { name, email, start, durationMinutes, notes?, previousStart?, calendarLink? }
 * Never throws.
 */
export async function notifyBooking(kind, b) {
  try {
    const to = process.env.SCHEDULE_NOTIFY_TO || process.env.GOOGLE_IMPERSONATE_SUBJECT;
    const from = process.env.GOOGLE_IMPERSONATE_SUBJECT;
    if (!to || !from) return;

    const name = clean(b.name, 120) || 'Someone';
    const email = clean(b.email, 200);
    const when = b.start ? formatPacific(b.start) : '';
    const len = b.durationMinutes ? ' (' + b.durationMinutes + ' min)' : '';
    const verb = kind === 'moved' ? 'Moved' : kind === 'cancelled' ? 'Cancelled' : 'Booked';

    const subject = verb + ': ' + name + ' · ' + when + len;
    const lines = [];
    lines.push(name + (email ? ' <' + email + '>' : ''));
    if (kind === 'moved' && b.previousStart) {
      lines.push('Now:  ' + when + len);
      lines.push('Was:  ' + formatPacific(b.previousStart));
    } else {
      lines.push(when + len + (kind === 'cancelled' ? ' — cancelled by the guest' : ''));
    }
    if (b.notes && String(b.notes).trim()) lines.push('', String(b.notes).trim().slice(0, 2000));
    if (b.calendarLink && kind !== 'cancelled') lines.push('', 'Calendar: ' + b.calendarLink);
    lines.push('', 'Sent by cognak.com/schedule.');

    const headers = [
      'From: COGNAK Schedule <' + from + '>',
      'To: ' + to,
      email ? 'Reply-To: ' + encodeHeader(name) + ' <' + email + '>' : null,
      'Subject: ' + encodeHeader(subject),
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
    ].filter(Boolean);
    const raw = headers.join('\r\n') + '\r\n\r\n'
      + Buffer.from(lines.join('\n'), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');

    const token = await getAccessToken(GMAIL_SEND_SCOPE);
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      console.error('schedule notify: Gmail send failed', r.status, j && j.error && j.error.message);
    }
  } catch (e) {
    console.error('schedule notify failed (booking unaffected):', e && e.message);
  }
}
