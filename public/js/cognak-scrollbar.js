/* COGNAK custom overlay scrollbar ──────────────────────────────────────────────
   The native scrollbar is hidden in custom.css so it stops reserving a gutter.
   That gutter was the reason every fixed nav stopped ~11px short of the right
   edge on machines using classic scrollbars (macOS with a mouse attached, and
   most of Windows). This draws a replacement that floats OVER the content, the
   way macOS overlay scrollbars do, so nothing loses width.

   Behaviour: appears while scrolling, fades after a moment of stillness, and can
   be dragged to scroll. Colour comes from --sb-thumb, set per page in BaseLayout.

   Lenis note: when Lenis is running, the bar is driven from Lenis' own scroll
   value, NOT window.scrollY. Reading scrollY here would make the bar lag behind
   the smoothed motion by a frame or more and look broken. Lenis is not
   initialised under prefers-reduced-motion, so the native path is the fallback.
──────────────────────────────────────────────────────────────────────────────── */
(function () {
    var bar = document.getElementById('cognak-scrollbar');
    if (!bar) return;

    var thumb = bar.querySelector('i');
    var MIN_THUMB = 32;     // px — never let it shrink to an unusable sliver
    var IDLE_MS   = 900;    // how long after the last scroll before it fades

    var idleTimer = null;
    var dragging  = false;
    var trackH = 0, thumbH = 0, maxScroll = 0;

    function metrics() {
        var doc = document.documentElement;
        trackH    = window.innerHeight;
        maxScroll = Math.max(0, doc.scrollHeight - window.innerHeight);
        if (maxScroll <= 0) {
            bar.classList.remove('is-visible');
            thumbH = 0;
            return false;
        }
        // Proportional height, floored so it stays grabbable on very long pages.
        thumbH = Math.max(MIN_THUMB, Math.round(trackH * (window.innerHeight / doc.scrollHeight)));
        thumb.style.height = thumbH + 'px';
        return true;
    }

    function currentScroll() {
        var l = window._lenis;
        if (l && typeof l.scroll === 'number') return l.scroll;
        return window.scrollY || document.documentElement.scrollTop || 0;
    }

    function render(scroll) {
        if (!thumbH) return;
        var p = maxScroll > 0 ? Math.min(1, Math.max(0, scroll / maxScroll)) : 0;
        thumb.style.transform = 'translateY(' + (p * (trackH - thumbH)).toFixed(2) + 'px)';
    }

    function show() {
        bar.classList.add('is-visible');
        clearTimeout(idleTimer);
        if (dragging) return;
        idleTimer = setTimeout(function () {
            if (!dragging) bar.classList.remove('is-visible');
        }, IDLE_MS);
    }

    function onScroll(scroll) {
        if (!thumbH && !metrics()) return;
        render(scroll === undefined ? currentScroll() : scroll);
        show();
    }

    /* ── drag to scroll ────────────────────────────────────────────────────────
       Map pointer travel along the track to document scroll. Pointer capture
       keeps the gesture alive even when the pointer leaves the 14px strip, which
       is most of the time once you start moving. */
    var startY = 0, startScroll = 0;

    thumb.addEventListener('pointerdown', function (e) {
        if (!metrics()) return;
        dragging = true;
        startY = e.clientY;
        startScroll = currentScroll();
        bar.classList.add('is-dragging');
        try { thumb.setPointerCapture(e.pointerId); } catch (err) {}
        // Stop the page selecting text while dragging.
        e.preventDefault();
    });

    thumb.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var travel = trackH - thumbH;
        if (travel <= 0) return;
        var delta = (e.clientY - startY) / travel * maxScroll;
        var target = Math.min(maxScroll, Math.max(0, startScroll + delta));
        var l = window._lenis;
        if (l && l.scrollTo) {
            // immediate: the bar should track the pointer 1:1, not ease behind it.
            l.scrollTo(target, { immediate: true, force: true });
        } else {
            window.scrollTo(0, target);
        }
        render(target);
    });

    function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        bar.classList.remove('is-dragging');
        try { thumb.releasePointerCapture(e.pointerId); } catch (err) {}
        show();
    }
    thumb.addEventListener('pointerup', endDrag);
    thumb.addEventListener('pointercancel', endDrag);

    /* ── wiring ─────────────────────────────────────────────────────────────── */
    function attachLenis() {
        var l = window._lenis;
        if (!l || !l.on) return false;
        l.on('scroll', function (e) {
            onScroll(e && typeof e.scroll === 'number' ? e.scroll : undefined);
        });
        return true;
    }

    // Lenis is created on DOMContentLoaded, so it may not exist yet; poll briefly,
    // and keep the native listener regardless as a safety net.
    if (!attachLenis()) {
        var tries = 0;
        var poll = setInterval(function () {
            if (attachLenis() || ++tries > 40) clearInterval(poll);
        }, 50);
    }
    window.addEventListener('scroll', function () { onScroll(); }, { passive: true });
    window.addEventListener('resize', function () { metrics(); onScroll(); });

    // Content height changes after images/fonts/WebGL settle, and /brief swaps in
    // a whole questionnaire — re-measure rather than trusting the first reading.
    if (window.ResizeObserver) {
        var ro = new ResizeObserver(function () { metrics(); render(currentScroll()); });
        ro.observe(document.body);
    }
    window.addEventListener('load', function () { metrics(); onScroll(); });

    metrics();
    render(currentScroll());
})();
