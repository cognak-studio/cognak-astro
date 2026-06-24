/* UnicornStudio lazy-init (home + studio).
   The WebGL library is heavy, so instead of loading it eagerly we defer it:
   - skipped entirely under prefers-reduced-motion,
   - the CDN script is injected only once a [data-us-project] hero is near the
     viewport, and even then on idle so it never competes with first paint.
   The hero fade-in has its own MutationObserver + timer fallback (see
   cognak-home.js / studio.astro), so a slightly later load is invisible. */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var targets = document.querySelectorAll('[data-us-project]');
  if (!targets.length) return;

  var requested = false;
  function loadUnicorn() {
    if (requested) return;
    requested = true;
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.1.12/dist/unicornStudio.umd.js';
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
