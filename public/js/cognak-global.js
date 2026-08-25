/* COGNAK global scripts — ported verbatim from cognak-black functions.php
   Loaded on every page (deferred, end of body). Each block is a self-contained
   IIFE, identical to the original wp_add_inline_script payloads. */

/* ── LA clock + weather emoji ─────────────────────────────────────────────── */
(function() {
    var weatherEmoji = '🐃';
    var tempLabel = '';
    var tempHot = false;   // true when LA is over 90°F — triggers the fiery pill

    function getWeatherEmoji(code, isDay) {
        if (code === 0)            return isDay ? '☀️' : '🌘';
        if (code <= 2)             return isDay ? '🌤️' : '🌥️';
        if (code === 3)            return '☁️';
        if (code === 45 || code === 48) return '🌫️';
        if (code <= 55)            return '🌦️';
        if (code <= 65)            return '🌧️';
        if (code <= 77)            return '🌨️';
        if (code <= 82)            return '🌧️';
        if (code <= 86)            return '🌨️';
        return '⛈️';
    }

    /* This closure already knew the LA conditions and kept them to itself —
       everything above is emoji + label. Republishing the raw reading on
       `window` lets other page features react to real weather with NO extra
       network call. First customer: the homepage dust motes, which fall like
       drizzle when it rains (see cognak-home.js).

       WMO weather codes that count as rain: 51-57 drizzle, 61-67 rain,
       80-82 rain showers, 95-99 thunderstorm. 71-77 and 85-86 are SNOW and are
       deliberately excluded — this is Los Angeles, and if it ever does snow
       downtown the motes should not quietly pretend it's rain.

       The event matters as much as the object: the fetch is async and fires
       ~2s after load (or on idle), so any consumer has already started running
       by the time this lands and can't just read the value once at init. */
    function isRainCode(code) {
        return (code >= 51 && code <= 67) ||
               (code >= 80 && code <= 82) ||
               (code >= 95 && code <= 99);
    }

    function publishWeather(code, isDay, tempF) {
        window.COGNAK_WX = {
            code:  code,
            isDay: isDay,
            tempF: tempF,
            rain:  isRainCode(code)
        };
        window.dispatchEvent(new CustomEvent('cognak:weather', {
            detail: window.COGNAK_WX
        }));
    }

    function fetchWeather() {
        fetch('https://api.open-meteo.com/v1/forecast?latitude=34.05&longitude=-118.24&current=weather_code,temperature_2m,is_day&timezone=America%2FLos_Angeles')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var code  = data.current.weather_code;
                var tempC = data.current.temperature_2m;
                var isDay = data.current.is_day === 1;
                var tempF = tempC * 9 / 5 + 32;
                tempHot = tempF >= 90;
                weatherEmoji = tempHot ? '🔥' : getWeatherEmoji(code, isDay);
                tempLabel = Math.round(tempF) + '°F';
                publishWeather(code, isDay, tempF);
            })
            .catch(function() { /* keep current emoji on error */ });
    }

    if ('requestIdleCallback' in window) {
        requestIdleCallback(fetchWeather);
    } else {
        setTimeout(fetchWeather, 2000);
    }
    setInterval(fetchWeather, 10 * 60 * 1000);

    function updateTime() {
        var now     = new Date();
        var timeStr = now.toLocaleTimeString('en-US', {
            timeZone: 'America/Los_Angeles',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        /* The emoji goes in its own span so CSS can scale it down (.wx-emoji).
           At an identical 14px an emoji fills almost its whole em box while
           lowercase Latin uses about half of it — measured, the sun glyph renders
           14.6px wide against ~8px per letter — so it reads a size larger than
           the type beside it and gives the whole location item extra weight.
           Reuses one span rather than rebuilding it: this runs every second. */
        var el = document.getElementById('la-time');
        if (el) {
            var wx = el.querySelector('.wx-emoji');
            if (!wx) {
                el.textContent = timeStr + ' ';
                wx = document.createElement('span');
                wx.className = 'wx-emoji';
                el.appendChild(wx);
            } else {
                // firstChild is the time text node created above
                if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.nodeValue = timeStr + ' ';
            }
            if (wx.textContent !== weatherEmoji) wx.textContent = weatherEmoji;
        }
        // Mobile homepage corner: time and temp are separate spans with a dot between.
        // la-time-sticky gets time only; la-temp-sticky gets the °F value.
        var els = document.getElementById('la-time-sticky');
        if (els) els.textContent = timeStr;
        var elt = document.getElementById('la-temp-sticky');
        if (elt) {
            elt.textContent = tempLabel || '';
            // Show/hide the separator dot once temp is available
            var dot = elt.previousElementSibling;
            if (dot && dot.classList.contains('home-hero-time-dot')) {
                dot.style.display = tempLabel ? 'inline' : 'none';
            }
        }
    }
    updateTime();
    setInterval(updateTime, 1000);

    // ── LA temperature pill on the cursor ──
    // Hovering the location/time readout turns the custom cursor into the same
    // pill as the /studio founder/award hovers (position retained — it rides
    // the cursor). Pill bg/text match each page's NAV HOVER color, passed to
    // custom.css as inline custom props (--temp-pill-bg/fg on #cognak-cursor).
    // Delegated on document so navs recreated by view transitions keep working;
    // these listeners register before the global-cursor IIFE's mouseover
    // handler, which early-returns while is-founder is set, so they never fight.
    var TEMP_PILL_COLORS = {
        colophon: ['#A9C4FF', '#0700AC'],  // light periwinkle / klein blue
        privacy:  ['#1A0E18', '#FFFFFF'],  // near-black plum / white
        '404':    ['#AAFF00', '#17151A']   // acid green / near-black
    };
    document.addEventListener('mouseover', function(e) {
        if (!tempLabel) return;
        if (!e.target.closest || !e.target.closest('.home-bottom-location')) return;
        var cursor = document.getElementById('cognak-cursor');
        var label  = document.getElementById('cognak-cursor-label');
        if (!cursor || !label) return;
        var colors = TEMP_PILL_COLORS[window.COGNAK_PAGE || ''];
        var bg, fg;
        if (colors) {
            bg = colors[0];
            fg = colors[1];
        } else {
            // Everywhere else the nav hover color is the purple text token
            // (#9F50FF on the dark home, #9647F0 on light inner pages).
            bg = (getComputedStyle(document.body).getPropertyValue('--cognak-purple-text') || '').trim() || '#8B1FFF';
            fg = '#FFFFFF';
        }
        cursor.style.setProperty('--temp-pill-bg', bg);
        cursor.style.setProperty('--temp-pill-fg', fg);
        cursor.classList.remove('is-link', 'is-home', 'is-project', 'is-view-projects', 'is-next');
        cursor.classList.add('is-founder', 'is-temp');
        // Over 90°F: swap in the fiery red gradient pill (see .is-temp-hot in CSS).
        cursor.classList.toggle('is-temp-hot', tempHot);
        label.textContent = tempLabel;
    });
    document.addEventListener('mouseout', function(e) {
        if (!e.target.closest || !e.target.closest('.home-bottom-location')) return;
        // Child-to-child move inside the location? Keep the pill.
        if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.home-bottom-location')) return;
        var cursor = document.getElementById('cognak-cursor');
        var label  = document.getElementById('cognak-cursor-label');
        if (cursor && cursor.classList.contains('is-temp')) {
            cursor.classList.remove('is-founder', 'is-temp', 'is-temp-hot');
            cursor.style.removeProperty('--temp-pill-bg');
            cursor.style.removeProperty('--temp-pill-fg');
            if (label) label.textContent = '';
        }
    });
})();

/* ── Cursor-anchored pink→purple glow on "Start a project" ────────────────── */
/* Letters are lit pink where the cursor is and fade out to the purple text
   token as they get farther from it — a soft spotlight that tracks the mouse
   across the word, instead of the old time-based left-to-right rainbow sweep.
   Per-letter colour is painted here; the eased colour transition lives in the
   .rl CSS rule, which is what makes the shift glide smoothly. */
(function() {
    var isStudio = !!document.querySelector('.studio-archive');
    var targets = [
        document.querySelector('.hp-start'),
        isStudio ? null : document.querySelector('.projects-start-link')
    ];

    // Peak colour directly under the cursor.
    var PINK = [255, 159, 230];              // #FF9FE6

    // The colour letters settle to away from the cursor — the site's purple
    // text token (#9F50FF on the dark home, #9647F0 on light inner pages).
    function purpleRGB() {
        var v = (getComputedStyle(document.body).getPropertyValue('--cognak-purple-text') || '').trim();
        var m = /^#?([0-9a-fA-F]{6})$/.exec(v);
        if (m) {
            var n = parseInt(m[1], 16);
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }
        return [159, 80, 255];               // #9F50FF fallback
    }

    // How far (px) the pink bleeds out from the cursor before it has fully
    // become purple. Smoothstep eases the falloff so there's no hard edge.
    var RADIUS = 150;
    function smooth(t) { return t * t * (3 - 2 * t); }
    function mix(a, b, t) { return Math.round(a + (b - a) * t); }

    targets.forEach(function(el) {
        if (!el) return;
        var orig = el.textContent.trim();
        // Per-letter spans can make screen readers spell the link out — keep the
        // accessible name intact on the element itself.
        el.setAttribute('aria-label', orig);
        el.innerHTML = orig.split('').map(function(ch) {
            return ch === ' ' ? ' ' : '<span class="rl">' + ch + '</span>';
        }).join('');
        var letters = Array.prototype.slice.call(el.querySelectorAll('.rl'));

        function paint(mouseX) {
            var purple = purpleRGB();
            letters.forEach(function(l) {
                var r  = l.getBoundingClientRect();
                var cx = r.left + r.width / 2;
                var t  = smooth(Math.min(1, Math.abs(cx - mouseX) / RADIUS));
                l.style.color = 'rgb(' + mix(PINK[0], purple[0], t) + ','
                                       + mix(PINK[1], purple[1], t) + ','
                                       + mix(PINK[2], purple[2], t) + ')';
            });
        }

        el.addEventListener('mouseenter', function(e) {
            el.classList.add('rl-lit');
            paint(e.clientX);
        });
        el.addEventListener('mousemove', function(e) {
            paint(e.clientX);
        });
        el.addEventListener('mouseleave', function() {
            el.classList.remove('rl-lit');
            letters.forEach(function(l) { l.style.color = ''; });
        });
    });
})();

/* ── Global custom cursor ─────────────────────────────────────────────────── */
(function() {
    var cursor = document.getElementById('cognak-cursor');
    var label  = document.getElementById('cognak-cursor-label');
    var cursorImg = document.getElementById('cognak-cursor-img');
    var cursorVideo = document.getElementById('cognak-cursor-video');
    if (!cursor) return;

    function clearCursorVideo() {
        cursor.classList.remove('is-video');
        if (cursorVideo) { cursorVideo.pause(); cursorVideo.removeAttribute('src'); cursorVideo.load(); }
    }

    var mouseX = 0, mouseY = 0;
    var curX   = 0, curY   = 0;
    var lerp   = 0.22;
    var onProject = false;
    var clearImgTimer = null;
    var prevMouseX = 0, prevMouseY = 0;
    var velX = 0, velY = 0;
    var tiltAngle = 0;

    function scheduleClearImg() {
        if (clearImgTimer) { clearTimeout(clearImgTimer); }
        clearImgTimer = setTimeout(function() {
            if (cursorImg) cursorImg.src = '';
            clearCursorVideo();
            clearImgTimer = null;
        }, 250);
    }

    function cancelClearImg() {
        if (clearImgTimer) { clearTimeout(clearImgTimer); clearImgTimer = null; }
    }

    document.querySelectorAll('.project-excerpt[data-hero]').forEach(function(el) {
        var img = new Image();
        img.src = el.dataset.hero;
    });

    document.addEventListener('mousemove', function(e) {
        velX = e.clientX - prevMouseX;
        velY = e.clientY - prevMouseY;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
        mouseX = e.clientX;
        mouseY = e.clientY;
        cursor.classList.add('is-visible');
    });

    (function loop() {
        if (onProject) {
            curX += (mouseX - curX) * lerp;
            curY += (mouseY - curY) * lerp;
        } else {
            curX = mouseX;
            curY = mouseY;
        }
        /* transform, not left/top: writing left/top every frame puts the cursor
           on the layout path, and with mix-blend-mode:difference on top of that
           each frame costs a relayout + a full blend recomposite. translate3d
           is compositor-only. The trailing translate(-50%,-50%) reproduces the
           centring the base CSS rule does — an inline transform replaces it, so
           it has to be restated here. Only the base rule sets transform on
           #cognak-cursor (the state classes change width/height), so nothing
           else is being clobbered. */
        cursor.style.transform =
            'translate3d(' + curX + 'px,' + curY + 'px,0) translate(-50%,-50%)';
        velX *= 0.80;
        velY *= 0.80;
        var targetTilt = Math.max(-18, Math.min(18, velX * 0.9));
        tiltAngle += (targetTilt - tiltAngle) * 0.12;
        if (onProject) {
            var tilt = 'rotate(' + tiltAngle.toFixed(2) + 'deg)';
            if (cursorImg) cursorImg.style.transform = tilt;
            if (cursorVideo) cursorVideo.style.transform = tilt;
        }
        requestAnimationFrame(loop);
    })();

    document.addEventListener('mouseover', function(e) {
        if (cursor.classList.contains('is-founder')) return;
        if (e.target.closest('#logo-ring-section')) {
            cursor.classList.remove('is-link', 'is-home', 'is-project');
            cursor.classList.add('is-view-projects');
            label.textContent = 'VIEW ALL PROJECTS';
            scheduleClearImg();
            return;
        }
        if (e.target.closest('.home-bottom-logo')) {
            cursor.classList.remove('is-link', 'is-project', 'is-view-projects');
            cursor.classList.add('is-home');
            label.textContent = 'HOME';
            scheduleClearImg();
            return;
        }
        var pane = e.target.closest('.project-excerpt, .projects-list-item');
        if (pane) {
            cancelClearImg();
            onProject = true;
            cursor.classList.remove('is-link', 'is-home', 'is-view-projects');
            cursor.classList.add('is-project');
            if (cursorVideo && pane.dataset.heroVideo) {
                // Project has a hero video — play it in the cursor instead of the still.
                cursor.classList.add('is-video');
                if (cursorVideo.getAttribute('src') !== pane.dataset.heroVideo) {
                    cursorVideo.src = pane.dataset.heroVideo;
                }
                var pr = cursorVideo.play();
                if (pr && pr.catch) pr.catch(function() {});
            } else {
                clearCursorVideo();
                if (cursorImg && pane.dataset.hero && cursorImg.getAttribute('src') !== pane.dataset.hero) {
                    cursorImg.src = pane.dataset.hero;
                }
            }
            label.textContent = '';
            return;
        }
        onProject = false;
        // .pill covers the site's label+hidden-radio pill buttons (duration
        // pills on /schedule, format/damage-tolerance pills on /tools) —
        // real clickable controls that just aren't literally <a>/<button>,
        // so without this they never got the enlarged link cursor.
        // (Pierce, 2026-08-26: "30 and 60 minutes on hover should also have
        // the enlarged circular cursor.")
        if (e.target.closest('a, button, .pill')) {
            cursor.classList.remove('is-home', 'is-project', 'is-view-projects');
            cursor.classList.add('is-link');
            scheduleClearImg();
            label.textContent = '';
            return;
        }
        cursor.classList.remove('is-link', 'is-home', 'is-project', 'is-view-projects');
        scheduleClearImg();
        label.textContent = '';
    });

    document.addEventListener('mouseleave', function() {
        cursor.classList.remove('is-visible');
    });
    document.addEventListener('mouseenter', function() {
        cursor.classList.add('is-visible');
    });
})();

/* ── Type "cognak" to burst sparkles ──────────────────────────────────────── */
(function() {
    var target = 'cognak';
    var pos = 0;
    var chars = ['✦', '✧', '✦', '✧', '✦'];
    document.addEventListener('keydown', function(e) {
        var tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') { pos = 0; return; }
        var k = e.key.toLowerCase();
        pos = (k === target[pos]) ? pos + 1 : (k === target[0] ? 1 : 0);
        if (pos === target.length) {
            pos = 0;
            burst();
        }
    });
    function burst() {
        for (var i = 0; i < 50; i++) {
            (function(i) {
                setTimeout(function() {
                    var s = document.createElement('span');
                    var size = 8 + Math.random() * 12;
                    s.textContent = chars[Math.floor(Math.random() * chars.length)];
                    s.style.cssText = 'position:fixed;pointer-events:none;z-index:99999999;' +
                        'font-size:' + size + 'px;color:#FFB2E4;' +
                        'left:' + (Math.random() * 100) + 'vw;' +
                        'top:' + (Math.random() * 100) + 'vh;' +
                        'animation:sparkle-pop 0.9s ease forwards;';
                    document.body.appendChild(s);
                    setTimeout(function() { s.parentNode && s.parentNode.removeChild(s); }, 900);
                }, i * 25);
            })(i);
        }
    }
})();

/* ── Adaptive tile caption color + mobile scroll opacity ───────────────────── */
(function() {
    function getLuminance(r, g, b) {
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
    function toHex(r, g, b) {
        return '#' + [r, g, b].map(function(v) {
            return clamp(v).toString(16).padStart(2, '0');
        }).join('');
    }
    // Sample the bottom-left region (where the title sits) of an <img>/<video>.
    // Returns { avg, dark:[r,g,b], light:[r,g,b] } or null if not sampleable.
    // Works for <img> and <video> (samples the current frame).
    function sampleCaptionRegion(media) {
        var w = media.naturalWidth || media.videoWidth;
        var h = media.naturalHeight || media.videoHeight;
        if (!w || !h) return null;
        var sw = Math.max(1, Math.min(Math.round(w * 0.7), w));
        var sh = Math.max(1, Math.min(Math.round(h * 0.5), h));
        var sy = h - sh;
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        canvas.width = sw;
        canvas.height = sh;
        try {
            ctx.drawImage(media, 0, sy, sw, sh, 0, 0, sw, sh);
            var data = ctx.getImageData(0, 0, sw, sh).data;
            var px = [], totalLum = 0;
            for (var i = 0; i < data.length; i += 32) {
                var lum = getLuminance(data[i], data[i + 1], data[i + 2]);
                px.push([lum, data[i], data[i + 1], data[i + 2]]);
                totalLum += lum;
            }
            if (!px.length) return null;
            px.sort(function(a, b) { return a[0] - b[0]; });
            var n = Math.max(1, Math.round(px.length * 0.15));
            function avgOf(arr) {
                var tr = 0, tg = 0, tb = 0;
                for (var j = 0; j < arr.length; j++) { tr += arr[j][1]; tg += arr[j][2]; tb += arr[j][3]; }
                var c = arr.length;
                return [Math.round(tr / c), Math.round(tg / c), Math.round(tb / c)];
            }
            return {
                avg: totalLum / px.length,
                dark: avgOf(px.slice(0, n)),          // darkest ~15%
                light: avgOf(px.slice(px.length - n)) // lightest ~15%
            };
        } catch (e) {
            return null;
        }
    }

    function mix(c, target, t) {
        return [
            Math.round(c[0] + (target[0] - c[0]) * t),
            Math.round(c[1] + (target[1] - c[1]) * t),
            Math.round(c[2] + (target[2] - c[2]) * t)
        ];
    }

    // Soft, layered glow that fades out — strong enough to read, not a hard box.
    function softShadow(rgb) {
        var c = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',';
        return '0 0 4px ' + c + '0.98), 0 1px 12px ' + c + '0.8), 0 2px 26px ' + c + '0.5)';
    }

    // Pick text colour + glow from the media actually behind the caption:
    //   dark media  → white text + dark glow
    //   light media → dark text  + light glow
    function styleCaption(media, caption) {
        var s = sampleCaptionRegion(media);
        if (!s) {
            caption.style.color = '#ffffff';
            caption.style.textShadow = softShadow([0, 0, 0]);
            return;
        }
        if (s.avg < 0.5) {
            caption.style.color = '#ffffff';
            caption.style.textShadow = softShadow(mix(s.dark, [0, 0, 0], 0.55));
        } else {
            caption.style.color = '#111111';
            caption.style.textShadow = softShadow(mix(s.light, [255, 255, 255], 0.6));
        }
    }

    var isHoverDevice = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    function getTileOpacity(rect) {
        var vh = window.innerHeight;
        if (rect.top >= vh || rect.bottom <= 0) return 0;
        var tileCenter = rect.top + rect.height / 2;
        var vpCenter   = vh / 2;
        var distance   = Math.abs(tileCenter - vpCenter);
        var threshold  = vh * 0.25;
        return Math.max(0, 1 - distance / threshold);
    }

    var tileItems = [];
    var ticking   = false;

    function updateScrollOpacity() {
        tileItems.forEach(function(item) {
            var caption = item.querySelector('.project-title-hover');
            if (!caption) return;
            caption.style.opacity = getTileOpacity(item.getBoundingClientRect());
        });
    }
    function onScroll() {
        if (!ticking) {
            requestAnimationFrame(function() { updateScrollOpacity(); ticking = false; });
            ticking = true;
        }
    }

    function initTileColors() {
        tileItems = Array.prototype.slice.call(
            document.querySelectorAll('.project-excerpt, .projects-grid-item')
        );
        tileItems.forEach(function(item) {
            var caption = item.querySelector('.project-title-hover');
            if (!caption) return;
            var thumb = item.querySelector('img:not(.emoji):not(.hp-hover-media)');
            var hoverMedia = item.querySelector('.hp-hover-media');
            // Sample whatever is actually behind the title when it's visible:
            // the hover hero/video on hover devices, otherwise the tile thumbnail
            // (mobile, and the /projects grid which has no hover swap).
            var media = (isHoverDevice && hoverMedia) ? hoverMedia : thumb;
            if (!media) return;

            // Neutral fallback (white text, dark glow) until the media is ready.
            caption.style.color = '#ffffff';
            caption.style.textShadow = softShadow([0, 0, 0]);

            var run = function() { styleCaption(media, caption); };
            if (media.tagName === 'VIDEO') {
                if (media.readyState >= 2) {
                    run();
                } else {
                    media.addEventListener('loadeddata', run, { once: true });
                    media.addEventListener('playing', run, { once: true });
                }
            } else if (media.complete && media.naturalWidth > 0) {
                run();
            } else {
                media.addEventListener('load', run, { once: true });
            }
        });
        if (!isHoverDevice) {
            window.addEventListener('scroll', onScroll, { passive: true });
            updateScrollOpacity();
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTileColors);
    } else {
        initTileColors();
    }
})();

/* Email-click tracking is handled in BaseLayout (single GA4 'click_email' event
   + Google Ads conversion). The previous duplicate 'contact_click' handler was
   removed so each email click logs exactly one GA4 event. */

/* ── Text stagger on scroll-enter (all pages, unified) ────────────────────── */
(function() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var IS_FRONT = window.COGNAK_PAGE === 'home';

    var SELECTORS = [
        '.hp-projects-heading',
        '.hp-bottom-right p',
        '.projects-display-headline',
        '.projects-below-right p',
        '.studio-display-headline',
        '.studio-start-wrap .projects-start-link',
        /* NOTE: '.studio-start-wrap .availability-sub' intentionally NOT staggered.
           It's a display:flex container, so the word-splitter's inter-word spaces
           are discarded and the 6px flex gap becomes the (too-wide) word spacing.
           Home/projects never stagger this line either, so this keeps it consistent. */
        '.fourofour-headline',
        '.fourofour-body',
        '.privacy-headline',
        '.privacy-body p',
        '.privacy-body h2',
        /* The bold section glosses. They were the only prose on the page that
           never tracked in: a <div>, so the `.privacy-body p` rules never
           reached them, and absent from this list they simply sat there fully
           formed while the paragraph under them assembled itself word by word
           (Pierce, 2026-08-03). Added here AND to both CSS lists in custom.css
           — the hide and the reduced-motion escape — which must be edited
           together or the gloss disappears for good. */
        '.pp-gloss',
        '.colophon-headline',
        '.colophon-body > p:not(.colophon-spec):not(.colophon-sign)',
        '#step-pick .headline',
        '#step-pick .lede',
        '.tools-headline',
        '.tools-lede',
        /* /schedule — same class as /send + /receive below: 'html.js
           .schedule-headline{opacity:0}' in schedule.astro's own <style>
           hides the unsplit line pre-JS, so it MUST be listed here or it
           never gets un-hidden. (Pierce/Claude, 2026-08-25 — this is the
           exact bug the /send + /receive comment below already documents.) */
        '.schedule-headline',
        '.schedule-lede',
        /* /send + /receive. These two were the odd case: both pages set
           `html.js .send-headline{opacity:0}` (so the unsplit line never
           flashes before the splitter runs) but were never added here, so
           nothing ever set opacity back to 1 — the headline and lede were
           invisible on every JS-enabled visit. Fixed 2026-07-28. */
        '.send-headline',
        '.send-lede',
        '.receive-headline',
        '.receive-lede',
    ];

    function splitWords(el) {
        if (el.dataset.staggerDone) return;
        el.dataset.staggerDone = '1';
        var nodes = Array.prototype.slice.call(el.childNodes);
        el.innerHTML = '';
        nodes.forEach(function(node) {
            if (node.nodeType === 3) {
                node.textContent.split(' ').forEach(function(word, i) {
                    if (i > 0) el.appendChild(document.createTextNode(' '));
                    if (!word) return;
                    var span = document.createElement('span');
                    span.className = 'stagger-word';
                    span.textContent = word;
                    el.appendChild(span);
                });
            } else {
                el.appendChild(node);
            }
        });
        // Words now start hidden (.stagger-word opacity:0); reveal the container
        // that CSS hid pre-JS so it never flashes the full unsplit line.
        el.style.opacity = '1';
    }

    function animate(el, delay) {
        setTimeout(function() {
            el.querySelectorAll('.stagger-word').forEach(function(w, i) {
                w.style.transitionDelay = (i * 28) + 'ms';
                w.classList.add('stagger-in');
            });
        }, delay || 0);
    }

    function isAboveFold(el) {
        return el.getBoundingClientRect().top < window.innerHeight;
    }

    function init() {
        var targets = [];
        SELECTORS.forEach(function(sel) {
            document.querySelectorAll(sel).forEach(function(el) {
                splitWords(el);
                targets.push(el);
            });
        });
        if (!targets.length) return;

        targets.forEach(function(el) {
            if (isAboveFold(el)) {
                var delay = el.closest('.studio-subhead') ? 220 : 120;
                animate(el, delay);
                el.dataset.staggerFired = '1';
            }
        });

        var obs = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (!entry.isIntersecting) return;
                if (entry.target.dataset.staggerFired) return;
                entry.target.dataset.staggerFired = '1';
                animate(entry.target);
                obs.unobserve(entry.target);
            });
        }, { threshold: 0, rootMargin: '0px 0px -5% 0px' });
        targets.filter(function(el) { return !el.dataset.staggerFired; }).forEach(function(el) { obs.observe(el); });
    }

    if (IS_FRONT) {
        setTimeout(init, 1400);
    } else {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }
})();

/* ── Little moments of delight ────────────────────────────────────────────── */
(function() {
    console.log(
        '%cCOGNAK',
        'font-size:40px;font-weight:900;color:#FFB2E4;font-family:Diatype Mono,monospace;letter-spacing:-2px;'
    );
    console.log(
        '%cevery digital and print experience we make\nis built to feel premium, intentional, and human.\n\nhello@cognak.com',
        'color:rgba(255,255,255,0.35);font-family:Diatype Mono,monospace;font-size:11px;line-height:2;'
    );

    var _origTitle = document.title;
    document.addEventListener('visibilitychange', function() {
        document.title = document.hidden ? '🐃 cognak.com' : _origTitle;
    });

    var cursor   = document.getElementById('cognak-cursor');
    var idleTimer = null;
    function resetIdle() {
        clearTimeout(idleTimer);
        if (cursor) cursor.classList.remove('is-idle');
        idleTimer = setTimeout(function() {
            if (cursor) cursor.classList.add('is-idle');
        }, 9000);
    }
    document.addEventListener('mousemove', resetIdle, { passive: true });
    resetIdle();

    var laHour = parseInt(
        new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false })
    );
    if (laHour >= 0 && laHour < 5) {
        document.body.classList.add('is-midnight');
    }
})();

/* ── Respect prefers-reduced-motion: don't autoplay/loop videos (WCAG 2.2.2) ─ */
(function () {
    if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    function stopVideos() {
        document.querySelectorAll('video').forEach(function (v) {
            v.removeAttribute('autoplay');
            v.removeAttribute('loop');
            try { v.pause(); } catch (e) {}
        });
    }
    if (document.readyState !== 'loading') stopVideos();
    else document.addEventListener('DOMContentLoaded', stopVideos);
})();

/* ── Footer "Back to top" (replaces an inline onclick handler, for CSP) ─────── */
(function () {
    var btn = document.querySelector('.footer-backtotop');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
})();

/* ── Type "send" anywhere to open /send ───────────────────────────────────── */
/* /send is deliberately absent from the nav, footer and sitemap — this is how
   you get to it without a bookmark. Buffer resets after 1.2s of no typing, so
   the letters have to be deliberate rather than accumulated across a session.
   Ignored while focus is in a field (or on the /send passcode box itself),
   otherwise typing a client name containing "send" would navigate away. */
(function () {
    var WORD = 'send';
    var buf = '';
    var timer = 0;

    function isTyping(el) {
        if (!el) return false;
        if (el.isContentEditable) return true;
        var tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    document.addEventListener('keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (isTyping(e.target)) return;
        if (e.key.length !== 1) return;

        buf = (buf + e.key.toLowerCase()).slice(-WORD.length);

        clearTimeout(timer);
        timer = setTimeout(function () { buf = ''; }, 1200);

        if (buf === WORD) {
            buf = '';
            clearTimeout(timer);
            if (window.location.pathname.replace(/\/$/, '') !== '/send') {
                window.location.href = '/send';
            }
        }
    });
})();
