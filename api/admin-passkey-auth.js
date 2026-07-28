/**
 * /api/admin-passkey-auth — sign in with a passkey. Public by necessity.
 *
 * GET  -> authentication options + challenge cookie
 * POST -> verifies the assertion and, on success, issues the admin session
 *
 * Rate limited on the same counters as the password endpoint. A passkey can't
 * meaningfully be brute-forced, but the endpoint is still public and still does
 * Blob reads, so it gets the same treatment rather than being left as the soft
 * way to hammer the backend.
 */
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { createSessionCookie } from './_lib/adminAuth.mjs';
import {
  loadCredentials, saveCredentials, rpID, origin,
  challengeCookie, clearChallengeCookie, readChallenge,
} from './_lib/passkeys.mjs';
import { checkLoginAllowed, recordFailure, clearFailures } from './_lib/rateLimit.mjs';

const PURPOSE = 'auth';

export default async function handler(req, res) {
  if (!process.env.ADMIN_SECRET) {
    return res.status(500).json({ error: 'Admin login is not configured yet.' });
  }

  const gate = await checkLoginAllowed(req);
  if (!gate.allowed) {
    res.setHeader('Retry-After', String(gate.retryAfterSec));
    return res.status(429).json({
      error: 'Too many attempts. Try again in ' + Math.ceil(gate.retryAfterSec / 60) + ' minutes.',
      retryAfterSec: gate.retryAfterSec,
    });
  }

  const creds = await loadCredentials();
  if (!creds.length) return res.status(400).json({ error: 'No passkeys are registered yet.' });

  if (req.method === 'GET') {
    const options = await generateAuthenticationOptions({
      rpID: rpID(req),
      // Empty allowCredentials + resident keys = the browser offers whichever
      // passkey it holds for this site. Also avoids advertising the full list
      // of credential IDs to anyone who curls this endpoint.
      allowCredentials: [],
      userVerification: 'required',
    });
    res.setHeader('Set-Cookie', challengeCookie(options.challenge, PURPOSE));
    return res.status(200).json(options);
  }

  if (req.method === 'POST') {
    const expectedChallenge = readChallenge(req, PURPOSE);
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'That sign-in expired. Try again.' });
    }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    if (!body || !body.response || !body.response.id) {
      return res.status(400).json({ error: 'Bad request' });
    }

    const cred = creds.find((c) => c.id === body.response.id);
    if (!cred) {
      await recordFailure(req);
      res.setHeader('Set-Cookie', clearChallengeCookie());
      return res.status(401).json({ error: 'That device is not registered.' });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge,
        expectedOrigin: origin(req),
        expectedRPID: rpID(req),
        credential: {
          id: cred.id,
          publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64url')),
          counter: cred.counter || 0,
          transports: cred.transports || [],
        },
        requireUserVerification: true,
      });
    } catch (err) {
      await recordFailure(req);
      res.setHeader('Set-Cookie', clearChallengeCookie());
      return res.status(401).json({ error: 'Could not verify that device.' });
    }

    if (!verification.verified) {
      await recordFailure(req);
      res.setHeader('Set-Cookie', clearChallengeCookie());
      return res.status(401).json({ error: 'Could not verify that device.' });
    }

    // Signature counter is the cloned-authenticator check. Apple/Google
    // passkeys sync across devices and legitimately report 0 forever, so a
    // non-increasing counter is only suspicious when the device actually uses
    // one (counter > 0).
    const newCounter = verification.authenticationInfo.newCounter;
    if (cred.counter > 0 && newCounter <= cred.counter) {
      await recordFailure(req);
      res.setHeader('Set-Cookie', clearChallengeCookie());
      console.error('Passkey counter did not advance — possible cloned authenticator:', cred.id);
      return res.status(401).json({ error: 'Could not verify that device.' });
    }

    cred.counter = newCounter;
    cred.lastUsedAt = new Date().toISOString();
    await saveCredentials(creds);
    await clearFailures(req);

    res.setHeader('Set-Cookie', [clearChallengeCookie(), createSessionCookie()]);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
