#!/usr/bin/env node
/**
 * Compress oversized gallery images in public/wp-content/uploads/.
 *
 * Project thumbnails/heroes (in src/content/projects/) are already optimized by
 * Astro at build time. This script handles the full-size gallery images that are
 * referenced by absolute /wp-content/uploads/... URLs and served as-is.
 *
 * What it does: caps very large images at 2000px wide and re-encodes JP/PNG at a
 * high-but-efficient quality. It only rewrites a file if the result is smaller,
 * and skips files that are already small. Safe to run repeatedly.
 *
 * Usage:  npm run optimize
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public/wp-content/uploads');
const MAX_W = 2000;
const SKIP_BELOW = 180 * 1024; // leave files under ~180KB alone

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

if (!fs.existsSync(DIR)) {
  console.error(`No uploads folder at ${DIR}`);
  process.exit(0);
}

const files = walk(DIR).filter((f) => /\.(jpe?g|png)$/i.test(f) && !/\.webp$/i.test(f));
let savedTotal = 0, changed = 0, skipped = 0;

for (const file of files) {
  try {
    const before = fs.statSync(file).size;
    const meta = await sharp(file).metadata();
    if (before < SKIP_BELOW && (meta.width || 0) <= MAX_W) { skipped++; continue; }

    let pipe = sharp(file).rotate();
    if ((meta.width || 0) > MAX_W) pipe = pipe.resize({ width: MAX_W });
    pipe = /\.png$/i.test(file)
      ? pipe.png({ compressionLevel: 9, palette: true })
      : pipe.jpeg({ quality: 82, mozjpeg: true });

    const buf = await pipe.toBuffer();
    if (buf.length < before) {
      fs.writeFileSync(file, buf); // overwrite (no unlink)
      savedTotal += before - buf.length;
      changed++;
      console.log(`  ↓ ${path.relative(ROOT, file)}  ${(before/1024|0)}KB → ${(buf.length/1024|0)}KB`);
    } else {
      skipped++;
    }
  } catch (e) {
    console.warn(`  ! skipped ${path.relative(ROOT, file)} (${e.message})`);
    skipped++;
  }
}

console.log(`\nDone. Optimized ${changed} file(s), skipped ${skipped}. Saved ${(savedTotal/1024/1024).toFixed(1)} MB.`);
console.log('Review the changes, then commit + push.');
