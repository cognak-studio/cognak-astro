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
