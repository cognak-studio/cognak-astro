/**
 * /api/admin-passkey-register — enrol a passkey. Admin session required.
 *
 * GET  -> registration options (and stashes the challenge in a signed cookie)
 * POST -> verifies the authenticator's response and stores the credential
 *
 * Enrolment is gated on an existing admin session on purpose: you prove you're
 * already in (password, or another passkey) before adding a new way in. That's
 * what stops a passer-by at an unlocked laptop from silently adding their own
 * finger as a permanent key — the 15-minute session expiry is the other half
 * of that.
 */
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { requireAdmin } from './_lib/adminAuth.mjs';
import {
  loadCredentials, saveCredentials, rpID, origin,
  challengeCookie, clearChallengeCookie, readChallenge,
} from './_lib/passkeys.mjs';

const PURPOSE = 'register';

export default async function handler(req, res) {
  if (requireAdmin(req, res)) return;
  if (!process.env.ADMIN_SECRET) {
    return res.status(500).json({ error: 'ADMIN_SECRET is not set.' });
  }

  const creds = await loadCredentials();

  if (req.method === 'GET') {
    const options = await generateRegistrationOptions({
      rpName: 'COGNAK Send',
      rpID: rpID(req),
      // Stable user handle: every passkey enrolled here belongs to the same
      // single admin identity, so authenticators replace rather than pile up.
      userID: new TextEncoder().encode('cognak-admin'),
      userName: 'cognak-admin',
      userDisplayName: 'COGNAK Admin',
      attestationType: 'none',
      // Stops the same device silently enrolling twice and leaving a confusing
      // duplicate in the list.
      excludeCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })),
      authenticatorSelection: {
        // platform = Touch ID / Windows Hello / the phone's own sensor, not a
        // roaming USB key. residentKey so sign-in needs no username first.
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
    });
    res.setHeader('Set-Cookie', challengeCookie(options.challenge, PURPOSE));
    return res.status(200).json(options);
  }

  if (req.method === 'POST') {
    const expectedChallenge = readChallenge(req, PURPOSE);
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'This enrolment expired. Try again.' });
    }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
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
    const label = String((body.label || '')).trim().slice(0, 60) || 'This device';

    const next = creds.filter((c) => c.id !== credential.id);
    next.push({
      id: credential.id,
      // Uint8Array doesn't survive JSON, so the key is stored base64url and
      // rehydrated on the way back out in admin-passkey-auth.js.
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

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
