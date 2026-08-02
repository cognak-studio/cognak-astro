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
        /* THE NAV IS `position: fixed` AND THE HERO IS NOT. Their rects are both
           viewport-relative, so navBottom is a constant (~84) while heroTop moves
           with the scroll — subtracting one from the other without correcting for
           scroll makes `gap` a function of scroll position.

           That is the white block above the hero. Scrolled down by S when this
           runs (back/forward navigation restores scroll BEFORE the 100ms pass
           below; a resize while scrolled does it too; on mobile the URL bar
           collapsing fires resize on its own), heroTop comes back S px too small,
           so marginTop is set S px too LARGE and the hero is pushed down by
           exactly the amount the page was scrolled. At scroll 0 it is invisible,
           which is why this survived so long.

           Measuring the hero in DOCUMENT coordinates removes the dependency:
           at scroll 0 the result is identical to before, and at any other scroll
           position it is now the same number. */
        var scrollY    = window.pageYOffset || document.documentElement.scrollTop || 0;
        var navBottom  = nav.getBoundingClientRect().bottom;
        var heroTopDoc = hero.getBoundingClientRect().top + scrollY;
        var gap = heroTopDoc - navBottom;
        /* Belt and braces. The legitimate gap is the hero figure's own margin —
           tens of pixels. Anything wilder than this means a measurement was taken
           mid-layout, and leaving the margin alone is always better than shoving
           the hero off screen. */
        if (Math.abs(gap) > 200) return;
        hero.style.marginTop = (-gap) + 'px';
    }
    document.addEventListener('DOMContentLoaded', function() {
        alignHeroToNav();
        setTimeout(alignHeroToNav, 100);
    });
    /* bfcache restores fire no DOMContentLoaded, so a page returned to via the
       back button never re-aligned. It also restores scroll — which is precisely
       the case the scroll correction above exists for. */
    window.addEventListener('pageshow', function(e) { if (e.persisted) alignHeroToNav(); });
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

/* ── Project detail entrance choreography ────────────────────────────────────
   The last page on the site with no entrance. Ordered by ROLE:

     title words  ->  category  ->  grade  ->  record rows (wipe)
                  ->  the two prose groups  ->  the CTA

   Local rather than bolted onto cognak-global.js's SELECTORS, for the same
   reason /studio's manifesto is: the global splitter animates each element the
   moment IT intersects, which cannot express an ordering across siblings. It
   also could not be scoped safely — `.title` is the class on the prev/next
   pagers too, so a global selector would stagger those as well.

   Reuses the site's own `.stagger-word` / `.stagger-in` spec (28ms cadence,
   inline-block at opacity 0 so the words hold their space and nothing
   reflows). Everything else rides `.pd-in`.

   The splitter walks TEXT NODES ONLY, exactly like the global one — the title
   is plain text on every project, but if an <em> is ever added to a project
   title it will NOT stagger, it will appear immediately. That is the same
   limitation that forced `headline-accent-fade` elsewhere on the site. */
(function () {
  var info = document.querySelector('.template-single-project .information');
  if (!info) return;

  var reduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var title    = info.querySelector('.title');
  var category = info.querySelector('.category');
  var vintage  = info.querySelector('.project-vintage');
  var rows     = Array.prototype.slice.call(info.querySelectorAll('.details-extra .col p'));
  var groups   = Array.prototype.slice.call(info.querySelectorAll('.details-main .col'));
  var cta      = info.querySelector('.info-invite');

  // Reduced motion: the CSS already restores everything. Don't split the title
  // into spans it will never animate — leave the markup alone.
  if (reduced) return;

  var WORD_MS  = 28;   // matches the site-wide stagger cadence
  var ROW_MS   = 70;   // between record rows
  var GROUP_MS = 80;   // between the two prose groups (the audit's number)

  function splitWords(el) {
    if (!el || el.dataset.pdSplit) return [];
    el.dataset.pdSplit = '1';
    var out = [];
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(function (node) {
      var parts = node.nodeValue.split(/(\s+)/);
      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        var span = document.createElement('span');
        span.className = 'stagger-word';
        span.textContent = part;
        frag.appendChild(span);
        out.push(span);
      });
      node.parentNode.replaceChild(frag, node);
    });
    return out;
  }

  var words = splitWords(title);
  /* Reveal the container the moment the words exist and are individually
     hidden. `html.js .information .title{opacity:0}` holds it from first paint
     so the unsplit headline never flashes; if this line is ever removed the
     title stays invisible forever. */
  if (title) title.style.opacity = '1';

  function play() {
    var t = 0;
    words.forEach(function (w, i) {
      setTimeout(function () { w.classList.add('stagger-in'); }, i * WORD_MS);
    });
    t = words.length * WORD_MS + 90;

    if (category) setTimeout(function () { category.classList.add('pd-in'); }, t);
    t += 110;
    if (vintage) setTimeout(function () { vintage.classList.add('pd-in'); }, t);
    t += 130;

    /* Rows are handed their stagger as a custom property the CSS transition
       reads, rather than one timer each — same approach as the /brief Sent
       screen and the gallery reveal. One class add, the CSS does the rest. */
    rows.forEach(function (p, i) { p.style.setProperty('--pd-d', (i * ROW_MS) + 'ms'); });
    setTimeout(function () {
      rows.forEach(function (p) { p.classList.add('pd-in'); });
    }, t);
    t += rows.length * ROW_MS + 120;

    groups.forEach(function (col, i) {
      setTimeout(function () { col.classList.add('pd-in'); }, t + i * GROUP_MS);
    });
    t += groups.length * GROUP_MS + 120;

    if (cta) setTimeout(function () { cta.classList.add('pd-in'); }, t);
  }

  /* The hero is tall, so on most viewports the information block starts just
     below the fold — but not always (short heroes, long titles, zoomed-out
     windows). Fire immediately if it is already showing, otherwise wait for it. */
  var rect = info.getBoundingClientRect();
  if (rect.top < window.innerHeight * 0.9) {
    setTimeout(play, 260);
  } else if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      play();
    }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });
    obs.observe(info);
  } else {
    play();
  }
})();

/* ── Hero video: resume on re-entry ──────────────────────────────────────────
   Chrome pauses an off-screen muted autoplay video to save power, and does not
   reliably resume it when you scroll back. Combined with a missing poster that
   produced a blank white block where the hero should be — the figure kept its
   793px, the video kept its 793px, and nothing painted. The poster (added in
   [slug].astro) means the element always has SOMETHING to draw; this makes it
   move again.

   Also pauses on exit, deliberately: an off-screen looping video decoding
   frames nobody can see is pure battery. That's what the browser was trying to
   do on its own — this just makes the resume half reliable.

   `play()` returns a promise that rejects if the browser declines (a tab in the
   background, a power-saving mode). Caught and ignored: a hero that stays on
   its poster frame is a fine outcome, an unhandled rejection in the console is
   not. */
(function () {
  var video = document.querySelector('.hero-video');
  if (!video || !('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var pr = video.play();
        if (pr && pr.catch) pr.catch(function () {});
      } else if (!video.paused) {
        video.pause();
      }
    });
  }, { threshold: 0 }).observe(video);
})();
