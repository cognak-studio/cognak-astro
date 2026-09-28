/* Lenis smooth scroll init — loaded after the Lenis CDN script (all pages). */
(function() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.addEventListener('DOMContentLoaded', function() {
        // The library comes from a CDN. If it's blocked (extension, corporate
        // network) or slow to arrive, fall back to native scrolling instead of
        // throwing a ReferenceError. Everything else reads window._lenis
        // defensively already.
        if (typeof Lenis === 'undefined') return;
        var lenis = new Lenis({
            duration: 1.2,
            easing: function(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
            wheelMultiplier: 0.6,
        });
        function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
        requestAnimationFrame(raf);
        window._lenis = lenis;
    });
})();
