/**
 * /tools background — "module lattice".
 *
 * A field of very small squares, the same units a QR symbol is built from,
 * sitting at almost no opacity. Every few seconds a decode ripples out from a
 * random point and flips a handful of modules as it passes; the rest only
 * surface within a short radius of the cursor, the same easing the projects
 * page uses for its matrix glow.
 *
 * Fixed to the viewport and painted behind #cognak-main. Skipped entirely
 * under prefers-reduced-motion; on touch there's no cursor term, so the
 * ripple carries it alone.
 */

const ACCENT = '180,124,255';

export const LATTICE_DEFAULTS = {
  step: 15,        // lattice pitch, px
  dot: 2,          // module size, px
  base: 0.024,     // resting opacity, before the per-cell jitter
  jitter: 0.03,    // random extra resting opacity per cell
  lit: 0.16,       // opacity added at full illumination
  cursorRadius: 200,
  ripplePeriod: 6200,  // ms between decodes
  rippleSpeed: 0.42,   // px per ms
  rippleWidth: 46,     // px
  rippleLife: 4200,    // ms until the ring has fully faded
};

export function initLattice(canvas, overrides = {}) {
  if (!canvas || !canvas.getContext) return () => {};
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  const C = { ...LATTICE_DEFAULTS, ...overrides };
  const ctx = canvas.getContext('2d');
  const hasCursor = window.matchMedia('(hover: hover)').matches;

  let w = 0, h = 0, dpr = 1, cells = [], raf = 0;
  const mouse = { x: -9999, y: -9999 };
  let wave = { x: 0, y: 0, r: 0, born: -1e9 };

  const rgba = (a) => `rgba(${ACCENT},${a})`;

  function build() {
    cells = [];
    for (let y = C.step; y < h + C.step; y += C.step) {
      for (let x = C.step; x < w + C.step; x += C.step) {
        cells.push({
          x, y,
          base: C.base + Math.random() * C.jitter,
          lit: 0,
          on: Math.random() > 0.45,
        });
      }
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    ctx.clearRect(0, 0, w, h);

    if (t - wave.born > C.ripplePeriod) {
      wave = { x: Math.random() * w, y: Math.random() * h, r: 0, born: t };
    }
    const age = t - wave.born;
    wave.r = age * C.rippleSpeed;
    const ringFade = Math.max(0, 1 - age / C.rippleLife);

    const half = C.dot / 2;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      let a = c.base;

      if (ringFade > 0) {
        const dr = Math.abs(Math.hypot(c.x - wave.x, c.y - wave.y) - wave.r);
        if (dr < C.rippleWidth) {
          const k = (1 - dr / C.rippleWidth) * ringFade;
          // Right at the wavefront a few modules flip, so the field slowly
          // rewrites itself instead of pulsing the same pattern forever.
          if (dr < 8 && Math.random() < 0.06) c.on = !c.on;
          if (k * 0.9 > c.lit) c.lit = k * 0.9;
        }
      }

      if (hasCursor && mouse.x > -9000) {
        const d = Math.hypot(c.x - mouse.x, c.y - mouse.y);
        if (d < C.cursorRadius) {
          const g = 1 - d / C.cursorRadius;
          if (g * g * 0.75 > c.lit) c.lit = g * g * 0.75;
        }
      }

      c.lit *= 0.94;
      a += c.lit * C.lit;
      if (a < 0.006) continue;

      // "Off" modules read as a dimmer, smaller point rather than a full
      // square, so the field keeps the light/dark texture of a real symbol.
      if (c.on) {
        ctx.fillStyle = rgba(a);
        ctx.fillRect(c.x - half, c.y - half, C.dot, C.dot);
      } else {
        ctx.fillStyle = rgba(a * 0.5);
        ctx.fillRect(c.x - half, c.y - half, Math.max(1, C.dot - 1), Math.max(1, C.dot - 1));
      }
    }
  }

  const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
  const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };

  resize();
  window.addEventListener('resize', resize);
  if (hasCursor) {
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
  }
  raf = requestAnimationFrame(frame);
  canvas.classList.add('is-in');

  return function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseleave', onLeave);
  };
}
