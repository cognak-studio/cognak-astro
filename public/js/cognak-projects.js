/* COGNAK Projects page scripts — ported from page-projects.php + functions.php
   (vt-isolate). Projects page only. */

/* ── View-transition isolation (functions.php) ─────────────────────────────────
   Only the tile you actually pressed should keep its view-transition-name; every
   other named element gets 'none' for the duration of the navigation so the
   browser snapshots one participant instead of fifty. Runs for BOTH views: the
   grid figures and the list rows are both named project-thumb-{slug} (they're
   never visible at the same time, so the names can't collide).

   TWO BUGS FIXED HERE, both latent in the original grid-only version and both
   only visible from the SECOND click onward — which is why this read as "the
   morph just stopped working" rather than "the morph never worked":

   1. Nothing restored the names after a real navigation. The old mouseup handler
      only restored on an ABORTED click; a completed click left every other tile
      at 'none', and Chrome then served the archive back from bfcache in exactly
      that state. The next click's 'keep' element was already 'none', so there
      was no participant to pair with the hero and the morph silently degraded to
      a plain root fade. Fixed by restoring on pageshow, which fires on bfcache
      restore and is a harmless no-op on a fresh load.

   2. The restore read from a stash of the PREVIOUS value (dataset.savedVt). On
      the second pass that stash was itself 'none', so the real name was
      overwritten and permanently destroyed — restoring became a no-op that wrote
      'none' back over 'none'. Verified live: all 53 rows sat at 'none' with all
      53 stashes reading 'none'. Fixed by snapshotting the canonical names ONCE
      at init, before anything can clear them, so restore always has ground truth.

   Ordering note: pagereveal runs BEFORE pageshow, so a back-navigation's own
   morph has already captured its snapshot by the time we restore — restoring
   cannot disturb the transition that is currently playing. */
(function() {
    var containers = [
        { root: document.querySelector('.projects-grid'), link: '.projects-grid-link', named: '.projects-grid-figure' },
        { root: document.querySelector('.projects-list'), link: '.projects-list-item', named: '.projects-list-item'   }
    ].filter(function(c) { return c.root; });
    if (!containers.length) return;

    // Ground truth, captured before any handler can touch it. Astro writes the
    // name as an inline style, so this reads it straight off the server markup.
    var canonical = new WeakMap();
    containers.forEach(function(c) {
        c.root.querySelectorAll(c.named).forEach(function(el) {
            canonical.set(el, el.style.viewTransitionName || '');
        });
    });

    function restoreAll() {
        containers.forEach(function(c) {
            c.root.querySelectorAll(c.named).forEach(function(el) {
                var name = canonical.get(el);
                if (name !== undefined) el.style.viewTransitionName = name;
            });
        });
    }

    containers.forEach(function(c) {
        c.root.addEventListener('mousedown', function(e) {
            var link = e.target.closest(c.link);
            if (!link) return;
            // For the list the link IS the named element; for the grid it's a child.
            var keep = link.matches(c.named) ? link : link.querySelector(c.named);
            c.root.querySelectorAll(c.named).forEach(function(el) {
                if (el !== keep) el.style.viewTransitionName = 'none';
            });
            function onMouseup(ev) {
                if (!ev.target.closest(c.link)) restoreAll();
                document.removeEventListener('mouseup', onMouseup);
            }
            document.addEventListener('mouseup', onMouseup);
        });
    });

    window.addEventListener('pageshow', restoreAll);
})();

/* ── Odometer tick-up on project count ────────────────────────────────────── */
(function() {
    var el = document.querySelector('.projects-count-sup');
    if (!el) return;
    var target = parseInt(el.textContent, 10);
    if (!target || target <= 1) return;
    el.textContent = '0';
    var duration = 3500;
    var start = null;
    function tick(ts) {
        if (!start) start = ts;
        var p    = Math.min((ts - start) / duration, 1);
        var ease = 1 - Math.pow(1 - p, 5);
        el.textContent = Math.round(ease * target);
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = target;
    }
    requestAnimationFrame(tick);
})();

/* ── Sort + view toggle ───────────────────────────────────────────────────── */
(function() {
    var btn      = document.getElementById('projects-sort-toggle');
    var grid     = document.querySelector('.projects-grid');
    var list     = document.querySelector('.projects-list');
    var archive  = document.querySelector('.projects-archive');
    var btnGrid  = document.getElementById('view-toggle-grid');
    var btnList  = document.getElementById('view-toggle-list');
    if (!btn || !grid || !list) return;

    var mode = 'newest';
    var view = localStorage.getItem('cognak-projects-view') || 'list';

    function setPressed(grid) {
        btnGrid.setAttribute('aria-pressed', grid ? 'true' : 'false');
        btnList.setAttribute('aria-pressed', grid ? 'false' : 'true');
    }

    if (view === 'grid') {
        archive.classList.add('is-grid-view');
        btnGrid.classList.add('is-active');
        btnList.classList.remove('is-active');
        setPressed(true);
    } else {
        archive.classList.remove('is-grid-view');
        btnList.classList.add('is-active');
        btnGrid.classList.remove('is-active');
        setPressed(false);
    }

    btnGrid.addEventListener('click', function() {
        if (view === 'grid') return;
        view = 'grid';
        archive.classList.add('is-grid-view');
        document.documentElement.classList.remove('pv-list');
        document.documentElement.classList.add('pv-grid');
        btnGrid.classList.add('is-active');
        btnList.classList.remove('is-active');
        setPressed(true);
        localStorage.setItem('cognak-projects-view', 'grid');
    });

    btnList.addEventListener('click', function() {
        if (view === 'list') return;
        view = 'list';
        archive.classList.remove('is-grid-view');
        document.documentElement.classList.add('pv-list');
        document.documentElement.classList.remove('pv-grid');
        btnList.classList.add('is-active');
        btnGrid.classList.remove('is-active');
        setPressed(false);
        localStorage.setItem('cognak-projects-view', 'list');
    });

    function comparator(a, b) {
        if (mode === 'alpha') return a.dataset.title.localeCompare(b.dataset.title);
        return parseInt(b.dataset.date) - parseInt(a.dataset.date);
    }

    var EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)'; // mirrors --ease-out-expo in custom.css
    var FLIP_MS = 520;
    var FLIP_STAGGER_MS = 120;  // total spread across the whole reorder, not per item
    var FLIP_MARGIN = 200;      // px beyond the viewport that still animates

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* Reorder a container with a FLIP.

       Why hand-rolled instead of document.startViewTransition(): the tiles and
       rows carry PERMANENT view-transition-names for the thumb-to-hero
       navigation morph, so a same-document transition would snapshot all 53 at
       once (exactly what vt-isolate exists to prevent). Worse, the root rules in
       custom.css are tuned for navigation - ::view-transition-old(root) is
       {animation:none; opacity:0} - so a same-document transition would blank
       the outgoing page unless every existing VT rule grew a carve-out.

       Only items within FLIP_MARGIN of the viewport animate. With 53 rows that
       is the difference between smooth and janky, and the ones that cheat are
       off-screen by definition.

       The stagger is keyed to TRAVEL DISTANCE, not index: whatever moves
       furthest starts last. That reads as the list settling into its new order,
       and it makes the alpha/chronological swap legible as a reordering rather
       than a reshuffle. Index-keyed stagger produces a wave sweeping top-to-
       bottom, which says nothing about what actually changed. */
    function reorder(container, selector, animate) {
        var items = Array.prototype.slice.call(container.querySelectorAll(selector));
        if (!items.length) return;

        if (!animate || reduceMotion.matches) {
            items.sort(comparator).forEach(function(el) { container.appendChild(el); });
            return;
        }

        // FIRST - where everything is now.
        var vh = window.innerHeight;
        var first = items.map(function(el) {
            var r = el.getBoundingClientRect();
            return { top: r.top, left: r.left, near: r.bottom > -FLIP_MARGIN && r.top < vh + FLIP_MARGIN };
        });

        // Reorder.
        items.slice().sort(comparator).forEach(function(el) { container.appendChild(el); });

        // LAST + INVERT - measure the deltas before animating any of them, so
        // one item's animation can't perturb another's measurement.
        var moves = [];
        var maxDist = 0;
        items.forEach(function(el, i) {
            if (!first[i].near) return;
            var r = el.getBoundingClientRect();
            var dx = first[i].left - r.left;
            var dy = first[i].top - r.top;
            if (!dx && !dy) return;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > maxDist) maxDist = dist;
            moves.push({ el: el, dx: dx, dy: dy, dist: dist });
        });
        if (!moves.length) return;

        // PLAY.
        moves.forEach(function(m) {
            m.el.animate(
                [
                    { transform: 'translate(' + m.dx.toFixed(2) + 'px, ' + m.dy.toFixed(2) + 'px)' },
                    { transform: 'translate(0, 0)' }
                ],
                {
                    duration: FLIP_MS,
                    delay: maxDist ? (m.dist / maxDist) * FLIP_STAGGER_MS : 0,
                    easing: EXPO,
                    fill: 'both'
                }
            );
        });
    }

    // animate=false for the on-load call below: the server already renders in the
    // default (newest-first) order, so that pass is a no-op sort, and skipping the
    // FLIP avoids 53 getBoundingClientRect() reads during first paint.
    function sortItems(animate) {
        reorder(grid, '.projects-grid-item', animate);
        reorder(list, '.projects-list-item', animate);
    }

    btn.addEventListener('click', function() {
        mode = (mode === 'newest') ? 'alpha' : 'newest';
        btn.dataset.mode = mode;
        btn.setAttribute('aria-label', mode === 'newest' ? 'Sort: newest first' : 'Sort: alphabetical');
        sortItems(true);
        initLazyLoad();
    });

    sortItems(false);

    function initLazyLoad() {
        var all = grid.querySelectorAll('.projects-grid-item');
        all.forEach(function(item) { item.classList.remove('proj-lazy'); });
        var sorted = grid.querySelectorAll('.projects-grid-item');
        sorted.forEach(function(item, idx) {
            if (idx >= 8) item.classList.add('proj-lazy');
        });
        var lazyItems = grid.querySelectorAll('.proj-lazy');
        if (!lazyItems.length) return;
        if (!('IntersectionObserver' in window)) {
            lazyItems.forEach(function(item) { item.classList.add('proj-visible'); });
            return;
        }
        var lazyObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('proj-visible');
                lazyObserver.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px 200px 0px' });
        lazyItems.forEach(function(item) { lazyObserver.observe(item); });
    }
    initLazyLoad();
})();

/* ── Live vintage badge refresh ───────────────────────────────────────────────
   The list's "VSOP · 6y" badge is baked in at build time, so it goes stale
   between deploys. Recompute from data-date on load; the server value stays
   as the no-JS fallback. Thresholds match projects/index.astro (BNIC-ish). */
(function() {
    var YEAR_SECONDS = 31557600;
    var now = Date.now() / 1000;
    document.querySelectorAll('.projects-list-item[data-date]').forEach(function(item) {
        var span = item.querySelector('.list-item-vintage');
        var d = parseInt(item.dataset.date, 10);
        if (!span || !d || d > now) return;
        var years = (now - d) / YEAR_SECONDS;
        var grade = years >= 10 ? 'XO' : years >= 4 ? 'VSOP' : 'VS';
        var aged  = years < 1 ? '<1y' : Math.floor(years) + 'y';
        span.textContent = ' · ' + grade + ' · ' + aged;
    });
})();

/* ── Matrix glow canvas (cursor-follow) ───────────────────────────────────── */
(function() {
    if (!window.matchMedia('(hover: hover)').matches) return;
    var canvas = document.getElementById('projects-matrix-glow');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*:;.,/|[]{}()<>?+=-_^~';
    var CHAR_SIZE = 11;
    var COL_W     = Math.round(CHAR_SIZE * 1.35);
    var ROW_H     = Math.round(CHAR_SIZE * 1.65);
    var RADIUS    = 190;
    var MAX_ALPHA = 0.18;

    var W, H, cells = [];
    var mouse = { x: -9999, y: -9999 };

    function rchar() { return CHARS[Math.floor(Math.random() * CHARS.length)]; }

    function build() {
        cells = [];
        var cols = Math.ceil(W / COL_W) + 2;
        var rows = Math.ceil(H / ROW_H) + 2;
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                cells.push({
                    x: c * COL_W,
                    y: r * ROW_H + CHAR_SIZE,
                    ch: rchar(),
                    rate: 8 + Math.floor(Math.random() * 40),
                    tick: Math.floor(Math.random() * 40),
                    alpha: 0
                });
            }
        }
    }

    function resize() {
        W = canvas.width  = window.innerWidth;
        H = canvas.height = window.innerHeight;
        build();
    }

    function draw() {
        requestAnimationFrame(draw);
        ctx.clearRect(0, 0, W, H);
        ctx.font = '400 ' + CHAR_SIZE + 'px "SF Mono","Fira Mono",ui-monospace,monospace';
        for (var i = 0; i < cells.length; i++) {
            var cell = cells[i];
            cell.tick++;
            if (cell.tick >= cell.rate) { cell.tick = 0; cell.ch = rchar(); }
            var dx = cell.x - mouse.x;
            var dy = cell.y - mouse.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var t = Math.max(0, 1 - dist / RADIUS);
            var target = t * t * MAX_ALPHA;
            cell.alpha += (target - cell.alpha) * 0.08;
            if (cell.alpha < 0.002) continue;
            var rv = Math.round(219 - t * 80);
            var gv = Math.round(39  - t * 8);
            var bv = Math.round(199 + t * 56);
            ctx.fillStyle = 'rgba(' + rv + ',' + gv + ',' + bv + ',' + cell.alpha + ')';
            ctx.fillText(cell.ch, cell.x, cell.y);
        }
    }

    window.addEventListener('mousemove', function(e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });
    window.addEventListener('mouseleave', function() {
        mouse.x = -9999;
        mouse.y = -9999;
    });
    window.addEventListener('resize', resize);

    resize();
    requestAnimationFrame(draw);
})();

/* ── Spark dissolve off "Start a project" ─────────────────────────────────── */
(function() {
    if (!window.matchMedia('(hover: hover)').matches) return;
    var link = document.querySelector('.projects-start-link');
    if (!link) return;

    var isHovering = false;
    var PALETTE = ['#9F50FF','#B46FFF','#8B3AFF','#C280FF','#7A28EF','#A860FF'];

    function makeSpark(rect) {
        var spawnX = rect.left + Math.random() * rect.width;
        var spawnY = rect.top  + Math.random() * rect.height * 0.30;
        var deg  = 20 + Math.random() * 140;
        var rad  = deg * Math.PI / 180;
        var dist = 18 + Math.random() * 45;
        var dx   = Math.cos(rad) * dist;
        var dy   = -Math.sin(rad) * dist;
        var size = Math.random() < 0.72 ? 1 : 2;
        var dur  = Math.random() < 0.25
            ? 2600 + Math.random() * 1400
            : 1400 + Math.random() * 800;
        var el = document.createElement('div');
        el.style.cssText =
            'position:fixed;pointer-events:none;z-index:9999;' +
            'width:' + size + 'px;height:' + size + 'px;' +
            'left:' + spawnX.toFixed(1) + 'px;top:' + spawnY.toFixed(1) + 'px;' +
            'background:' + PALETTE[Math.floor(Math.random() * PALETTE.length)] + ';' +
            'border-radius:0;will-change:transform,opacity;';
        document.body.appendChild(el);
        var t0 = null;
        function frame(ts) {
            if (!t0) t0 = ts;
            var p = Math.min((ts - t0) / dur, 1);
            var e = 1 - Math.pow(1 - p, 3);
            el.style.transform = 'translate(' + (dx * e).toFixed(2) + 'px,' + (dy * e).toFixed(2) + 'px)';
            el.style.opacity   = (1 - p * p).toFixed(3);
            if (p < 1) { requestAnimationFrame(frame); } else { el.remove(); }
        }
        requestAnimationFrame(frame);
    }

    function spawnBatch() {
        if (!isHovering) return;
        var rect = link.getBoundingClientRect();
        var n = 5 + Math.floor(Math.random() * 11);
        for (var i = 0; i < n; i++) makeSpark(rect);
        setTimeout(spawnBatch, 80 + Math.random() * 120);
    }

    link.addEventListener('mouseenter', function() { isHovering = true;  spawnBatch(); });
    link.addEventListener('mouseleave', function() { isHovering = false; });
})();
