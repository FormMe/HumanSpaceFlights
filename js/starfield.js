/*
 * Animated starry sky behind the page.
 *
 * Fast by design: stars are painted once into small canvas tiles that are
 * repeated as CSS backgrounds. Every moving part is animated only through
 * `transform` and `opacity`, which the browser compositor handles on the GPU,
 * so the page's main thread does no per-frame drawing:
 *   - three star layers drift slowly (CSS animation) and move with parallax
 *     when the page is scrolled (one transform per layer, once per frame
 *     while scrolling);
 *   - a few sparse layers of bright stars twinkle (opacity animation);
 *   - now and then a shooting star crosses the sky (short CSS animation).
 * Respects prefers-reduced-motion and stops spawning while the tab is hidden.
 */
(function () {
  var sky = document.getElementById("sky");
  if (!sky) return;

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var small = Math.min(window.innerWidth, window.innerHeight) < 700;
  var dpr = Math.min(window.devicePixelRatio || 1, small ? 2 : 1.5);

  // deterministic pseudo random numbers: the sky looks the same on every visit
  var seed = 7;
  function rand() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  var tints = ["255,255,255", "255,255,255", "255,255,255", "202,220,255", "255,236,214", "214,204,255"];

  function paintTile(size, count, minR, maxR, minA, maxA, glow) {
    var c = document.createElement("canvas");
    c.width = c.height = Math.round(size * dpr);
    var ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    for (var i = 0; i < count; i++) {
      var x = rand() * size, y = rand() * size;
      var r = minR + Math.pow(rand(), 2.2) * (maxR - minR);
      var a = minA + rand() * (maxA - minA);
      var tint = tints[Math.floor(rand() * tints.length)];
      if (glow && r > 0.9) {
        var g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, "rgba(" + tint + "," + (a * 0.35) + ")");
        g.addColorStop(1, "rgba(" + tint + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(" + tint + "," + a + ")";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }

  function toURL(canvas, done) {
    if (canvas.toBlob) {
      canvas.toBlob(function (blob) { done(blob ? URL.createObjectURL(blob) : canvas.toDataURL()); });
    } else {
      done(canvas.toDataURL());
    }
  }

  // tile size (css px), stars per tile, radius range, alpha range, glow,
  // drift period (s), scroll parallax factor, twinkle period (s, 0 = none)
  var layers = [
    { tile: 641, count: small ? 150 : 210, r: [0.35, 0.8], a: [0.25, 0.6], glow: false, drift: 260, parallax: 0.03 },
    { tile: 523, count: small ? 55 : 80, r: [0.55, 1.15], a: [0.45, 0.85], glow: true, drift: 170, parallax: 0.07 },
    { tile: 457, count: small ? 14 : 20, r: [0.9, 1.6], a: [0.7, 1], glow: true, drift: 110, parallax: 0.13 },
    { tile: 457, count: 6, r: [1.1, 1.8], a: [0.8, 1], glow: true, drift: 110, parallax: 0.13, twinkle: 3.3 },
    { tile: 523, count: 7, r: [0.9, 1.5], a: [0.8, 1], glow: true, drift: 170, parallax: 0.07, twinkle: 4.7 },
    { tile: 457, count: 5, r: [1.0, 1.7], a: [0.8, 1], glow: true, drift: 110, parallax: 0.13, twinkle: 6.1 }
  ];
  if (small) layers.splice(5, 1);  // one twinkle layer less on phones

  // Keyframes with literal values (no var()): only then can the browser run
  // the animation entirely on the compositor, without per-frame style work.
  var css = "";
  layers.forEach(function (cfg) {
    css += "@keyframes sky-drift-" + cfg.tile + "{from{transform:translate3d(0,0,0)}" +
           "to{transform:translate3d(0,-" + cfg.tile + "px,0)}}";
  });
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var idle = window.requestIdleCallback
    ? function (f) { window.requestIdleCallback(f, { timeout: 1200 }); }
    : function (f) { setTimeout(f, 200); };
  var wrappers = [];
  layers.forEach(function (cfg, i) {
    var wrap = document.createElement("div");
    wrap.className = "sky-parallax";
    var layer = document.createElement("div");
    layer.className = "sky-layer" + (cfg.twinkle ? " sky-twinkle" : "");
    layer.style.setProperty("--tile", cfg.tile + "px");
    var drift = "sky-drift-" + cfg.tile + " " + cfg.drift + "s linear infinite";
    layer.style.animation = cfg.twinkle
      ? drift + ", sky-twinkle " + cfg.twinkle + "s ease-in-out " + (-i * 1.3) + "s infinite alternate"
      : drift;
    wrap.appendChild(layer);
    sky.appendChild(wrap);
    wrappers.push({ el: wrap, factor: cfg.parallax, tile: cfg.tile });
    // painted when the page is idle: the layers fade in anyway, the charts come first
    idle(function () {
      toURL(paintTile(cfg.tile, cfg.count, cfg.r[0], cfg.r[1], cfg.a[0], cfg.a[1], cfg.glow), function (url) {
        layer.style.backgroundImage = 'url("' + url + '")';
        layer.style.backgroundSize = cfg.tile + "px " + cfg.tile + "px";
        layer.classList.add("ready");
      });
    });
  });

  // ---- scroll parallax (transform only, at most once per frame) ----------
  var ticking = false;
  function applyParallax() {
    ticking = false;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    for (var i = 0; i < wrappers.length; i++) {
      var w = wrappers[i];
      var shift = (y * w.factor) % w.tile;
      w.el.style.transform = "translate3d(0," + (-shift).toFixed(1) + "px,0)";
    }
  }
  if (!reduceMotion) {
    window.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(applyParallax);
      }
    }, { passive: true });
  }
  applyParallax();

  // ---- shooting stars -----------------------------------------------------
  if (reduceMotion) return;

  function shoot() {
    if (!document.hidden && Element.prototype.animate) {
      var s = document.createElement("div");
      s.className = "shooting-star";
      var w = window.innerWidth, h = window.innerHeight;
      var angle = 18 + rand() * 22;                    // degrees below horizontal
      var length = Math.max(w, h) * (0.35 + rand() * 0.3);
      s.style.left = (rand() * w * 0.8 + w * 0.1) + "px";
      s.style.top = (rand() * h * 0.45) + "px";
      var rot = "rotate(" + (rand() < 0.5 ? angle : 180 - angle).toFixed(1) + "deg) ";
      var duration = 700 + rand() * 600;
      sky.appendChild(s);
      var anim = s.animate([
        { opacity: 0, transform: rot + "translate3d(0,0,0) scaleX(0.2)" },
        { opacity: 1, offset: 0.12 },
        { opacity: 1, offset: 0.7 },
        { opacity: 0, transform: rot + "translate3d(" + length.toFixed(0) + "px,0,0) scaleX(1)" }
      ], { duration: duration, easing: "cubic-bezier(.4,.1,.7,.9)", fill: "forwards" });
      anim.onfinish = function () { s.remove(); };
    }
    window.setTimeout(shoot, 5000 + rand() * 9000);
  }
  window.setTimeout(shoot, 2500);
})();
