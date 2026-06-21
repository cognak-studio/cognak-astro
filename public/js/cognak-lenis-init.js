/* Lenis smooth scroll init — loaded after the Lenis CDN script (all pages). */
(function() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.addEventListener('DOMContentLoaded', function() {
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
