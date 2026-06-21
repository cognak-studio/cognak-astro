// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Project slugs that are noindex on live (header.php noindex list) — kept out of the sitemap.
const NOINDEX = new Set([
  'accorin', 'aerodesigns', 'alchemy-peppers', 'assetaware', 'buckaroos-cycling-club',
  'chain', 'ciao-bella-gelato', 'fablevision-studios', 'formulate', 'gulf-electricity',
  'harvard-business-review', 'incredible-foods', 'kenston-capital-partners', 'kidsluv',
  'maya-brenner', 'national-alliance-end-homelessness', 'norbella', 'olivio', 'ossio',
  'palisades-neuropsychology', 'quantum-designs', 'redd', 'scleraworx',
  'seafood-nutrition-partnership', 'snow-monkey', 'somernova', 'startup-institute',
  'stonyfield-organic', 'swissnex-boston', 'vice-cream', 'voltiv', 'whole-cluster',
  'xtract-group',
]);

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
        // Drop noindex project pages from the sitemap (match live SEO).
        const m = page.match(/\/projects\/([^/]+)\/?$/);
        if (m && NOINDEX.has(m[1])) return false;
        return true;
      },
    }),
  ],
});
