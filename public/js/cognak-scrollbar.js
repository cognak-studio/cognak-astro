/* COGNAK custom overlay scrollbar ──────────────────────────────────────────────
   The native scrollbar is hidden in custom.css so it stops reserving a gutter.
   That gutter was the reason every fixed nav stopped ~11px short of the right
   edge on machines using classic scrollbars (macOS with a mouse attached, and
   most of Windows). This draws a replacement that floats OVER the content, the
   way macOS overlay scrollbars do, so nothing loses width.

   Behaviour: appears while scrolling, fades after a moment of stillness, and can
   be dragged to scroll. Colour comes from --sb-thumb, set per page in BaseLayout.

   THE TRACK STOPS AT THE NAV. The nav is fixed and opaque, so a full-height bar
   either slid underneath it (looking like it began mid-air) or sat on top of it.
   The track is inset by the nav's height instead, and the thumb's travel is
   computed against that shortened track — so "thumb at the bottom" still means
   "end of the page", just measured over the space the bar can actually occupy.
   The nav is top-anchored on inner pages and bottom-anchored on the homepage, so
   which end gets inset is measured, not assumed.

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
    var NAV_GAP   = 10;     // breathing room between the nav edge and the track

    var idleTimer = null;
    var dragging  = false;
    var trackH = 0, thumbH = 0, maxScroll = 0, trackTop = 0;

    /* Which end the nav occupies, and how much. Measured rather than assumed:
       inner pages pin it to the top, the homepage to the bottom, and the
       homepage also swaps modes on scroll. */
    function navInset() {
        var nav = document.querySelector('.home-bottom-bar');
        if (!nav) return { top: 0, bottom: 0 };
        var cs = window.getComputedStyle(nav);
        if (cs.display === 'none' || cs.position !== 'fixed') return { top: 0, bottom: 0 };
        var r = nav.getBoundingClientRect();
        if (r.height <= 0) return { top: 0, bottom: 0 };
        if (r.top <= 1) return { top: Math.round(r.height) + NAV_GAP, bottom: 0 };
        if (Math.abs(r.bottom - window.innerHeight) <= 1) {
            return { top: 0, bottom: Math.round(r.height) + NAV_GAP };
        }
        return { top: 0, bottom: 0 };
    }

    function metrics() {
        var doc = document.documentElement;
        var inset = navInset();

        trackTop = inset.top;
        bar.style.top    = inset.top + 'px';
        bar.style.bottom = inset.bottom + 'px';

        trackH    = Math.max(0, window.innerHeight - inset.top - inset.bottom);
        maxScroll = Math.max(0, doc.scrollHeight - window.innerHeight);

        if (maxScroll <= 0 || trackH <= 0) {
            bar.classList.remove('is-visible');
            thumbH = 0;
            return false;
        }
        // Proportional to how much of the document fits on screen, floored so it
        // stays grabbable on very long pages.
        thumbH = Math.max(MIN_THUMB, Math.round(trackH * (window.innerHeight / doc.scrollHeight)));
        if (thumbH > trackH) thumbH = trackH;
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
       keeps the gesture alive once the pointer leaves the narrow strip, which
       happens almost immediately. */
    var startY = 0, startScroll = 0;

    thumb.addEventListener('pointerdown', function (e) {
        if (!metrics()) return;
        dragging = true;
        startY = e.clientY;
        startScroll = currentScroll();
        bar.classList.add('is-dragging');
        try { thumb.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault(); // stop the page selecting text mid-drag
    });

    thumb.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var travel = trackH - thumbH;
        if (travel <= 0) return;
        var delta = (e.clientY - startY) / travel * maxScroll;
        var target = Math.min(maxScroll, Math.max(0, startScroll + delta));
        var l = window._lenis;
        if (l && l.scrollTo) {
            // immediate: the bar should track the pointer 1:1, not ease behind it
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

    // Lenis is created on DOMContentLoaded, so it may not exist yet; poll briefly.
    // The native listener below stays attached regardless as a safety net.
    if (!attachLenis()) {
        var tries = 0;
        var poll = setInterval(function () {
            if (attachLenis() || ++tries > 40) clearInterval(poll);
        }, 50);
    }
    window.addEventListener('scroll', function () { onScroll(); }, { passive: true });
    window.addEventListener('resize', function () { metrics(); onScroll(); });

    // The homepage nav changes height/anchor when it enters nav-mode, which moves
    // where the track has to start. Watch the class rather than re-measuring the
    // nav on every scroll frame.
    var navEl = document.querySelector('.home-bottom-bar');
    if (navEl && window.MutationObserver) {
        new MutationObserver(function () { metrics(); render(currentScroll()); })
            .observe(navEl, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    // Content height changes after images/fonts/WebGL settle, and /brief swaps in
    // a whole questionnaire — re-measure rather than trusting the first reading.
    if (window.ResizeObserver) {
        new ResizeObserver(function () { metrics(); render(currentScroll()); })
            .observe(document.body);
    }
    window.addEventListener('load', function () { metrics(); onScroll(); });

    metrics();
    render(currentScroll());
})();
