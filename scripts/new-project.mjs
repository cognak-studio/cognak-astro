#!/usr/bin/env node
/**
 * Scaffold a new project folder + starter index.md.
 *
 * Usage:
 *   npm run new -- acme-co
 *   npm run new -- "Acme Co"     (a slug is derived automatically)
 *
 * Creates src/content/projects/<slug>/index.md prefilled with the title/slug/date.
 * Then drop in thumb.jpg + hero.jpg and you're done.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROJECTS = path.join(ROOT, 'src/content/projects');

const input = process.argv.slice(2).join(' ').trim();
if (!input) {
  console.error('\n  Usage: npm run new -- "Project Name"   (or a slug like acme-co)\n');
  process.exit(1);
}

const slug = input
  .toLowerCase()
  .replace(/['’.]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

// Title-case the input if it looked like a slug, otherwise keep what they typed.
const title = /[A-Z ]/.test(input)
  ? input
  : input.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const dir = path.join(PROJECTS, slug);
if (fs.existsSync(dir)) {
  console.error(`\n  ✗ A project folder already exists: src/content/projects/${slug}\n`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const md = `---
title: ${title}
slug: ${slug}
category: Web, Branding
date: ${today}
projectType: Web Design
projectYear: ${today.slice(0, 4)}
thumbnail: ./thumb.jpg
hero: ./hero.jpg
homepageFeature: false
metaDescription: ${title} — by COGNAK.
aboutTheClient: <p>Who the client is.</p>
theWork: <p>What COGNAK did.</p>
moreDetails: <p>• Detail one</p><p>• Detail two</p>
---

<!-- Gallery images go here. Add files to this folder and reference them: -->
![](./01.jpg)
`;

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'index.md'), md);

// When launched from the double-click helper (OPEN_AFTER=1), reveal the new
// folder in Finder and open the index.md in the default editor automatically.
if (process.env.OPEN_AFTER === '1' && process.platform === 'darwin') {
  try { execFileSync('open', [dir]); } catch {}
  try { execFileSync('open', [path.join(dir, 'index.md')]); } catch {}
}

console.log(`
  ✓ Created src/content/projects/${slug}/index.md

  Next:
    1. Add images to that folder:  thumb.jpg (square)  +  hero.jpg (large)
       (plus any gallery images like 01.jpg, 02.jpg)
    2. Open the index.md in Sublime and fill in the text + category.
    3. Optional: npm run og        (generate the social share card)
    4. Preview:  npm run dev   →   http://localhost:4321/projects/${slug}
    5. Commit + push in GitHub Desktop. Done.
`);
