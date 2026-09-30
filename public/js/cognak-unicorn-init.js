/* UnicornStudio lazy-init (home, studio, brief, send, receive, schedule, proposals).
   The WebGL library is heavy, so instead of loading it eagerly we defer it:
   - skipped entirely under prefers-reduced-motion,
   - the CDN script is injected only once a [data-us-project] hero is near the
     viewport, and even then on idle so it never competes with first paint.
   The hero fade-in has its own MutationObserver + timer fallback (see
   cognak-home.js / studio.astro), so a slightly later load is invisible.
   2026-08-27: pinned version bumped v2.1.12 -> v2.2.12 (current latest) --
   /schedule's own scene was exported at format version 2.2.12 and never
   rendered under the old v2.1.12 runtime, most likely because an OLDER
   parser can't read a NEWER scene format. The public API (init/scenes/
   setScroll/version, same data-us-* attributes) is unchanged between the
   two versions, so this should be a safe forward bump for every other
   page's older-format scene too -- newer parsers reading older scene
   JSON is the normal compatible direction. */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var targets = document.querySelectorAll('[data-us-project]');
  if (!targets.length) return;

  var requested = false;
  function loadUnicorn() {
    if (requested) return;
    requested = true;
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.2.12/dist/unicornStudio.umd.js';
    s.async = true;
    s.onload = function () {
      if (window.UnicornStudio && UnicornStudio.init) UnicornStudio.init();
    };
    document.head.appendChild(s);
  }
  function whenIdle(cb) {
    if ('requestIdleCallback' in window) requestIdleCallback(cb, { timeout: 2500 });
    else setTimeout(cb, 200);
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          io.disconnect();
          whenIdle(loadUnicorn);
          return;
        }
      }
    }, { rootMargin: '200px' });
    targets.forEach(function (t) { io.observe(t); });
  } else {
    // No IntersectionObserver: just load on idle.
    whenIdle(loadUnicorn);
  }
})();
