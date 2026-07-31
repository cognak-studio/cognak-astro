/* COGNAK single-project scripts — ported from single-project.php + functions.php
   (mobile-pager). Single project pages only. */

/* ── Hero video mute toggle ───────────────────────────────────────────────── */
(function() {
    var btn   = document.querySelector('.hero-mute-btn');
    var video = document.querySelector('.hero-video');
    if (!btn || !video) return;
    var iconMuted   = btn.querySelector('.hero-mute-icon--muted');
    var iconUnmuted = btn.querySelector('.hero-mute-icon--unmuted');
    btn.addEventListener('click', function() {
        video.muted = !video.muted;
        iconMuted.style.display   = video.muted ? '' : 'none';
        iconUnmuted.style.display = video.muted ? 'none' : '';
    });
})();

/* ── Hero video loader ring (fade out once the video has a frame) ──────────── */
(function() {
    var video  = document.querySelector('.hero-video');
    var loader = document.querySelector('.hero-video-loader');
    if (!video || !loader) return;
    var done = false;
    function hide() {
        if (done) return;
        done = true;
        loader.classList.add('is-hidden');
    }
    if (video.readyState >= 2) { hide(); }
    video.addEventListener('loadeddata', hide);
    video.addEventListener('playing', hide);
    setTimeout(hide, 8000);
})();

/* ── Mobile prev/next tap-to-reveal + awwwards badge (functions.php) ───────── */
(function() {
    document.querySelectorAll('.mobile-pager').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            var href = this.href;
            document.querySelectorAll('.mobile-pager.is-open').forEach(function(b) {
                b.classList.remove('is-open');
            });
            this.classList.add('is-open');
            setTimeout(function() { window.location.href = href; }, 320);
        });
    });
    var badge = document.getElementById('awwwards');
    if (badge) {
        badge.querySelector('a').addEventListener('click', function(e) {
            if (window.innerWidth > 720) return;
            e.preventDefault();
            var href = this.href;
            badge.classList.add('is-tapped');
            setTimeout(function() { window.open(href, '_blank'); }, 220);
        });
    }
})();

/* ── Align hero to nav ────────────────────────────────────────────────────── */
(function() {
    function alignHeroToNav() {
        var nav  = document.querySelector('.home-bottom-bar.inner-page-nav');
        var hero = document.querySelector('.template-single-project .img-wide--hero');
        if (!nav || !hero) return;
        hero.style.marginTop = '';
        void hero.offsetHeight;
        var navBottom  = nav.getBoundingClientRect().bottom;
        var heroTop    = hero.getBoundingClientRect().top;
        var gap = heroTop - navBottom;
        hero.style.marginTop = (-gap) + 'px';
    }
    document.addEventListener('DOMContentLoaded', function() {
        alignHeroToNav();
        setTimeout(alignHeroToNav, 100);
    });
    window.addEventListener('resize', alignHeroToNav);
})();

/* ── Fade project pagers after idle ───────────────────────────────────────── */
(function() {
    var isMobile = window.matchMedia('(max-width: 720px)').matches;
    var IDLE_MS = 1500;
    if (!isMobile) {
        var idleTimer = null;
        function goIdle() { document.body.classList.add('pagers-idle'); }
        function resetIdle() {
            document.body.classList.remove('pagers-idle');
            clearTimeout(idleTimer);
            idleTimer = setTimeout(goIdle, IDLE_MS);
        }
        document.addEventListener('mousemove',  resetIdle, { passive: true });
        document.addEventListener('touchstart', resetIdle, { passive: true });
        document.addEventListener('touchmove',  resetIdle, { passive: true });
        document.addEventListener('scroll',     resetIdle, { passive: true });
        resetIdle();
    } else {
        var mobileTimer = null;
        function goMobileIdle() { document.body.classList.add('mobile-pagers-idle'); }
        function resetMobileIdle() {
            document.body.classList.remove('mobile-pagers-idle');
            clearTimeout(mobileTimer);
            mobileTimer = setTimeout(goMobileIdle, IDLE_MS);
        }
        mobileTimer = setTimeout(goMobileIdle, IDLE_MS);
        document.addEventListener('scroll', resetMobileIdle, { passive: true });
    }
})();

/* ── Body gallery reveal ──────────────────────────────────────────────────────
   IO-gated fade + 12px rise, reusing the homepage's .hp-lazy spec. The CSS
   holds the images at opacity 0 behind html.js; this adds .is-in.

   STAGGER IS PER OBSERVER BATCH, not per index. Keying the delay to the image's
   position in the figure means image 6 always waits 450ms even when it enters
   the viewport completely alone — you scroll to it and it sits blank. Batching
   is what the audit actually asked for ("stagger when two enter together"):
   whatever arrives in THIS callback is numbered 0,1,2 and the count resets next
   time. Scrolling slowly reveals each image immediately; a fast scroll or a
   short image pair that lands together gets the cascade.

   The delay is handed over as a --gd custom property the CSS transition reads,
   rather than per-element JS timers — same approach as the /brief Sent screen.

   Images are `loading="lazy"` from the WordPress markup, so an element can be
   intersecting before it has pixels. Revealing then would fade in an empty box
   and pop the image in afterwards, so a not-yet-complete image waits for its
   own load event. unobserve() happens immediately either way — the load
   listener holds the only remaining reference. */
(function() {
    var imgs = Array.prototype.slice.call(
        document.querySelectorAll('.project-gallery img')
    );
    if (!imgs.length) return;

    /* Zero the trailing gap. Done here rather than in CSS because every img is
       the last child of its own <picture>, so no `img:last-child` selector can
       distinguish the final image in the figure from the final image in each
       group — see the note in custom.css. */
    imgs[imgs.length - 1].classList.add('is-last');

    // No IO (or reduced motion): show everything, skip the choreography.
    var reduced = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!('IntersectionObserver' in window) || reduced) {
        imgs.forEach(function(img) { img.classList.add('is-in'); });
        return;
    }

    var STEP_MS = 90;

    var observer = new IntersectionObserver(function(entries) {
        var arrived = entries.filter(function(e) { return e.isIntersecting; });
        arrived.forEach(function(entry, i) {
            var img = entry.target;
            observer.unobserve(img);
            img.style.setProperty('--gd', (i * STEP_MS) + 'ms');
            if (img.complete) {
                img.classList.add('is-in');
            } else {
                img.addEventListener('load', function() {
                    img.classList.add('is-in');
                }, { once: true });
                // A broken src must not strand the image invisible.
                img.addEventListener('error', function() {
                    img.classList.add('is-in');
                }, { once: true });
            }
        });
    }, { threshold: 0.1 });

    imgs.forEach(function(img) { observer.observe(img); });
})();
