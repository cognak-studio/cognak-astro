# pdf.js (vendored)

`pdf.min.mjs` and `pdf.worker.min.mjs` from **pdfjs-dist 4.10.38**, Mozilla
Foundation, Apache-2.0 — https://github.com/mozilla/pdf.js

Used by `/send` only, and only when a PDF is queued: the page dynamically
imports these to rasterize page 1 of each uploaded PDF into a small JPEG,
which is uploaded to Blob alongside the file and recorded as `thumbUrl` in the
share manifest. `/receive` then shows that image — so a PDF preview is a plain
`<img>` on every device, instead of asking the client's browser to open the
PDF itself.

**Self-hosted rather than pulled from esm.sh** (which is how `/send` loads
@vercel/blob and @simplewebauthn) for one specific reason: pdf.js needs a
Worker, and `new Worker()` cannot take a cross-origin URL no matter what the
CSP says. Serving both files from our own origin means `worker-src 'self'`
already covers it and `vercel.json` needed no change at all. The usual
workaround — fetch the worker source and wrap it in a blob: URL — would have
worked too, but this is less machinery and one less CDN in the critical path
of Pierce's own tooling.

To upgrade: `npm i pdfjs-dist@<version>` somewhere scratch, copy
`build/pdf.min.mjs` and `build/pdf.worker.min.mjs` here, and update the
version above. The two files MUST come from the same release — a mismatched
worker fails with a version error and no rendered page. Nothing else in the
package is needed: no cmaps (only affects PDFs with non-embedded CJK fonts)
and no standard_fonts (fallback metrics for a handful of PDFs that omit
them) — if a client PDF ever renders with missing glyphs in the preview,
those directories are the first thing to add.
