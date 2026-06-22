/* COGNAK Projects page scripts — ported from page-projects.php + functions.php
   (vt-isolate). Projects page only. */

/* ── View-transition isolation (functions.php) ────────────────────────────── */
(function() {
    var grid = document.querySelector('.projects-grid');
    if (!grid) return;
    function clearOthers(keepFig) {
        grid.querySelectorAll('.projects-grid-figure').forEach(function(fig) {
            if (fig !== keepFig) {
                fig.dataset.savedVt = fig.style.viewTransitionName || '';
                fig.style.viewTransitionName = 'none';
            }
        });
    }
    function restoreAll() {
        grid.querySelectorAll('.projects-grid-figure').forEach(function(fig) {
            if (fig.dataset.savedVt !== undefined) {
                fig.style.viewTransitionName = fig.dataset.savedVt;
                delete fig.dataset.savedVt;
            }
        });
    }
    grid.addEventListener('mousedown', function(e) {
        var link = e.target.closest('.projects-grid-link');
        if (!link) return;
        clearOthers(link.querySelector('.projects-grid-figure'));
        function onMouseup(ev) {
            if (!ev.target.closest('.projects-grid-link')) restoreAll();
            document.removeEventListener('mouseup', onMouseup);
        }
        document.addEventListener('mouseup', onMouseup);
    });
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

    if (view === 'list') {
        archive.classList.add('is-list-view');
        btnList.classList.add('is-active');
        btnGrid.classList.remove('is-active');
    } else {
        archive.classList.remove('is-list-view');
        btnGrid.classList.add('is-active');
        btnList.classList.remove('is-active');
    }

    btnGrid.addEventListener('click', function() {
        if (view === 'grid') return;
        view = 'grid';
        archive.classList.remove('is-list-view');
        document.documentElement.classList.remove('pv-list');
        document.documentElement.classList.add('pv-grid');
        btnGrid.classList.add('is-active');
        btnList.classList.remove('is-active');
        localStorage.setItem('cognak-projects-view', 'grid');
    });

    btnList.addEventListener('click', function() {
        if (view === 'list') return;
        view = 'list';
        archive.classList.add('is-list-view');
        document.documentElement.classList.add('pv-list');
        document.documentElement.classList.remove('pv-grid');
        btnList.classList.add('is-active');
        btnGrid.classList.remove('is-active');
        localStorage.setItem('cognak-projects-view', 'list');
    });

    function sortItems() {
        var gridItems = Array.prototype.slice.call(grid.querySelectorAll('.projects-grid-item'));
        gridItems.sort(function(a, b) {
            if (mode === 'alpha') {
                return a.dataset.title.localeCompare(b.dataset.title);
            } else {
                return parseInt(b.dataset.date) - parseInt(a.dataset.date);
            }
        });
        gridItems.forEach(function(item) { grid.appendChild(item); });

        var listItems = Array.prototype.slice.call(list.querySelectorAll('.projects-list-item'));
        listItems.sort(function(a, b) {
            if (mode === 'alpha') {
                return a.dataset.title.localeCompare(b.dataset.title);
            } else {
                return parseInt(b.dataset.date) - parseInt(a.dataset.date);
            }
        });
        listItems.forEach(function(item) { list.appendChild(item); });
    }

    btn.addEventListener('click', function() {
        mode = (mode === 'newest') ? 'alpha' : 'newest';
        btn.dataset.mode = mode;
        btn.setAttribute('aria-label', mode === 'newest' ? 'Sort: newest first' : 'Sort: alphabetical');
        sortItems();
        initLazyLoad();
    });

    sortItems();

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
