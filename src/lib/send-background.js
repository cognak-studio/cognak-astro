/**
 * /send + /receive background — "transit".
 *
 * Horizontal lanes of small dashes drifting steadily left to right: packets
 * in flight, which is the only thing these two pages actually do. A faint
 * vertical seam sits at ~62% of the viewport; each dash brightens for a
 * moment as it crosses, then settles back — the handoff.
 *
 * Deliberately unlike the other animated pages so /send reads as its own
 * place: /tools lights a static QR-module lattice from the cursor and
 * /projects glows its matrix the same way ("nothing pulses on its own"),
 * while /brief and /studio run WebGL scenes. This one is the opposite — it
 * has no cursor interaction at all and never stops moving. The motion is
 * slow enough (8-22 px/s) to read as drift rather than animation.
 *
 * Fixed to the viewport and painted behind #cognak-main. Skipped entirely
 * under prefers-reduced-motion.
 *
 * Performance note: unlike the /tools lattice this repaints the full canvas
 * every frame, which is fine here — the whole field is only a few hundred
 * fillRect calls (roughly viewportHeight/38 lanes x ~7 dashes), two orders
 * of magnitude below the 40,000 modules that forced the lattice into its
 * offscreen-blit approach. The backing store is still capped the same way,
 * since compositing a full-viewport canvas at dpr 2 is expensive on its own
 * regardless of how little is drawn into it.
 */

const INK = '50,56,49'; // --ink #323831, the page's own text colour

export const TRANSIT_DEFAULTS = {
  laneGap: 38,       // vertical pitch between lanes, px
  thickness: 2,      // dash height, px
  minLen: 6,         // dash length range, px
  maxLen: 26,
  minGap: 26,        // gap between dashes in a lane, px
  maxGap: 190,
  minSpeed: 8,       // px/sec
  maxSpeed: 22,
  base: 0.05,        // resting opacity
  jitter: 0.03,      // random extra resting opacity, per lane
  flash: 0.26,       // opacity added at the moment of crossing the seam
  flashDecay: 0.955, // per-frame easing back to rest
  seamAt: 0.62,      // seam position, fraction of viewport width
  seamAlpha: 0.05,
};

export function initTransit(canvas, overrides = {}) {
  if (!canvas || !canvas.getContext) return () => {};
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  const C = { ...TRANSIT_DEFAULTS, ...overrides };
  const ctx = canvas.getContext('2d');

  // Same memoisation trick the lattice uses: building an rgba() string per
  // dash per frame is the most expensive thing here once a few hundred are
  // moving, so alpha is quantised to 1/255 and the strings are cached.
  const STYLES = new Array(256);
  function style(a) {
    let q = (a * 255) | 0;
    if (q < 0) q = 0; else if (q > 255) q = 255;
    return STYLES[q] || (STYLES[q] = `rgba(${INK},${(q / 255).toFixed(3)})`);
  }

  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  let w = 0, h = 0, dpr = 1, seamX = 0;
  let lanes = [];
  let raf = 0;
  let last = 0;

  function buildLane(y) {
    const lane = {
      y,
      speed: rand(C.minSpeed, C.maxSpeed),
      rest: C.base + Math.random() * C.jitter,
      dashes: [],
    };
    // Fill one full viewport width plus a margin, so there is never a visible
    // gap at either edge and a dash is always about to enter from the left.
    let x = -rand(0, C.maxGap);
    while (x < w + C.maxLen) {
      const len = rand(C.minLen, C.maxLen);
      lane.dashes.push({ x, len, flash: 0, crossed: x > seamX });
      x += len + rand(C.minGap, C.maxGap);
    }
    return lane;
  }

  function build() {
    seamX = Math.round(w * C.seamAt);
    lanes = [];
    // Half a lane of inset top and bottom so the field doesn't start flush
    // against the viewport edge.
    for (let y = C.laneGap * 0.5; y < h; y += C.laneGap) lanes.push(buildLane(Math.round(y)));
  }

  // See the header note — compositing cost scales with the backing store, not
  // with how much is drawn, so cap it the same way the /tools lattice does.
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

  function frame(now) {
    raf = requestAnimationFrame(frame);

    // Delta-time driven, and clamped: a backgrounded tab resumes with a huge
    // gap, which would otherwise teleport every dash across the seam at once.
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = style(C.seamAlpha);
    ctx.fillRect(seamX, 0, 1, h);

    const th = C.thickness;
    for (let l = 0; l < lanes.length; l++) {
      const lane = lanes[l];
      const step = lane.speed * dt;
      const y = lane.y - th / 2;
      for (let d = 0; d < lane.dashes.length; d++) {
        const dash = lane.dashes[d];
        dash.x += step;

        // The handoff: fires once, as the leading edge passes the seam.
        if (!dash.crossed && dash.x >= seamX) { dash.crossed = true; dash.flash = 1; }

        if (dash.flash > 0) {
          dash.flash *= C.flashDecay;
          if (dash.flash < 0.01) dash.flash = 0;
        }

        // Off the right edge: recycle to the left with a fresh length and gap
        // rather than allocating, so the lane stays a fixed-size array.
        if (dash.x > w + C.maxLen) {
          const prev = lane.dashes[(d - 1 + lane.dashes.length) % lane.dashes.length];
          dash.x = Math.min(-C.maxLen, prev.x - prev.len - rand(C.minGap, C.maxGap));
          dash.len = rand(C.minLen, C.maxLen);
          dash.crossed = false;
          dash.flash = 0;
        }

        ctx.fillStyle = style(lane.rest + dash.flash * C.flash);
        ctx.fillRect(dash.x, y, dash.len, th);
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);
  canvas.classList.add('is-in');

  return function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}
