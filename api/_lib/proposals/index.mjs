/**
 * Proposal registry for /proposals. One entry per proposal; the body lives in
 * its own module next to this file (server-only: api/_lib is never routed and
 * nothing here ships to the browser until the passcode checks out).
 *
 * hash/salt = scrypt of the proposal's passcode (see proposalsAuth.mjs).
 * The passcode itself is kept in the client's NOTES.md, not in the repo.
 */
import * as goldenCannoli from './golden-cannoli.mjs';

export const PROPOSALS = [
  {
    slug: 'golden-cannoli',
    client: 'Golden Cannoli',
    tag: 'Proposal',
    title: 'Golden Cannoli',
    desc: 'Website and brand proposal: two paths, scope, timeline and investment.',
    date: '2026-09-29',
    /* Bump this whenever the proposal's words change, in Los Angeles time; the page shows it as "Last updated". */
    updated: '2026-09-29',
    salt: '80c9faf0a8763d90c762d8d8cc739a64',
    hash: '80e2d39bbad1352cfa299d925f7de1fd576b87197202b3e86318cb42b1337b99',
    body: goldenCannoli,
  },
];

export const bySlug = (slug) => PROPOSALS.find((p) => p.slug === slug) || null;
