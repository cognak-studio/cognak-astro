/**
 * Google service-account auth (domain-wide delegation), hand-rolled.
 *
 * Deliberately NOT using the `googleapis` package — every other Google/3rd-party
 * integration in this repo (see brief.js -> Linear) talks to the REST API
 * directly with fetch, and `googleapis` is a multi-MB dependency to pull in for
 * two REST calls. This file does the one thing that actually needs a library
 * elsewhere: mint a signed JWT and exchange it for an OAuth access token.
 *
 * Required env vars (Vercel -> Project -> Settings -> Environment Variables):
 *   GOOGLE_SA_CLIENT_EMAIL   the service account's email, e.g.
 *                            cognak-scheduler@some-project.iam.gserviceaccount.com
 *   GOOGLE_SA_PRIVATE_KEY    the service account's private key (PEM), from the
 *                            downloaded JSON key's "private_key" field. Vercel's
 *                            env var UI collapses real newlines, so paste it with
 *                            literal \n escapes and this file unescapes them.
 *   GOOGLE_IMPERSONATE_SUBJECT
 *                            the Workspace user to act as, e.g. pierce@cognak.com.
 *                            This is what makes it "domain-wide delegation" and
 *                            not just an ordinary service account — the SA has no
 *                            calendar of its own, it borrows Pierce's via the
 *                            Workspace admin console's delegation grant.
 *
 * See /schedule-setup.md (delivered alongside this feature) for the one-time
 * Google Cloud + Workspace admin console steps that make these three vars real.
 */
import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/calendar';

// Access tokens last ~1hr from Google; cached at module scope so a warm
// serverless instance reuses one instead of re-signing a JWT per request.
// Cleared 60s before actual expiry to avoid using a token that expires
// mid-request.
let cached = { token: null, expiresAt: 0 };

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function assertConfigured() {
  const missing = ['GOOGLE_SA_CLIENT_EMAIL', 'GOOGLE_SA_PRIVATE_KEY', 'GOOGLE_IMPERSONATE_SUBJECT']
    .filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error('Google Calendar is not configured yet (missing: ' + missing.join(', ') + ')');
  }
}

/** Returns a valid Bearer access token, minting + caching a fresh one as needed. */
export async function getAccessToken() {
  assertConfigured();

  const now = Math.floor(Date.now() / 1000);
  if (cached.token && cached.expiresAt - 60 > now) return cached.token;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: process.env.GOOGLE_SA_CLIENT_EMAIL,
    sub: process.env.GOOGLE_IMPERSONATE_SUBJECT, // impersonation -> domain-wide delegation
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims));
  // The env var stores literal \n (real newlines don't survive most env-var
  // UIs), so unescape before handing it to crypto.
  const privateKey = String(process.env.GOOGLE_SA_PRIVATE_KEY).replace(/\\n/g, '\n');
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  const jwt = signingInput + '.' + base64url(signature).replace(/\+/g, '-').replace(/\//g, '_');

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json || !json.access_token) {
    const detail = json && (json.error_description || json.error);
    throw new Error('Google token exchange failed' + (detail ? ': ' + detail : ' (HTTP ' + r.status + ')'));
  }

  cached = { token: json.access_token, expiresAt: now + (json.expires_in || 3600) };
  return cached.token;
}
