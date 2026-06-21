/* UnicornStudio init — loaded after the UnicornStudio CDN script (home + studio). */
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (window.UnicornStudio && UnicornStudio.init) { UnicornStudio.init(); }
}
