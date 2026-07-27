/**
 * /tools background — "module lattice".
 *
 * A dense field of very small squares, the same units a QR symbol is built
 * from, sitting at almost no opacity. Modules brighten within a short radius
 * of the cursor and ease back down, the same falloff the projects page uses
 * for its matrix glow. Nothing pulses on its own.
 *
 * Fixed to the viewport and painted behind #cognak-main. Skipped entirely
 * under prefers-reduced-motion.
 *
 * Performance note: at step 9 a large display holds 40,000+ modules, which is
 * far too many to repaint every frame. The resting field is therefore rendered
 * once to an offscreen canvas and blitted, and each frame only touches the
 * modules that are actually lit — a few thousand around the cursor at most.
 * When nothing is lit and the cursor hasn't moved, the frame is skipped
 * outright, so an idle page costs nothing.
 */

const ACCENT = '180,124,255';

export const LATTICE_DEFAULTS = {
  step: 9,           // lattice pitch, px
  dot: 1.5,          // module size, px
  base: 0.044,       // resting opacity
  jitter: 0.024,     // random extra resting opacity, per module
  lit: 0.4,          // opacity added at full illumination
  cursorRadius: 230, // px
  decay: 0.94,       // per-frame easing back to rest
};

export function initLattice(canvas, overrides = {}) {
  if (!canvas || !canvas.getContext) return () => {};
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  const C = { ...LATTICE_DEFAULTS, ...overrides };
  const ctx = canvas.getContext('2d');
  const hasCursor = window.matchMedia('(hover: hover)').matches;

  // Building an rgba() string per module per frame is the single most
  // expensive thing here once there are a couple of thousand of them, so
  // alpha is quantised to 1/255 and the resulting strings are memoised.
  const STYLES = new Array(256);
  function style(a) {
    let q = (a * 255) | 0;
    if (q < 0) q = 0; else if (q > 255) q = 255;
    return STYLES[q] || (STYLES[q] = `rgba(${ACCENT},${(q / 255).toFixed(3)})`);
  }

  let w = 0, h = 0, dpr = 1, cols = 0, rows = 0;
  let rest = null;          // Float32Array of resting opacity, one per module
  let on = null;            // Uint8Array: filled module vs. the smaller "off" one
  let lit = null;           // Float32Array of current illumination, 0..1
  let active = [];          // indices with lit > 0, so idle frames stay cheap
  let field = null;         // offscreen canvas holding the resting lattice
  let raf = 0;

  const mouse = { x: -9999, y: -9999 };

  const OFF_DOT = Math.max(1, C.dot - 0.5);

  const moduleX = (i) => (i % cols) * C.step + C.step;
  const moduleY = (i) => ((i / cols) | 0) * C.step + C.step;

  function paintModule(c, i, alpha) {
    const x = moduleX(i), y = moduleY(i);
    if (on[i]) {
      c.fillStyle = style(alpha);
      c.fillRect(x - C.dot / 2, y - C.dot / 2, C.dot, C.dot);
    } else {
      c.fillStyle = style(alpha * 0.5);
      c.fillRect(x - OFF_DOT / 2, y - OFF_DOT / 2, OFF_DOT, OFF_DOT);
    }
  }

  function build() {
    cols = Math.ceil(w / C.step) + 1;
    rows = Math.ceil(h / C.step) + 1;
    const n = cols * rows;
    rest = new Float32Array(n);
    on = new Uint8Array(n);
    lit = new Float32Array(n);
    active = [];
    for (let i = 0; i < n; i++) {
      rest[i] = C.base + Math.random() * C.jitter;
      on[i] = Math.random() > 0.45 ? 1 : 0;
    }

    field = document.createElement('canvas');
    field.width = Math.round(w * dpr);
    field.height = Math.round(h * dpr);
    const fc = field.getContext('2d');
    fc.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < n; i++) paintModule(fc, i, rest[i]);
    // Lay the resting field down once. Every later frame only repaints the
    // small region around whatever is lit, so this is the only full blit.
    ctx.drawImage(field, 0, 0, w, h);
  }

  // Compositing this full-viewport canvas costs in proportion to its backing
  // store, and at devicePixelRatio 2 on a large display that reaches ~15M
  // pixels — enough on its own to halve the frame rate, regardless of how
  // little is actually drawn. The modules are 1.5px dots at ~5% opacity, so
  // rendering slightly below native density is invisible; the budget below
  // keeps a 2560-wide retina display at full speed.
  const MAX_BACKING_PIXELS = 4.5e6;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const budget = Math.sqrt(MAX_BACKING_PIXELS / Math.max(1, w * h));
    if (dpr > budget) dpr = Math.max(1, budget);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function frame() {
    raf = requestAnimationFrame(frame);

    // Light everything inside the cursor's reach, working only over the
    // bounding box of that circle rather than the whole field.
    if (hasCursor && mouse.x > -9000) {
      const r = C.cursorRadius;
      const c0 = Math.max(0, Math.floor((mouse.x - r - C.step) / C.step));
      const c1 = Math.min(cols - 1, Math.ceil((mouse.x + r - C.step) / C.step));
      const r0 = Math.max(0, Math.floor((mouse.y - r - C.step) / C.step));
      const r1 = Math.min(rows - 1, Math.ceil((mouse.y + r - C.step) / C.step));
      for (let ry = r0; ry <= r1; ry++) {
        for (let cx = c0; cx <= c1; cx++) {
          const dx = cx * C.step + C.step - mouse.x;
          const dy = ry * C.step + C.step - mouse.y;
          const d = Math.hypot(dx, dy);
          if (d >= r) continue;
          const g = 1 - d / r;
          const target = g * g * 0.75;
          const i = ry * cols + cx;
          if (target > lit[i]) {
            if (lit[i] === 0) active.push(i);
            lit[i] = target;
          }
        }
      }
    }

    if (!active.length) return;

    // Only the region containing lit modules needs repainting. Everything else
    // is already correct from the last frame, so a full-canvas blit would be
    // pure waste — at 16k+ modules that alone is the difference between 36fps
    // and a free frame.
    const pad = C.dot + 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < active.length; k++) {
      const i = active[k];
      const x = moduleX(i), y = moduleY(i);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w, x1 + pad); y1 = Math.min(h, y1 + pad);
    const rw = x1 - x0, rh = y1 - y0;
    if (rw <= 0 || rh <= 0) { active = []; return; }

    ctx.clearRect(x0, y0, rw, rh);
    ctx.drawImage(field, x0 * dpr, y0 * dpr, rw * dpr, rh * dpr, x0, y0, rw, rh);

    const next = [];
    for (let k = 0; k < active.length; k++) {
      const i = active[k];
      lit[i] *= C.decay;
      if (lit[i] < 0.004) { lit[i] = 0; continue; }
      paintModule(ctx, i, rest[i] + lit[i] * C.lit);
      next.push(i);
    }
    active = next;
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
