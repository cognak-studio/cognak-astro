/* COGNAK homepage scripts — ported verbatim from functions.php + index.php.
   Front page only. Loaded deferred at end of body. */

/* ── Home nav mode (scroll-driven bottom bar → top nav) ───────────────────── */
(function() {
    var bar      = document.querySelector('.home-bottom-bar');
    var homeNav  = document.querySelector('.home-nav');
    var stage    = document.querySelector('.hero-scroll-stage');
    if (!bar || !stage) return;

    var isMobile = window.matchMedia('(max-width: 720px)').matches;

    var navLinks = null;
    if (homeNav) {
        navLinks = document.createElement('div');
        navLinks.className = 'home-nav-links-mobile';
        navLinks.style.cssText = 'display:none;gap:24px;align-items:center;';
        homeNav.querySelectorAll('a').forEach(function(a) {
            var clone = a.cloneNode(true);
            clone.style.cssText = "font-family:'Diatype Variable',sans-serif;font-size:14px;font-weight:400;color:rgba(255,255,255,0.6);text-decoration:none;letter-spacing:0.04em;";
            navLinks.appendChild(clone);
        });
        bar.appendChild(navLinks);
    }

    if (isMobile) {
        // On mobile, let the bar's flex layout (justify-content: space-between)
        // place navLinks at the right naturally — no absolute positioning or
        // transforms, which can detach from the bar during overscroll gestures.
        if (navLinks) {
            navLinks.style.display = 'flex';
        }
        if (homeNav) homeNav.style.display = 'none';
        // Drop the frosted backdrop-filter on mobile: the bar rides UP over the
        // animating WebGL hero every frame, and a moving backdrop-filter has to
        // re-blur that live content each frame — it dropped frames and made the
        // hero "catch" around mid-viewport (worst over the bright headline). The
        // background tint alone carries the nav here. Element-inline !important
        // beats the .home-bottom-bar.nav-mode blur rule set in BaseLayout's head.
        bar.style.setProperty('backdrop-filter', 'none', 'important');
        bar.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    }

    function update() {
        var stageBottom = stage.getBoundingClientRect().bottom;
        var barH        = bar.offsetHeight;

        // Top hero halos (Projects/Studio nav + cookie banner) are fixed, so their
        // soft bottom edges would otherwise linger over the content scrolling up
        // beneath them until home-scrolled finally fires. Fade them out within the
        // first ~40% of a viewport scroll instead, so they're gone before the hero
        // edge passes — no shadow flash below the WebGL area.
        var scrolled = Math.max(0, window.innerHeight - stageBottom);
        var haloOpacity = Math.max(0, Math.min(1, 1 - scrolled / (window.innerHeight * 0.4)));
        document.documentElement.style.setProperty('--hero-halo-opacity', haloOpacity);

        // Nav/location/email halos are fixed. Keep them for the whole hero scroll
        // and only fade once the hero has actually scrolled out (its bottom edge
        // reaches the top bar). The cookie halo is excluded — it stays always.
        document.documentElement.classList.toggle('home-scrolled', stageBottom <= barH);

        if (isMobile) {
            // Mobile: two-phase only — no intermediate tracking.
            // During the hero, use position:absolute so the bar scrolls
            // naturally with the page (locked to the hero's bottom edge).
            // Once the hero is gone, switch to position:fixed at the top.
            if (stageBottom <= barH) {
                bar.classList.add('nav-mode');
                bar.style.position = 'fixed';
                bar.style.top = '0';
                bar.style.bottom = 'auto';
            } else {
                // Nav bg fades IN the moment the user scrolls off the top and OUT
                // when they return to it. Binary toggle — the fade itself is a
                // time-based CSS transition (see .home-bottom-bar in custom.css,
                // which transitions both background and the frost blur).
                bar.classList.toggle('nav-mode', window.pageYOffset > 0);
                bar.style.position = 'absolute';
                // stageBottom (viewport-relative) + pageYOffset = document-relative
                // position of the stage's bottom edge — constant as user scrolls,
                // so the bar stays locked to the hero's bottom and scrolls with it.
                bar.style.top = (stageBottom + window.pageYOffset - barH) + 'px';
                bar.style.bottom = 'auto';
            }
        } else if (stageBottom <= barH) {
            // Desktop: Hero scrolled fully past — pin bar to top
            bar.classList.add('nav-mode');
            bar.style.top = '0';
            bar.style.bottom = 'auto';
        } else if (stageBottom < window.innerHeight) {
            // Desktop: Hero partially visible — follow stage bottom upward
            bar.classList.add('nav-mode');
            bar.style.top = Math.max(0, stageBottom - barH) + 'px';
            bar.style.bottom = 'auto';
        } else {
            // Desktop: Hero fully visible — let CSS bottom:0 handle it
            bar.classList.remove('nav-mode');
            bar.style.top = '';
            bar.style.bottom = '';
        }

        if (stageBottom <= barH + 55) {
            bar.classList.add('nav-swapped');
            // On desktop: show navLinks now that hero has scrolled out.
            // On mobile: navLinks are always shown (set above); just add class.
            if (!isMobile && navLinks) navLinks.style.display = 'flex';
            if (homeNav) { homeNav.style.opacity = '0'; homeNav.style.pointerEvents = 'none'; }
        } else {
            bar.classList.remove('nav-swapped');
            // On desktop: hide navLinks while still in hero.
            // On mobile: keep navLinks always visible.
            if (!isMobile && navLinks) navLinks.style.display = 'none';
            if (homeNav && window.cognak_entrance_done) { homeNav.style.opacity = '1'; homeNav.style.pointerEvents = ''; }
        }
    }

    var _scrollTick = false;
    window.addEventListener('scroll', function() {
        if (!_scrollTick) {
            _scrollTick = true;
            requestAnimationFrame(function() { update(); _scrollTick = false; });
        }
    }, { passive: true });
    window.addEventListener('resize', update);
    requestAnimationFrame(update);
})();

/* ── Hero WebGL fade-in + choreographed entrance ──────────────────────────── */
(function() {
    var webglEl = document.querySelector('.hero-webgl');
    if (webglEl) {
        function onWebglReady() {
            webglEl.classList.add('webgl-ready');
            var hl = document.querySelector('.hero-center-headline');
            if (hl) hl.classList.add('hero-hl-ready');
        }
        var observer = new MutationObserver(function(mutations) {
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes.length) {
                    observer.disconnect();
                    setTimeout(onWebglReady, 80);
                    return;
                }
            }
        });
        observer.observe(webglEl, { childList: true });
        setTimeout(onWebglReady, 2000);
    }

    window.cognak_entrance_done = false;

    setTimeout(function() {
        window.cognak_entrance_done = true;
        // On mobile the top-right .home-nav is intentionally hidden and replaced
        // by the cloned links in the bottom bar — don't reveal it here, or the two
        // navs collide and Projects/Studio overflow off the right edge.
        var nav = document.querySelector('.home-nav');
        if (nav && !window.matchMedia('(max-width: 720px)').matches) {
            nav.style.transition = 'opacity 1s ease';
            nav.style.opacity = '1';
            nav.style.pointerEvents = 'auto';
            setTimeout(function() { nav.style.transition = 'none'; }, 1050);
        }
        window.dispatchEvent(new Event('scroll'));
    }, 1000);
})();

/* ── Homepage lazy-load fade-in ───────────────────────────────────────────── */
(function() {
    function initLazy() {
        var imgs = Array.prototype.slice.call(document.querySelectorAll('.hp-lazy'));
        if (!imgs.length) return;
        if (!('IntersectionObserver' in window)) {
            imgs.forEach(function(img) { img.classList.add('hp-lazy-loaded'); });
            return;
        }
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (!entry.isIntersecting) return;
                var img = entry.target;
                if (img.complete) {
                    img.classList.add('hp-lazy-loaded');
                } else {
                    img.addEventListener('load', function() { img.classList.add('hp-lazy-loaded'); }, { once: true });
                }
                observer.unobserve(img);
            });
        }, { threshold: 0.1 });
        imgs.forEach(function(img) { observer.observe(img); });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLazy);
    } else {
        initLazy();
    }
})();

/* ── Sparkle effect on .hp-highlight ──────────────────────────────────────── */
(function() {
    var el = document.querySelector('.hp-highlight');
    if (!el) return;
    var chars = ['✦', '✧', '✦', '✧', '✦'];
    function spawn() {
        var rect = el.getBoundingClientRect();
        var s = document.createElement('span');
        s.className = 'hp-sparkle';
        s.textContent = chars[Math.floor(Math.random() * chars.length)];
        var x = (Math.random() * (rect.width + 20)) - 10;
        var y = (Math.random() * (rect.height + 16)) - 8;
        s.style.left = x + 'px';
        s.style.top  = y + 'px';
        el.appendChild(s);
        setTimeout(function() { if (s.parentNode) s.parentNode.removeChild(s); }, 900);
    }
    setInterval(spawn, 150);
})();

/* ── Homepage project hover metadata (JSON typewriter) ────────────────────── */
(function() {
    var cards = document.querySelectorAll('#hp-grid .project-excerpt');
    if (!cards.length) return;

    var metaEl = document.createElement('div');
    metaEl.id = 'project-hover-meta';
    document.body.appendChild(metaEl);

    var twTimer = null;
    var exitTimer = null;
    var metaVisible = 0;
    var startWrap = document.querySelector('.hp-start-wrap');

    var TYPE_MS    = 18;   // type-in cadence
    var ERASE_MS   = 9;    // backspace runs at 2x, per the audit
    /* A card->card move fires mouseleave then mouseenter. Without a grace the
       erase starts and is immediately clobbered by the new record, which reads
       as a flicker. The grace lets leaving the GRID rub the record out while a
       move BETWEEN cards stays a clean swap. */
    var EXIT_GRACE = 60;

    var REDUCED = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function scrollFade() {
        if (!startWrap) return 1;
        var vh  = window.innerHeight;
        var top = startWrap.getBoundingClientRect().top;
        return Math.max(0, Math.min(1, (top - (vh - 240)) / 240));
    }

    function applyOpacity() {
        metaEl.style.opacity = String(metaVisible * scrollFade());
    }

    window.addEventListener('scroll', applyOpacity, { passive: true });
    window.addEventListener('resize', applyOpacity);

    /* The set-dressing fields below used to be Math.random() PER HOVER, so
       re-hovering the same tile reported a different render_id, a different
       revision count and a flipped NDA status — the record contradicted itself
       and the terminal fiction fell over. Seeded from an FNV-1a hash of the
       project title instead: fixed identity per project, stable across hovers
       and reloads, nothing to hand-author. Same fix, same reason, as the
       /studio reel's POOL metadata. */
    function fnv1a(str) {
        var h = 0x811c9dc5;
        for (var i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return h >>> 0;
    }

    // One seed has to feed three fields, so wrap it in a small LCG. Callers
    // must pull in a FIXED order for the values to stay stable.
    function seededRand(seed) {
        var s = seed >>> 0;
        return function() {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    function seededHex(rand, len) {
        var out = '';
        while (out.length < len) out += Math.floor(rand() * 4294967296).toString(16);
        return out.slice(0, len);
    }

    function buildMeta(card) {
        var title = card.dataset.projectTitle || '';
        var rand  = seededRand(fnv1a(title || card.dataset.projectType || 'cognak'));
        var type  = card.dataset.projectType  || '';
        var year  = card.dataset.projectYear  || '';
        var dateS = parseInt(card.dataset.projectDate || '0', 10);
        var fields = [];
        if (title) fields.push('  "project": "' + title.toLowerCase() + '"');
        if (type)  fields.push('  "type": "' + type + '"');
        if (year)  fields.push('  "year": ' + year);
        /* Real values, unlike the set-dressing below: vintage + cask grade from
           the project date. VS < 4y, VSOP 4-10y, XO 10y+ (BNIC, roughly). */
        if (dateS > 0 && dateS < Date.now() / 1000) {
            var yrs   = (Date.now() / 1000 - dateS) / 31557600;
            var grade = yrs >= 10 ? 'xo' : yrs >= 4 ? 'vsop' : 'vs';
            var w     = Math.floor(yrs);
            var m     = Math.floor((yrs - w) * 12);
            fields.push('  "vintage": ' + new Date(dateS * 1000).getFullYear());
            fields.push('  "aged": "' + (w > 0 ? w + 'y ' : '') + m + 'm"');
            fields.push('  "cask": "' + grade + '"');
        }
        fields.push('  "render_id": "' + seededHex(rand, 6) + '"');
        fields.push('  "revisions": ' + (Math.floor(rand() * 8) + 1));
        fields.push('  "nda": ' + (rand() > 0.5 ? 'true' : 'false'));
        return '{\n' + fields.join(',\n') + '\n}';
    }

    function typewrite(text) {
        clearTimeout(twTimer);
        clearTimeout(exitTimer);
        metaEl.textContent = '';
        metaVisible = 1;
        applyOpacity();
        var i = 0;
        (function tick() {
            if (i >= text.length) return;
            metaEl.textContent += text[i++];
            twTimer = setTimeout(tick, TYPE_MS);
        })();
    }

    function hideMeta() {
        metaEl.textContent = '';
        metaVisible = 0;
        applyOpacity();
    }

    // Backspace the record out rather than letting stale meta linger over a
    // grid nobody is pointing at.
    function backspace() {
        clearTimeout(twTimer);
        if (REDUCED) { hideMeta(); return; }
        (function tick() {
            var t = metaEl.textContent;
            if (!t.length) { hideMeta(); return; }
            metaEl.textContent = t.slice(0, -1);
            twTimer = setTimeout(tick, ERASE_MS);
        })();
    }

    cards.forEach(function(card) {
        card.addEventListener('mouseenter', function() {
            typewrite(buildMeta(card));
        });
        card.addEventListener('mouseleave', function() {
            clearTimeout(exitTimer);
            exitTimer = setTimeout(backspace, EXIT_GRACE);
        });
    });

    var gridSection = document.querySelector('.hp-grid-section');
    if (gridSection) {
        new IntersectionObserver(function(entries) {
            if (!entries[0].isIntersecting) {
                clearTimeout(twTimer);
                clearTimeout(exitTimer);
                metaVisible = 0;
                applyOpacity();
            }
        }, { threshold: 0 }).observe(gridSection);
    }
})();

/* ── Definition <h1> + description typewriter (from index.php) ─────────────── */
(function() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var SPEED = 18;

    function animateH1(onDone) {
        var h1 = document.querySelector('.hp-def');
        if (!h1) { onDone && onDone(); return; }
        var saved = h1.innerHTML;

        h1.innerHTML =
            '<b>' +
              '<span class="hp-def-name">' +
                '<span class="hp-tw-n1"></span>' +
                '<span class="hp-def-dot" aria-hidden="true" style="display:none">&middot;</span>' +
                '<span class="hp-tw-n2"></span>' +
              '</span>' +
              '<span class="hp-def-pron" style="display:none"><span class="hp-tw-pr"></span></span>' +
            '</b>' +
            ' <span class="hp-def-noun" style="display:none"><span class="hp-tw-no"></span></span>';

        var n1      = h1.querySelector('.hp-tw-n1');
        var dot     = h1.querySelector('.hp-def-dot');
        var n2      = h1.querySelector('.hp-tw-n2');
        var pronOut = h1.querySelector('.hp-def-pron');
        var pr      = h1.querySelector('.hp-tw-pr');
        var nounOut = h1.querySelector('.hp-def-noun');
        var no      = h1.querySelector('.hp-tw-no');

        var cur = document.createElement('span');
        cur.className = 'hp-tw-cursor';
        cur.setAttribute('aria-hidden', 'true');
        cur.textContent = '|';

        function makeTyper(el) {
            var s = '';
            el.textContent = '';
            el.appendChild(cur);
            return {
                type: function(text, cb) {
                    var i = 0;
                    (function tick() {
                        if (i < text.length) {
                            s += text[i++]; el.textContent = s; el.appendChild(cur);
                            setTimeout(tick, SPEED);
                        } else { cb(); }
                    })();
                }
            };
        }

        var t1 = makeTyper(n1);
        setTimeout(function() {
            t1.type('CO', function() {
                dot.style.display = '';
                var t2 = makeTyper(n2);
                t2.type('GNAK', function() {
                    pronOut.style.display = '';
                    var tp = makeTyper(pr);
                    tp.type('/'+ '‘' +'kön,yak, '+ '‘' +'kän,yak/', function() {
                        nounOut.style.display = '';
                        var tn = makeTyper(no);
                        tn.type('noun', function() {
                            cur.style.transition = 'opacity 0.3s ease';
                            cur.style.opacity = '0';
                            setTimeout(function() { h1.innerHTML = saved; onDone && onDone(); }, 350);
                        });
                    });
                });
            });
        }, 120);
    }

    function buildChars(segments) {
        var out = [];
        segments.forEach(function(s) {
            if (s.br) { out.push({ br: true }); }
            else { s.text.split('').forEach(function(c) { out.push({ c: c }); }); }
        });
        return out;
    }

    function animateDesc(el, segments) {
        if (!el) return;
        var saved = el.innerHTML;
        el.style.minHeight = el.offsetHeight + 'px';
        el.innerHTML = '<span class="hp-tw-cursor" aria-hidden="true">|</span>';
        var cursor = el.querySelector('.hp-tw-cursor');
        var chars = buildChars(segments);
        var i = 0;
        function tick() {
            if (i >= chars.length) {
                cursor.style.transition = 'opacity 0.35s ease';
                cursor.style.opacity = '0';
                setTimeout(function() { el.innerHTML = saved; el.style.minHeight = ''; }, 400);
                return;
            }
            var ch = chars[i++];
            if (ch.br) { cursor.insertAdjacentHTML('beforebegin', '<br>'); }
            else { cursor.insertAdjacentText('beforebegin', ch.c); }
            setTimeout(tick, SPEED);
        }
        setTimeout(tick, 0);
    }

    function onReady(fn) {
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', fn); }
        else { fn(); }
    }

    onReady(function() {
        var desktopSegs = [
            { text: 'An award-winning design and development studio,' },
            { br: true },
            { text: 'distilled with a clean, smooth look and feel.' }
        ];
        var mobileSegs = [
            { text: 'An award-winning design and' },
            { br: true },
            { text: 'development studio, distilled with' },
            { br: true },
            { text: 'a clean, smooth look and feel.' }
        ];

        var target      = document.querySelector('.hp-def');
        var descDesktop = document.querySelector('.hp-desc-desktop');
        var descMobile  = document.querySelector('.hp-desc-mobile');
        if (!target) return;

        target.style.visibility = 'hidden';
        if (descDesktop) descDesktop.style.visibility = 'hidden';
        if (descMobile)  descMobile.style.visibility  = 'hidden';

        function start() {
            target.style.visibility = '';
            animateH1(function() {
                if (descDesktop) descDesktop.style.visibility = '';
                if (descMobile)  descMobile.style.visibility  = '';
                animateDesc(descDesktop, desktopSegs);
                animateDesc(descMobile,  mobileSegs);
            });
        }

        if (!('IntersectionObserver' in window)) { setTimeout(start, 400); return; }

        var rect = target.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
            setTimeout(start, 400);
        } else {
            var obs = new IntersectionObserver(function(entries) {
                if (entries[0].isIntersecting) { obs.disconnect(); start(); }
            }, { rootMargin: '-20% 0px -20% 0px', threshold: 0 });
            obs.observe(target);
        }
    });
})();

/* ── "+ more" load-more reveal (from index.php) ───────────────────────────── */
(function() {
    var btn = document.getElementById('hp-load-more');
    if (!btn) return;
    var loaded = false;

    var label = btn.querySelector('.hp-more-label');
    var wMore = btn.querySelector('.hp-more-word--more');
    var wAll  = btn.querySelector('.hp-more-word--all');

    /* Measure BOTH labels and hand them to CSS as --w-more / --w-all so the
       button can transition its width instead of snapping. Measured, not
       guessed: the words are a variable font at a clamp()ed size, so the ratio
       changes with the viewport. Re-measured on fonts.ready (the fallback face
       is a different width) and on resize (the clamp moves).
       offsetWidth is fine here even though .hp-more-word--all is absolutely
       positioned — it's laid out, just out of flow. */
    function measure() {
        if (!label || !wMore || !wAll) return;
        var a = Math.ceil(wMore.getBoundingClientRect().width);
        var b = Math.ceil(wAll.getBoundingClientRect().width);
        if (!a || !b) return;
        label.style.setProperty('--w-more', a + 'px');
        label.style.setProperty('--w-all',  b + 'px');
    }
    measure();
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(measure);
    }
    window.addEventListener('resize', measure);

    /* The button stops revealing and starts navigating, so it has to stop
       claiming to reveal. Widths must already be set or the label collapses. */
    function exhaust() {
        measure();
        btn.classList.add('is-exhausted');
        btn.setAttribute('aria-label', 'View all projects');
    }

    // Nothing hidden to begin with (6 or fewer featured projects) — the button
    // was never a reveal control, so say so from the start, with no animation.
    if (!document.querySelector('#hp-grid .hp-hidden')) {
        loaded = true;
        exhaust();
    }

    btn.addEventListener('click', function(e) {
        // Already exhausted: fall through to the <a href> and navigate.
        if (loaded) return;
        e.preventDefault();
        loaded = true;

        var toShow = Array.prototype.slice.call(
            document.querySelectorAll('#hp-grid .hp-hidden')
        );

        if (!toShow.length) {
            window.location.href = btn.getAttribute('href') || '/projects';
            return;
        }

        toShow.forEach(function(el, i) {
            el.classList.remove('hp-hidden');
            el.classList.add('hp-reveal');
            el.getBoundingClientRect();
            setTimeout(function() {
                el.classList.add('hp-visible');
            }, i * 90);
        });

        var revealDuration = (toShow.length - 1) * 90 + 400;
        setTimeout(function() {
            if (window._lenis) { window._lenis.resize(); }
            // Morph AFTER the last tile lands, not on click: the new label is a
            // reaction to the grid being complete, and morphing mid-reveal
            // would compete with the tiles for attention.
            exhaust();
        }, revealDuration);
    });
})();

/* ── Hero phrase scramble (from index.php) ────────────────────────────────── */
(function() {
    var el        = document.getElementById('hero-phrase');
    var makeEl    = document.getElementById('hero-make');
    var somethingEl = document.getElementById('hero-something');
    var hl        = document.querySelector('.hero-center-headline');
    if (!el || !hl) return;

    var isMobilePhrases = window.matchMedia('(max-width: 720px)').matches;

    // On mobile, \n in a phrase renders as <br> so words stack.
    // "with intention" stays one line; "worth noticing" and "to outlast trends"
    // break at the positions the user specified.
    function setPhrase(text) {
        if (isMobilePhrases && text.indexOf('\n') !== -1) {
            el.innerHTML = text.replace(/\n/g, '<br>');
        } else {
            el.textContent = text;
        }
    }

    function typeIn(target, setFn, onDone) {
        var i = 0;
        var t = setInterval(function() {
            setFn(target.slice(0, ++i));
            if (i >= target.length) { clearInterval(t); if (onDone) onDone(); }
        }, 55);
    }

    var initialPhrase = isMobilePhrases ? 'worth\nnoticing' : 'worth noticing';

    function startTypeSequence() {
        typeIn('Make', function(t) { if (makeEl) makeEl.textContent = t; }, function() {
            setTimeout(function() {
                typeIn('something', function(t) { if (somethingEl) somethingEl.textContent = t; }, function() {
                    setTimeout(function() {
                        typeIn(initialPhrase, function(t) { setPhrase(t); }, null);
                    }, 80);
                });
            }, 80);
        });
    }

    var hlObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            if (m.type === 'attributes' && hl.classList.contains('hero-hl-ready')) {
                hlObserver.disconnect();
                startTypeSequence();
            }
        });
    });
    hlObserver.observe(hl, { attributes: true, attributeFilter: ['class'] });

    var phrases = isMobilePhrases ? [
        'worth\nnoticing',
        'that lasts',
        'to outlast\ntrends',
        'moving',
        'with intention',
        'human',
        'considered'
    ] : [
        'worth noticing',
        'that lasts',
        'to outlast trends',
        'moving',
        'with intention',
        'human',
        'considered'
    ];
    var current = 0;
    var timer   = null;
    var ready   = true;
    var isOver  = false;

    function triggerTypeout() {
        if (!ready || timer) return;
        current = (current + 1) % phrases.length;
        var target = phrases[current];
        var i = 0;
        hl.setAttribute('aria-label', 'Make something ' + target.replace(/\n/g, ' '));
        el.innerHTML = '';
        timer = setInterval(function() {
            if (i < target.length) {
                setPhrase(target.slice(0, i + 1));
                i++;
            } else {
                setPhrase(target);
                clearInterval(timer);
                timer = null;
            }
        }, 55);
    }

    var cur = document.getElementById('cognak-cursor');
    document.addEventListener('mousemove', function(e) {
        var rect = el.getBoundingClientRect();
        var over = e.clientX >= rect.left && e.clientX <= rect.right &&
                   e.clientY >= rect.top  && e.clientY <= rect.bottom;
        if (over && !isOver) {
            isOver = true;
            triggerTypeout();
            if (cur) { cur.classList.remove('is-link','is-home','is-project'); cur.classList.add('is-phrase'); }
        }
        if (!over && isOver) {
            isOver = false;
            if (cur) cur.classList.remove('is-phrase');
        }
    });

    document.addEventListener('touchstart', function(e) {
        if (!ready) return;
        var t    = e.touches[0];
        var rect = el.getBoundingClientRect();
        if (t.clientX >= rect.left && t.clientX <= rect.right &&
            t.clientY >= rect.top  && t.clientY <= rect.bottom) {
            triggerTypeout();
        }
    }, { passive: true });
})();

/* ── Homepage card tilt (lerp) (from index.php) ───────────────────────────── */
(function() {
    var cards = document.querySelectorAll('#hp-grid .project-excerpt');
    cards.forEach(function(card) {
        var tX = 0, tY = 0, cX = 0, cY = 0;
        var hovering = false, raf = null;
        var hoverVid = card.querySelector('video.hp-hover-media');

        function lerp(a, b, t) { return a + (b - a) * t; }

        function tick() {
            cX = lerp(cX, tX, 0.07);
            cY = lerp(cY, tY, 0.07);
            card.style.transform = 'perspective(800px) rotateY(' + cX.toFixed(3) + 'deg) rotateX(' + cY.toFixed(3) + 'deg)';
            if (hovering || Math.abs(cX) > 0.02 || Math.abs(cY) > 0.02) {
                raf = requestAnimationFrame(tick);
            } else {
                card.style.transform = '';
                raf = null;
            }
        }

        card.addEventListener('mouseenter', function() {
            hovering = true;
            if (!raf) raf = requestAnimationFrame(tick);
            if (hoverVid) {
                var pr = hoverVid.play();
                if (pr && pr.catch) pr.catch(function() {});
            }
        });
        card.addEventListener('mousemove', function(e) {
            var r = card.getBoundingClientRect();
            tX =  ((e.clientX - r.left) / r.width  - 0.5) * 6;
            tY = -((e.clientY - r.top)  / r.height - 0.5) * 6;
        });
        card.addEventListener('mouseleave', function() {
            hovering = false;
            tX = 0; tY = 0;
            if (!raf) raf = requestAnimationFrame(tick);
            if (hoverVid) { hoverVid.pause(); hoverVid.currentTime = 0; }
        });
    });
})();

/* ── Homepage dust motes — full dark section (canvas in .homepage-main) ───── */
(function() {
    var section = document.querySelector('.homepage-main');
    var canvas  = document.getElementById('hp-particles-canvas');
    if (!section || !canvas) return;

    var ctx = canvas.getContext('2d');
    var W, H, particles = [];
    var mouse    = { x: -9999, y: -9999 };
    var isMobile = window.innerWidth <= 720;

    /* ── Weather-reactive drizzle ────────────────────────────────────────────
       The motes are dust in a projector beam: they RISE. When it's actually
       raining in LA they fall instead. Zero extra network — cognak-global.js
       already fetches the reading for the temperature pill and now republishes
       it as window.COGNAK_WX + a `cognak:weather` event.

       rainT is lerped, never switched. A hard flip mid-flight reads as a bug:
       several hundred points reversing on one frame. At 0.01/frame the change
       takes ~1.7s, which the existing 0.97 damping absorbs into something that
       looks like the air in the room changing.

       TESTABLE ON DEMAND, two ways: it rains in Los Angeles about 35 days a
       year, so this would otherwise ship unseen and rot silently.
         1. Type "rain" anywhere on the homepage — a toggle, same easter-egg
            pattern as the "cognak" sparkle burst in cognak-global.js.
         2. `window.COGNAK_RAIN_DEBUG = true` in the console.
       syncWeather() is re-polled every 60 frames precisely so the console flag
       works without dispatching an event by hand.

       The override is a TOGGLE, not a latch: typing "rain" a second time hands
       control back to the real forecast. If it genuinely is raining in LA, the
       motes stay falling — the override can force rain on, but it deliberately
       can't force the actual weather off. */
    var rainT = 0, rainTarget = 0, wxPoll = 0;

    function syncWeather() {
        var wx = window.COGNAK_WX;
        rainTarget = (window.COGNAK_RAIN_DEBUG || (wx && wx.rain)) ? 1 : 0;
    }
    syncWeather();
    window.addEventListener('cognak:weather', syncWeather);

    /* Type "rain". Deliberately the same matcher shape as the "cognak" egg:
       reset while a form field has focus (otherwise typing a brief with the
       word "rain" in it starts a storm), and a restart-on-first-letter fallback
       so "rrain" still fires. This lives HERE rather than in cognak-global.js
       because the whole block early-returns without the canvas — which scopes
       the egg to the homepage for free. */
    (function() {
        var SEQ = 'rain', pos = 0;
        document.addEventListener('keydown', function(e) {
            var tag = document.activeElement ? document.activeElement.tagName : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') { pos = 0; return; }
            if (e.metaKey || e.ctrlKey || e.altKey) { pos = 0; return; }
            var k = (e.key || '').toLowerCase();
            pos = (k === SEQ[pos]) ? pos + 1 : (k === SEQ[0] ? 1 : 0);
            if (pos === SEQ.length) {
                pos = 0;
                window.COGNAK_RAIN_DEBUG = !window.COGNAK_RAIN_DEBUG;
                syncWeather();
            }
        });
    })();

    /* Sparse "dust in a projector beam" density, scaled to section area */
    function targetCount() {
        return Math.max(200, Math.min(900, Math.round(W * H / 4500)));
    }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
        W = section.offsetWidth;
        H = section.offsetHeight + 180;
        /* Render at device resolution so the points stay sharp on retina */
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var n = targetCount();
        while (particles.length < n) particles.push(new Particle());
        if (particles.length > n) particles.length = n;
    }

    function Particle() { this.init(true); }
    Particle.prototype.init = function(scatter) {
        // Respawn edge and initial drift follow whichever way the air is
        // currently moving, so a particle recycled mid-transition doesn't
        // immediately swim against the rest of them.
        var falling = rainT > 0.5;
        this.x     = Math.random() * W;
        this.y     = scatter ? Math.random() * H
                   : falling ? -(Math.random() * 30)
                             : H + Math.random() * 30;
        this.vx    = (Math.random() - 0.5) * 0.7;
        this.vy    = (falling ? 1 : -1) * (0.08 + Math.random() * 0.3);
        /* Sharp little points: mostly ~1px, a few slightly larger */
        this.r     = 0.5 + Math.random() * 1.1;
        this.a     = 0.25 + Math.random() * 0.55;
        this.col   = Math.random() > 0.2 ? '159,80,255' : '235,225,255';
        this.timer = 60 + Math.random() * 140;
        this.tw    = Math.random() * Math.PI * 2;      /* glint phase */
        this.twSpd = 0.008 + Math.random() * 0.03;     /* glint speed */
    };
    Particle.prototype.update = function() {
        this.timer--;
        if (this.timer <= 0) {
            /* The wander impulse is what makes these read as DUST. Left at full
               strength while raining it swamps the fall — the vertical kick
               (+-0.35) is the same order as the terminal velocity, so the
               points would jitter downward rather than fall. Damped hard as
               rainT rises; the drift never fully stops, so it stays weather
               rather than a particle grid. */
            var wander = 1 - 0.75 * rainT;
            this.vx += (Math.random() - 0.5) * 0.7 * wander;
            this.vy += ((Math.random() - 0.5) * 0.35 - 0.05) * wander;
            this.timer = 60 + Math.random() * 140;
        }
        if (!isMobile) {
            var dx = this.x - mouse.x, dy = this.y - mouse.y;
            var d  = Math.sqrt(dx*dx + dy*dy);
            if (d < 110 && d > 0) {
                var f = (110 - d) / 110 * 0.6;
                this.vx += dx / d * f;
                this.vy += dy / d * f;
            }
        }
        /* Drizzle: a downward acceleration that grows with rainT, plus extra
           horizontal damping — rain tracks straighter than drifting dust.
           Terminal velocity is set by the 0.97 damping below: 0.018/(1-0.97)
           = 3px/frame, ~175px/s, crossing the section in ~3.7s against the
           dust's ~30s rise. Tuned in three passes: 0.018 (~36px/s, only 2x the
           rise) read as dust drifting the wrong way rather than as weather;
           0.045 (~88px/s) read as falling but sluggish; 0.09 is the one that
           reads as rain. Past ~0.15 the points start to streak and stop being
           recognisably the same motes.
           GRAVITY IS THE ONLY SPEED KNOB — do not raise it by lowering the
           0.97 damping below, which also sets how fast the mouse-repulsion
           impulse and the wander kick decay. */
        if (rainT > 0.001) {
            this.vy += 0.09 * rainT;
            this.vx *= (1 - 0.25 * rainT);
        }
        this.vx *= 0.97; this.vy *= 0.97;
        this.x += this.vx; this.y += this.vy;
        // Recycle at BOTH edges regardless of direction: mid-transition some
        // particles are still travelling the old way and would otherwise sail
        // off and never come back.
        if (this.y < -10 || this.y > H + 40) { this.init(false); }
        if (this.x < 0) this.x = W;
        if (this.x > W) this.x = 0;
    };
    Particle.prototype.draw = function() {
        this.tw += this.twSpd;
        /* Dim most of the time, brief bright glints — dust catching the light */
        var g = 0.5 + 0.5 * Math.sin(this.tw);
        var a = this.a * (0.3 + 0.9 * g * g * g);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + this.col + ',' + Math.min(a, 1) + ')';
        ctx.fill();
    };

    resize();

    (function loop() {
        if (++wxPoll >= 60) { wxPoll = 0; syncWeather(); }
        rainT += (rainTarget - rainT) * 0.01;
        ctx.clearRect(0, 0, W, H);
        particles.forEach(function(p) { p.update(); p.draw(); });
        requestAnimationFrame(loop);
    })();

    if (!isMobile) {
        document.addEventListener('mousemove', function(e) {
            var r = section.getBoundingClientRect();
            mouse.x = e.clientX - r.left;
            mouse.y = e.clientY - r.top;
        });
    }
    window.addEventListener('resize', function() {
        isMobile = window.innerWidth <= 720;
        resize();
    });
    /* Section height changes when the "+ more" grid expands / images lazy-load */
    if ('ResizeObserver' in window) {
        var roT;
        new ResizeObserver(function() {
            clearTimeout(roT);
            roT = setTimeout(resize, 150);
        }).observe(section);
    }
})();
