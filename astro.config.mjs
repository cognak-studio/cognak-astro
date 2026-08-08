// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Noindex project slugs, derived from each project's own frontmatter
// (noindex: true in src/content/projects/<slug>/index.md) so the sitemap
// filter and the per-page robots meta always agree — no hand-kept list.
const projectsDir = fileURLToPath(new URL('./src/content/projects', import.meta.url));
const NOINDEX = new Set();
for (const dir of fs.readdirSync(projectsDir)) {
  if (dir.startsWith('_') || dir.startsWith('.')) continue; // _template, .DS_Store
  const md = path.join(projectsDir, dir, 'index.md');
  if (!fs.existsSync(md)) continue;
  const fm = fs.readFileSync(md, 'utf8').split(/^---\s*$/m)[1] || '';
  if (/^\s*noindex:\s*true\s*(#.*)?$/m.test(fm)) {
    const slug = fm.match(/^\s*slug:\s*([^\s#]+)/m); // frontmatter slug overrides folder name
    NOINDEX.add(slug ? slug[1] : dir);
  }
}

// Static output — host-agnostic. The /dist folder deploys as-is to
// Vercel, Cloudflare Pages, Netlify, or any static host. No adapter needed
// while the site is fully static, so the host decision can wait until deploy.
export default defineConfig({
  site: 'https://cognak.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  // Content-Security-Policy hardening. Astro hashes every inline + bundled
  // script at build time and emits a per-page <meta http-equiv> CSP, so an
  // INJECTED inline script (no matching hash) is rejected by the browser even
  // though the vercel.json response header still carries 'unsafe-inline' for
  // header-scanner compatibility. The enforced policy is the intersection of
  // the two, and this meta side has no unsafe-inline — that's where the real
  // XSS protection comes from, and it re-hashes itself on every build (no hand-
  // maintained hash list). See vercel.json for the rest of the CSP directives.
  security: {
    csp: {
      // Every external script host must be re-listed here, or the meta policy
      // would block it. Keep in sync with script-src in vercel.json.
      scriptDirective: {
        resources: [
          "'self'",
          'blob:',
          'https://www.googletagmanager.com',
          'https://www.google-analytics.com',
          'https://cdn.jsdelivr.net',
          'https://assets.unicorn.studio',
          'https://www.googleadservices.com',
          'https://www.google.com',
          'https://googleads.g.doubleclick.net',
          'https://*.vercel-scripts.com',
          'https://esm.sh',
        ],
      },
      // Inline style="" attributes can't be hashed; allow them explicitly.
      // Astro still hashes every <style> block for the style-src directive.
      directives: ["style-src-attr 'unsafe-inline'"],
    },
  },
  integrations: [
    sitemap({
      filter: (page) => {
        // /send and /receive are unlisted internal utility pages — noindex,
        // no nav link anywhere. (/tools was here too until 2026-07-31; it's
        // now footer-linked and indexable, so it belongs in the sitemap.)
        if (/\/(send|receive)\/?$/.test(page)) return false;
        // /colophon is noindex in BaseLayout, so keep it out of the sitemap
        // too — a noindex URL listed in a sitemap is a mixed signal.
        if (/\/colophon\/?$/.test(page)) return false;
        // Drop noindex project pages from the sitemap (match live SEO).
        const m = page.match(/\/projects\/([^/]+)\/?$/);
        if (m && NOINDEX.has(m[1])) return false;
        return true;
      },
    }),
  ],
});
