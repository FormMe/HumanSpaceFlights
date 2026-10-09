// Photos and mission patches. The small copies live in data/photos/pack-NN.json
// (data URIs, fetched only when a photo from that pack is needed); the
// full-size image is loaded from Wikimedia when the host allows it.
var Photos = (function () {
	var index = null, indexLoading = null, packs = {};

	function loadIndex() {
		if (!indexLoading) {
			indexLoading = fetch("data/photos/index.json")
				.then(r => r.ok ? r.json() : {})
				.catch(() => ({}))
				.then(j => (index = j));
		}
		return indexLoading;
	}

	function loadPack(n) {
		if (!packs[n]) {
			var name = typeof n === "number" ? (n < 10 ? "0" : "") + n : n;   // "m07", "a03"...
			packs[n] = fetch("data/photos/pack-" + name + ".json")
				.then(r => r.ok ? r.json() : {})
				.catch(() => ({}));
		}
		return packs[n];
	}

	// key: "a:<astronaut name>", "m:<mission>" (photo), "p:<mission>" (patch);
	// "t:a:…" / "t:p:…" are tiny copies for avatars and tooltips
	function get(key) {
		return loadIndex().then(function (idx) {
			if (!(key in idx)) return null;
			return loadPack(idx[key]).then(p => p[key] ? p[key].data : null);
		});
	}

	// small copy first, then the sharp original if it can be loaded
	function show(img, key, fullUrl) {
		img.dataset.key = key;
		img.hidden = true;
		get(key).then(function (src) {
			if (img.dataset.key !== key) return;       // another item was selected meanwhile
			if (src) { img.src = src; img.hidden = false; }
			if (!fullUrl) return;
			var big = new Image();
			big.onload = function () {
				if (img.dataset.key === key) { img.src = fullUrl; img.hidden = false; }
			};
			big.src = fullUrl;                          // blocked on some hosts: then the small copy stays
		});
	}

	loadIndex();
	return { get: get, show: show };
})();
