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

    /* Which end the nav occupies, and how much.

       Read from COMPUTED STYLE + offsetHeight, deliberately NOT from
       getBoundingClientRect(). The rect is affected by transforms, and the
       homepage nav animates — so any frame where it was mid-transform made the
       geometric test ("is its bottom edge at the viewport bottom?") fail, and
       navInset() returned zero. The track then ran full height with a longer
       thumb, until a later metrics() caught the nav settled and the inset
       snapped back on. That is the homepage bug where the bar lost its bottom
       ~15% after scrolling down and back up.

       Computed top/bottom resolve to used values, so a fixed bar with bottom:0
       reports bottom "0px" no matter what transform is on it, and offsetHeight
       ignores transforms too. Deterministic on every frame. */
    function navInset() {
        var nav = document.querySelector('.home-bottom-bar');
        if (!nav) return { top: 0, bottom: 0 };
        var cs = window.getComputedStyle(nav);
        if (cs.display === 'none' || cs.position !== 'fixed') return { top: 0, bottom: 0 };
        var h = nav.offsetHeight;
        if (!h) return { top: 0, bottom: 0 };
        var topPx = parseFloat(cs.top);
        var botPx = parseFloat(cs.bottom);
        // Inner pages pin the nav to the top, the homepage to the bottom.
        if (!isNaN(topPx) && Math.abs(topPx) < 1) return { top: h + NAV_GAP, bottom: 0 };
        if (!isNaN(botPx) && Math.abs(botPx) < 1) return { top: 0, bottom: h + NAV_GAP };
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
        var next = Math.max(MIN_THUMB, Math.round(trackH * (window.innerHeight / doc.scrollHeight)));
        if (next > trackH) next = trackH;
        // Only touch the DOM when it actually changed. metrics() runs from a
        // ResizeObserver that fires often on the homepage (lazy tiles revealing,
        // WebGL settling) and rewriting an identical height every time is both
        // wasted layout and a chance to interrupt the easing transition.
        if (next !== thumbH) {
            thumbH = next;
            thumb.style.height = thumbH + 'px';
        }
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

    /* Content height changes after images/fonts/WebGL settle, /brief swaps in a
       whole questionnaire, and /send renders its share list after a fetch —
       re-measure rather than trusting the first reading.

       ** NEVER observe document.body HERE. ** custom.css:463 sets
       `html, body { height: 100% }` (WordPress-era), which pins body's box to
       the viewport permanently: content that overflows it grows
       documentElement.scrollHeight but leaves body.offsetHeight unchanged
       forever. A ResizeObserver on a box that never changes size never fires.
       Measured on /send 2026-07-31: injecting 800px of content moved
       scrollHeight 1387 -> 2187 while body.offsetHeight stayed 945.
       That silently disabled this observer, and an identical one on /send, from
       the day each shipped. #cognak-main is NOT pinned and does grow (945 ->
       1706 in the same test); every page renders one.

       LENIS IS RESIZED HERE TOO, deliberately. Lenis caches the document height
       and clamps wheel scrolling to it, so a stale reading dead-ends the page
       partway down — on /send that made the whole footer unreachable. Fixing it
       centrally means every page with async content gets it, rather than each
       page hand-rolling its own sync. This file already reads window._lenis for
       the scroll position, so it is not a new dependency. */
    if (window.ResizeObserver) {
        var growTarget = document.getElementById('cognak-main') || document.body;
        new ResizeObserver(function () {
            try {
                if (window._lenis && window._lenis.resize) window._lenis.resize();
            } catch (e) {}
            metrics();
            render(currentScroll());
        }).observe(growTarget);
    }
    window.addEventListener('load', function () { metrics(); onScroll(); });

    metrics();
    render(currentScroll());
})();
