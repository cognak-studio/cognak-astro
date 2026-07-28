/**
 * /api/admin-passkey — every passkey operation, behind one function.
 *
 * Split across three files this was three Vercel Functions, and Hobby caps a
 * no-framework deployment at 12. The project was already at 10; the passkey
 * work took it to 13 and the deploy failed with no obvious symptom other than
 * "Error". Folded into one router it's 11, with headroom for one more.
 *
 * Routed by ?action= :
 *   GET  register-options   (admin)  enrolment options
 *   POST register-verify    (admin)  store a new credential
 *   GET  auth-options       (public) sign-in options
 *   POST auth-verify        (public) verify + issue the admin session
 *   GET  list               (admin)  registered devices
 *   POST delete             (admin)  remove one
 */
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { requireAdmin, createSessionCookie } from './_lib/adminAuth.mjs';
import {
  loadCredentials, saveCredentials, rpID, origin,
  challengeCookie, clearChallengeCookie, readChallenge,
} from './_lib/passkeys.mjs';
import { checkLoginAllowed, recordFailure, clearFailures } from './_lib/rateLimit.mjs';

function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  return body;
}

export default async function handler(req, res) {
  if (!process.env.ADMIN_SECRET) {
    return res.status(500).json({ error: 'Admin login is not configured yet.' });
  }

  const action = String((req.query && req.query.action) || '');
  const creds = await loadCredentials();

  /* ---------------------------------------------------------- sign in --- */

  if (action === 'auth-options' || action === 'auth-verify') {
    const gate = await checkLoginAllowed(req);
    if (!gate.allowed) {
      res.setHeader('Retry-After', String(gate.retryAfterSec));
      return res.status(429).json({
        error: 'Too many attempts. Try again in ' + Math.ceil(gate.retryAfterSec / 60) + ' minutes.',
      });
    }
    if (!creds.length) return res.status(400).json({ error: 'No passkeys are registered yet.' });

    if (action === 'auth-options') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const options = await generateAuthenticationOptions({
        rpID: rpID(req),
        // Empty + resident keys: the browser offers whichever passkey it holds,
        // and this doesn't advertise the credential list to anyone who curls it.
        allowCredentials: [],
        userVerification: 'required',
      });
      res.setHeader('Set-Cookie', challengeCookie(options.challenge, 'auth'));
      return res.status(200).json(options);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const expectedChallenge = readChallenge(req, 'auth');
    if (!expectedChallenge) return res.status(400).json({ error: 'That sign-in expired. Try again.' });

    const body = readBody(req);
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
      verification = { verified: false };
    }

    if (!verification.verified) {
      await recordFailure(req);
      res.setHeader('Set-Cookie', clearChallengeCookie());
      return res.status(401).json({ error: 'Could not verify that device.' });
    }

    // Cloned-authenticator check. Synced passkeys legitimately report 0
    // forever, so this only applies once a device has shown it uses a counter.
    const newCounter = verification.authenticationInfo.newCounter;
    if (cred.counter > 0 && newCounter <= cred.counter) {
      await recordFailure(req);
      res.setHeader('Set-Cookie', clearChallengeCookie());
      console.error('Passkey counter did not advance — possible clone:', cred.id);
      return res.status(401).json({ error: 'Could not verify that device.' });
    }

    cred.counter = newCounter;
    cred.lastUsedAt = new Date().toISOString();
    await saveCredentials(creds);
    await clearFailures(req);
    res.setHeader('Set-Cookie', [clearChallengeCookie(), createSessionCookie()]);
    return res.status(200).json({ ok: true });
  }

  /* ------------------------------------------------- everything else --- */
  /* Enrolment and management require an existing session: you prove you're
     already in before adding another way in. */
  if (requireAdmin(req, res)) return;

  if (action === 'list' && req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      passkeys: creds.map((c) => ({
        id: c.id, label: c.label, createdAt: c.createdAt,
        lastUsedAt: c.lastUsedAt, backedUp: Boolean(c.backedUp),
      })),
      fallbackEnabled: process.env.ADMIN_PASSWORD_FALLBACK === '1',
    });
  }

  if (action === 'delete' && req.method === 'POST') {
    const body = readBody(req);
    const id = String((body && body.id) || '');
    if (!id) return res.status(400).json({ error: 'Bad request' });
    const next = creds.filter((c) => c.id !== id);
    if (next.length === creds.length) return res.status(404).json({ error: 'Not found.' });
    await saveCredentials(next);
    return res.status(200).json({ ok: true, count: next.length });
  }

  if (action === 'register-options' && req.method === 'GET') {
    const options = await generateRegistrationOptions({
      rpName: 'COGNAK Send',
      rpID: rpID(req),
      // One admin identity, so authenticators replace rather than pile up.
      userID: new TextEncoder().encode('cognak-admin'),
      userName: 'cognak-admin',
      userDisplayName: 'COGNAK Admin',
      attestationType: 'none',
      excludeCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })),
      authenticatorSelection: {
        // platform = Touch ID / Windows Hello / the phone's sensor.
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
    });
    res.setHeader('Set-Cookie', challengeCookie(options.challenge, 'register'));
    return res.status(200).json(options);
  }

  if (action === 'register-verify' && req.method === 'POST') {
    const expectedChallenge = readChallenge(req, 'register');
    if (!expectedChallenge) return res.status(400).json({ error: 'This enrolment expired. Try again.' });

    const body = readBody(req);
    if (!body || !body.response) return res.status(400).json({ error: 'Bad request' });

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge,
        expectedOrigin: origin(req),
        expectedRPID: rpID(req),
        requireUserVerification: true,
      });
    } catch (err) {
      res.setHeader('Set-Cookie', clearChallengeCookie());
      return res.status(400).json({ error: err && err.message ? err.message : 'Could not verify this device.' });
    }
    if (!verification.verified || !verification.registrationInfo) {
      res.setHeader('Set-Cookie', clearChallengeCookie());
      return res.status(400).json({ error: 'Could not verify this device.' });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const label = String(body.label || '').trim().slice(0, 60) || 'This device';
    const next = creds.filter((c) => c.id !== credential.id);
    next.push({
      id: credential.id,
      // Uint8Array doesn't survive JSON — stored base64url, rehydrated above.
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter || 0,
      transports: credential.transports || [],
      label,
      deviceType: credentialDeviceType || 'singleDevice',
      backedUp: Boolean(credentialBackedUp),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    });
    await saveCredentials(next);
    res.setHeader('Set-Cookie', clearChallengeCookie());
    return res.status(200).json({ ok: true, count: next.length });
  }

  return res.status(400).json({ error: 'Unknown action.' });
}
