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

	function loadPack(n) {
		if (!packs[n]) {
			packs[n] = fetch("data/photos/pack-" + packName(n) + ".json")
				.then(r => r.ok ? r.json() : {})
				.catch(() => ({}))
				.then(p => (loaded[n] = p));
		}
		return packs[n];
	}

	// key: "a:<astronaut name>", "m:<mission>" (photo), "p:<mission>" (patch);
	// "t:" + key is the tiny copy
	function get(key) {
		return loadIndex().then(function (idx) {
			if (!(key in idx)) return null;
			return loadPack(idx[key]).then(p => p[key] ? p[key].data : null);
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
			keys.forEach(function (k) { if (k && k in idx) loadPack(idx[k]); });
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
		if (fullUrl) {
			var big = new Image();
			big.onload = function () { done(fullUrl); };
			big.src = fullUrl;      // blocked on some hosts: then the packed copy stays
		}
	}

	// after the page has settled: the tiny copies, mission photos and patches
	// first (about 1.4 MB), then the astronauts' (about 1.5 MB)
	function preloadTiny() {
		loadIndex().then(function (idx) {
			var first = {}, later = {};
			Object.keys(idx).forEach(function (k) {
				if (k.indexOf("t:") !== 0) return;
				(k.charAt(2) === "a" ? later : first)[idx[k]] = 1;
			});
			Promise.all(Object.keys(first).map(loadPack)).then(function () {
				Object.keys(later).forEach(loadPack);
			});
		});
	}
	loadIndex();
	(window.requestIdleCallback || function (f) { setTimeout(f, 1500); })(preloadTiny, { timeout: 3000 });

	return { get: get, show: show, peek: peek, prefetch: prefetch };
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
		document.addEventListener("keydown", function (e) { if (e.key === "Escape" && opened) close(); });
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
		// the original, when the host allows it
		var full = source.dataset.full;
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
			if (!opened) { img.style.transform = ""; img.style.borderRadius = ""; }
		}, 380);
	}

	return { open: open, close: close };
})();
