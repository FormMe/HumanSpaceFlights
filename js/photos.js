// Photos and mission patches. The images live in data/photos/pack-*.json
// (data URIs, a pack is fetched only when a photo from it is needed); the
// full-size image is loaded from Wikimedia when the host allows it.
//
// Every image also has a tiny copy ("t:" + key). All tiny packs are loaded
// right after the page, so a card shows its photo at once (blurred) while the
// big one arrives, and rows of the list / graph nodes start loading the big
// one when the pointer comes near.
var Photos = (function () {
	var index = null, indexLoading = null, packs = {}, loaded = {};
	var BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

	function loadIndex() {
		if (!indexLoading) {
			indexLoading = fetch("data/photos/index.json")
				.then(r => r.ok ? r.json() : {})
				.catch(() => ({}))
				.then(j => (index = j));
		}
		return indexLoading;
	}

	function packName(n) {
		return typeof n === "number" ? (n < 10 ? "0" : "") + n : n;   // "m07", "a03"...
	}

	// priority: "high" for the photo of the card just opened, "low" for the
	// tiny copies loaded in the background (they must not slow the first down).
	// A background download is stopped when a click needs the connection and
	// goes back to the queue.
	var background = [];            // { n, ctrl } of the low downloads in flight
	function loadPack(n, priority, pausable) {
		if (!packs[n]) {
			var ctrl = pausable && window.AbortController ? new AbortController() : null;
			if (ctrl) background.push({ n: n, ctrl: ctrl });
			packs[n] = fetch("data/photos/pack-" + packName(n) + ".json",
					{ priority: priority || "auto", signal: ctrl ? ctrl.signal : undefined })
				.then(r => r.ok ? r.json() : {})
				.then(p => (loaded[n] = p), function (e) {
					if (ctrl && ctrl.signal.aborted) throw e;   // pauseBackground() dropped it
					return (loaded[n] = {});
				})
				.finally(function () { background = background.filter(b => b.ctrl !== ctrl); });
		}
		return packs[n];
	}
	function pauseBackground() {
		background.splice(0).forEach(function (b) { delete packs[b.n]; b.ctrl.abort(); requeue(b.n); });
	}

	// key: "a:<astronaut name>", "m:<mission>" (photo), "p:<mission>" (patch);
	// "t:" + key is the tiny copy. low: an extra (crew avatar, tooltip), it
	// waits for the photos of the card, gives way to the next card's, and is
	// dropped when no longer wanted (low() says false) by the time its turn comes
	function get(key, low) {
		return loadIndex().then(function (idx) {
			if (!(key in idx)) return null;
			if (low) return (function attempt() {
				return afterCard().then(function () {
					if (typeof low === "function" && !low()) return {};
					// paused by the next card's photo: try again after it
					return loadPack(idx[key], "low", true).catch(attempt);
				});
			})().then(p => p[key] ? p[key].data : null);
			var pending = !loaded[idx[key]];
			if (pending) { busy++; pauseBackground(); }
			return loadPack(idx[key], "high").then(function (p) {
				if (pending) busy--;
				return p[key] ? p[key].data : null;
			});
		});
	}

	// resolves once the photos asked for by the card have arrived
	function afterCard() {
		return new Promise(function (resolve) {
			// first a turn: the card asks for its photos right after the avatars
			setTimeout(function wait() { busy ? setTimeout(wait, 100) : resolve(); }, 0);
		});
	}

	// synchronous: the image if its pack is already here
	function peek(key) {
		if (!index || !(key in index)) return null;
		var p = loaded[index[key]];
		return p && p[key] ? p[key].data : null;
	}

	// start loading the packs of these keys (pointer over a row, a node...)
	function prefetch(keys) {
		loadIndex().then(function (idx) {
			var wanted = keys.filter(k => k && k in idx && !loaded[idx[k]]);
			if (wanted.length) pauseBackground();      // the connection is for these now
			wanted.forEach(function (k) { loadPack(idx[k], "high"); });
		});
	}

	// tiny copy at once (blurred), then the packed image, then the original
	function show(img, key, fullUrl) {
		img.dataset.key = key;
		var tiny = peek("t:" + key), now = peek(key);
		img.hidden = false;
		img.classList.toggle("loading", !now);
		if (now) img.src = now;
		else if (tiny) img.src = tiny;
		else img.src = BLANK;       // keeps the box: the card does not jump when the image comes
		function done(src) {
			if (img.dataset.key !== key || !src) return;
			img.src = src;
			img.classList.remove("loading");
		}
		if (!now) get(key).then(done);
		fullUrl = wikimediaUrl(fullUrl);
		if (fullUrl) {
			var big = new Image();
			big.onload = function () { done(fullUrl); };
			big.src = fullUrl;      // blocked on some hosts: then the packed copy stays
		}
	}

	// after the page has settled: the tiny copies (mission photos, patches,
	// then portraits; about 3 MB), one pack at a time and only while no photo
	// asked for by a click is loading, so they never slow that photo down
	var busy = 0, queue = [], pumping = false;
	function requeue(n) { if (queue.indexOf(n) < 0) queue.unshift(n); }
	// one background download at a time, only while no card photo is loading
	function pump() {
		if (pumping) return;
		pumping = true;
		(function next() {
			if (!queue.length) { pumping = false; return; }
			if (busy) return setTimeout(next, 150);
			var n = queue.shift();
			if (loaded[n] || packs[n]) return next();
			loadPack(n, "low", true).then(next, function () { setTimeout(next, 150); });
		})();
	}
	function preloadTiny() {
		loadIndex().then(function (idx) {
			var order = { m: 0, p: 1, a: 2 }, names = {};
			Object.keys(idx).forEach(function (k) { if (k.indexOf("t:") === 0) names[idx[k]] = order[k.charAt(2)]; });
			Object.keys(names).sort((x, y) => names[x] - names[y] || (x < y ? -1 : 1))
				.forEach(function (n) { if (queue.indexOf(n) < 0) queue.push(n); });
			pump();
		});
	}
	// the photos one tap away (the crew of an open card, an astronaut's
	// missions): ahead of the tiny copies in the background queue
	var saveData = !!(navigator.connection && navigator.connection.saveData);
	function warm(keys) {
		if (saveData) return;
		loadIndex().then(function (idx) {
			keys.slice().reverse().forEach(function (k) {
				if (k in idx && !loaded[idx[k]] && !packs[idx[k]]) requeue(idx[k]);
			});
			pump();
		});
	}
	loadIndex();
	(window.requestIdleCallback || function (f) { setTimeout(f, 1500); })(preloadTiny, { timeout: 3000 });

	return { get: get, show: show, peek: peek, prefetch: prefetch, warm: warm };
})();

// Full-screen view of a photo: it grows out of its place in the card and
// shrinks back when closed (transform/opacity only, so it stays smooth).
var Lightbox = (function () {
	var box = null, img, cap, from = null, opened = false;

	function build() {
		box = document.createElement("div");
		box.className = "lightbox";
		box.setAttribute("role", "dialog");
		box.setAttribute("aria-modal", "true");
		box.innerHTML = "<button type='button' class='lightbox-close' aria-label='Close'>" +
			"<svg width='18' height='18' viewBox='0 0 16 16' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'><path d='M3.5 3.5l9 9M12.5 3.5l-9 9'/></svg></button>" +
			"<img class='lightbox-img' alt=''><p class='lightbox-cap'></p>";
		document.body.appendChild(box);
		img = box.querySelector("img");
		cap = box.querySelector(".lightbox-cap");
		box.addEventListener("click", close);
		document.addEventListener("keydown", function (e) {
			if (!opened) return;
			if (e.key === "Escape") close();
			else if (e.key === "Tab") { e.preventDefault(); box.querySelector(".lightbox-close").focus(); }  // focus stays inside
		});
		var y0 = null;           // swipe down to close
		box.addEventListener("touchstart", function (e) { y0 = e.touches[0].clientY; }, { passive: true });
		box.addEventListener("touchend", function (e) {
			if (y0 !== null && e.changedTouches[0].clientY - y0 > 70) close();
			y0 = null;
		});
	}

	// where the image ends up: as big as fits, but not blown up past 2x its pixels
	function target(w, h) {
		var vw = document.documentElement.clientWidth, vh = window.innerHeight;
		var mw = vw * (vw < 760 ? 1 : 0.92), mh = vh * 0.8;
		var k = Math.min(mw / w, mh / h, 2 * Math.max(1, 800 / Math.max(w, h)));
		return { w: w * k, h: h * k };
	}

	function open(source, caption) {
		if (!source || !source.src || source.classList.contains("loading")) return;
		if (!box) build();
		from = source;
		img.src = source.src;
		cap.innerHTML = caption || "";
		var nw = source.naturalWidth || 800, nh = source.naturalHeight || 500;
		var t = target(nw, nh);
		img.style.width = t.w + "px";
		img.style.height = t.h + "px";
		box.classList.add("show");
		opened = true;
		// start exactly over the photo in the card
		var r = source.getBoundingClientRect(), f = img.getBoundingClientRect();
		var s = Math.max(r.width / f.width, r.height / f.height);
		img.style.transition = "none";
		img.style.transform = "translate(" + (r.left + r.width / 2 - (f.left + f.width / 2)) + "px," +
			(r.top + r.height / 2 - (f.top + f.height / 2)) + "px) scale(" + s + ")";
		img.style.borderRadius = getComputedStyle(source).borderRadius;
		img.getBoundingClientRect();          // commit the start state
		img.style.transition = "";
		img.style.transform = "";
		img.style.borderRadius = "";
		source.style.visibility = "hidden";   // the photo has "left" the card
		box.querySelector(".lightbox-close").focus({ preventScroll: true });
		// the original, when the host allows it
		var full = wikimediaUrl(source.dataset.full);
		if (full) { var big = new Image(); big.onload = function () { if (opened) img.src = full; }; big.src = full; }
	}

	function close() {
		if (!opened) return;
		opened = false;
		var src = from;
		var r = src.getBoundingClientRect(), f = img.getBoundingClientRect();
		var s = Math.max(r.width / f.width, r.height / f.height);
		img.style.transform = "translate(" + (r.left + r.width / 2 - (f.left + f.width / 2)) + "px," +
			(r.top + r.height / 2 - (f.top + f.height / 2)) + "px) scale(" + s + ")";
		img.style.borderRadius = getComputedStyle(src).borderRadius;
		box.classList.remove("show");
		setTimeout(function () {
			src.style.visibility = "";
			if (document.activeElement === document.body || box.contains(document.activeElement)) src.focus({ preventScroll: true });
			if (!opened) { img.style.transform = ""; img.style.borderRadius = ""; }
		}, 380);
	}

	return { open: open, close: close };
})();
