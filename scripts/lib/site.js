(function () {
  var q = document.getElementById("q"), box = document.getElementById("results"), idx = null, loading = null, t = null;
  if (!q || !box) return;
  function load() {
    if (idx || loading) return loading;
    loading = fetch(window.__up + "search.json").then(function (r) { return r.json(); }).then(function (j) { idx = j; return j; });
    return loading;
  }
  function tokens(s) { return s.toLowerCase().split(/[^a-z0-9_.-]+/).map(function (x) { return x.replace(/^[._-]+|[._-]+$/g, ""); }).filter(function (x) { return x.length >= 2; }); }
  function score(doc, ts) {
    var s = 0, keys = null;
    for (var i = 0; i < ts.length; i++) {
      var w = ts[i], hit = doc.k[w] || 0;
      if (!hit) {
        keys = keys || Object.keys(doc.k);
        for (var j = 0; j < keys.length; j++) if (keys[j].indexOf(w) === 0) { hit = Math.max(hit, doc.k[keys[j]] * 0.6); }
      }
      if (doc.t.toLowerCase().indexOf(w) >= 0) hit += 6;
      if (doc.r.indexOf(w) >= 0) hit += 3;
      if (!hit) return 0;
      s += Math.log(1 + hit);
    }
    return s;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function run() {
    var ts = tokens(q.value);
    if (!ts.length) { box.hidden = true; box.innerHTML = ""; return; }
    load().then(function (j) {
      var rows = [];
      for (var i = 0; i < j.length; i++) { var s = score(j[i], ts); if (s > 0) rows.push([s, j[i]]); }
      rows.sort(function (a, b) { return b[0] - a[0]; });
      rows = rows.slice(0, 25);
      box.innerHTML = rows.length ? rows.map(function (r) { var d = r[1]; return '<a href="' + window.__up + d.u + '"><span class="rt">' + esc(d.t) + '</span><span class="rr">' + esc(d.r) + '</span><span class="rx">' + esc(d.x) + '</span></a>'; }).join("") : '<div class="none">nothing resonates with that</div>';
      box.hidden = false;
    });
  }
  q.addEventListener("input", function () { clearTimeout(t); t = setTimeout(run, 120); });
  q.addEventListener("focus", function () { load(); if (q.value) run(); });
  document.addEventListener("click", function (e) { if (!box.contains(e.target) && e.target !== q) box.hidden = true; });
  document.addEventListener("keydown", function (e) { if (e.key === "/" && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } if (e.key === "Escape") { box.hidden = true; q.blur(); } });
})();
