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
