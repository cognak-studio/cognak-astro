/**
 * QR generator — produces the same millimetre "doc" shape as ./upca.js so the
 * emitters in ./emit.js can render either one.
 *
 * Encoding is delegated to the `qrcode` package (ISO/IEC 18004, MIT licence);
 * we only take the module matrix and lay it out as vector geometry.
 */
import QRCode from 'qrcode';

const r4 = (n) => Math.round(n * 1e4) / 1e4;

/** Error correction levels, in the order a human would think about them. */
export const EC_LEVELS = [
  { value: 'L', label: 'Low — 7% recoverable' },
  { value: 'M', label: 'Medium — 15% recoverable' },
  { value: 'Q', label: 'Quartile — 25% recoverable' },
  { value: 'H', label: 'High — 30% recoverable' },
];

/**
 * @param {string} text  payload — a URL for link QRs, but any string works
 * @param {object} [opts]
 * @param {number} [opts.sizeMm=30]  finished width including the quiet zone
 * @param {'L'|'M'|'Q'|'H'} [opts.ecLevel='M']
 * @param {number} [opts.quiet=4]  quiet zone in modules; 4 is the ISO minimum
 * @param {boolean} [opts.background=true]
 */
export function buildQr(text, opts = {}) {
  const sizeMm = opts.sizeMm ?? 30;
  const ecLevel = opts.ecLevel ?? 'M';
  const quiet = opts.quiet ?? 4;
  const background = opts.background !== false;

  const qr = QRCode.create(String(text), { errorCorrectionLevel: ecLevel });
  const n = qr.modules.size;
  const data = qr.modules.data;
  const total = n + quiet * 2;
  const m = sizeMm / total; // module size in mm

  // Merge horizontal runs of dark modules into single rects — smaller files
  // and a cleaner path list when the SVG lands in Illustrator.
  const rects = [];
  for (let row = 0; row < n; row++) {
    let col = 0;
    while (col < n) {
      if (!data[row * n + col]) { col++; continue; }
      let end = col;
      while (end < n && data[row * n + end]) end++;
      rects.push({
        x: r4((quiet + col) * m),
        y: r4((quiet + row) * m),
        w: r4((end - col) * m),
        h: r4(m),
      });
      col = end;
    }
  }

  return {
    kind: 'qr',
    w: r4(sizeMm),
    h: r4(sizeMm),
    rects,
    texts: [],
    background: background ? '#FFFFFF' : null,
    fill: '#000000',
    title: `QR ${qr.version} (${ecLevel}) ${text}`,
    meta: { version: qr.version, modules: n, moduleMm: r4(m), ecLevel },
  };
}
