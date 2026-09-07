#!/usr/bin/env node
// build-library.mjs — pull every public repo's docs into one static site.
//
//   node scripts/build-library.mjs [--out site] [--cache .cache] [--manifest dist/constellation.json] [--only repo,repo]
//
// Each component in sources.json with `docs` globs is cloned (depth 1, default
// branch) into the cache, the matching Markdown is rendered, relative links are
// rewritten to library pages when the target was collected and to GitHub
// otherwise, and an ADR index + a search index are built across all of it.
// pages/*.md in this repo are the cross-cutting wiki pages. All links are
// relative so the same output serves from GitHub Pages and from the portal.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, posix, relative, resolve, sep } from "node:path";
import { escapeHtml, frontMatter, render } from "./lib/md.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt("--out", join(ROOT, "site")));
const CACHE = resolve(opt("--cache", join(ROOT, ".cache", "repos")));
const MANIFEST = opt("--manifest", join(ROOT, "dist", "constellation.json"));
const ONLY = opt("--only", "") ? new Set(opt("--only", "").split(",")) : null;
const sources = JSON.parse(readFileSync(join(ROOT, "sources.json"), "utf8"));
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : null;
const log = (m) => process.stderr.write(`[library] ${m}\n`);
const toPosix = (p) => p.split(sep).join("/");

// ---------------------------------------------------------------- git
function sync(repo) {
  const dir = join(CACHE, repo.replace("/", "__"));
  const url = `https://github.com/${repo}.git`;
  if (existsSync(join(dir, ".git"))) {
    try {
      execFileSync("git", ["-C", dir, "fetch", "--depth", "1", "origin"], { stdio: "ignore" });
      execFileSync("git", ["-C", dir, "reset", "--hard", "-q", "origin/HEAD"], { stdio: "ignore" });
      return dir;
    } catch { rmSync(dir, { recursive: true, force: true }); }
  }
  mkdirSync(CACHE, { recursive: true });
  execFileSync("git", ["clone", "--depth", "1", "-q", url, dir], { stdio: "ignore" });
  return dir;
}
const gitDate = (dir, file) => { try { return execFileSync("git", ["-C", dir, "log", "-1", "--format=%cI", "--", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; } catch { return null; } };
const gitBranch = (dir) => { try { return execFileSync("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "main"; } };

// ---------------------------------------------------------------- globs (a deliberate subset: *, **, and literal paths)
function globToRe(g) {
  const re = g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "(?:.*/)?").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
  return new RegExp(`^${re}$`, "i");
}
function walk(dir, base = dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules" || e.name === "target") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, acc);
    else if (/\.(md|markdown)$/i.test(e.name)) acc.push(toPosix(relative(base, p)));
  }
  return acc;
}

// ---------------------------------------------------------------- collect
const docs = [];          // { comp, repo, path, dir, url(site-relative), title, html, text, headings, date, meta }
const byKey = new Map();  // `${repo}:${path}` -> doc
function collect() {
  for (const c of sources.components) {
    if (!c.repo || c.private || !c.docs?.length) continue;
    if (ONLY && !ONLY.has(c.id) && !ONLY.has(c.repo)) continue;
    let dir;
    try { dir = sync(c.repo); } catch (e) { log(`${c.repo}: clone failed (${e.message.split("\n")[0]})`); continue; }
    const branch = gitBranch(dir);
    const all = walk(dir);
    const res = c.docs.map(globToRe);
    const files = all.filter((f) => res.some((r) => r.test(f))).sort();
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      const { meta, body } = frontMatter(src);
      const url = `${c.id}/${f.replace(/\.(md|markdown)$/i, "")}.html`;
      const d = { comp: c, repo: c.repo, path: f, dir, branch, url, meta, body, date: gitDate(dir, f) };
      docs.push(d); byKey.set(`${c.repo}:${f}`, d);
    }
    log(`${c.id}: ${files.length} pages`);
  }
  // wiki pages from this repo
  const pdir = join(ROOT, "pages");
  for (const f of readdirSync(pdir).filter((n) => n.endsWith(".md")).sort()) {
    const src = readFileSync(join(pdir, f), "utf8");
    const { meta, body } = frontMatter(src);
    const d = { comp: { id: "library", title: "Library", layer: null }, repo: "NickFlach/kannaka-library", path: `pages/${f}`, dir: ROOT, branch: "main",
      url: f === "index.md" ? "index.html" : `wiki/${f.replace(/\.md$/, "")}.html`, meta, body, date: gitDate(ROOT, `pages/${f}`) };
    docs.push(d); byKey.set(`${d.repo}:pages/${f}`, d);
  }
}

// ---------------------------------------------------------------- render
function linkResolver(d) {
  return (href, { image }) => {
    if (/^(https?:|mailto:|#|data:)/i.test(href)) return href;
    const [p, hash = ""] = href.split("#");
    const target = posix.normalize(posix.join(posix.dirname(d.path), p || d.path));
    if (!p) return `#${hash}`;
    const hit = byKey.get(`${d.repo}:${target}`) || byKey.get(`${d.repo}:${target}.md`) || byKey.get(`${d.repo}:${target}/README.md`);
    if (hit && !image) return rel(d.url, hit.url) + (hash ? `#${hash}` : "");
    const kind = image ? "raw" : "blob";
    return `https://${image ? "raw.githubusercontent.com" : "github.com"}/${d.repo}/${image ? "" : `${kind}/`}${d.branch}/${target}`.replace("//", "/").replace(":/", "://") + (hash ? `#${hash}` : "");
  };
}
const rel = (from, to) => { const r = posix.relative(posix.dirname(from), to); return r || "."; };
const up = (url) => (url.split("/").length - 1 ? "../".repeat(url.split("/").length - 1) : "./");

function renderAll() {
  for (const d of docs) {
    const r = render(d.body, { resolveLink: linkResolver(d) });
    d.title = d.meta.title || r.title || basename(d.path).replace(/\.md$/i, "");
    d.html = r.html; d.text = r.text; d.headings = r.headings;
    d.adr = adrOf(d);
  }
}
function adrOf(d) {
  if (!/(^|\/)(adr|adrs|decisions)\//i.test(d.path)) return null;
  const m = /(?:ADR-?)?(\d{3,4})[-_]/i.exec(basename(d.path));
  if (!m) return null;
  const status = d.meta.status || (/(?:^|\n)\s*(?:\*\*|#+\s*)?status(?:\*\*)?\s*[:\n]+\s*\**\s*([A-Za-z][A-Za-z ]{2,30})/i.exec(d.body) || [])[1] || "";
  return { n: +m[1], status: status.trim(), id: `${d.comp.id}#${m[1]}` };
}

// ---------------------------------------------------------------- html shell
const CSS = readFileSync(join(ROOT, "scripts", "lib", "site.css"), "utf8");
const JS = readFileSync(join(ROOT, "scripts", "lib", "site.js"), "utf8");
function page({ url, title, body, nav = "", crumbs = [], meta = "" }) {
  const u = up(url);
  const crumb = crumbs.map(([t, h]) => (h ? `<a href="${h}">${escapeHtml(t)}</a>` : `<span>${escapeHtml(t)}</span>`)).join(' <span class="sep">/</span> ');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(sources.site.name)}</title>
<link rel="icon" href="${u}favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style><script>window.__up=${JSON.stringify(u)};</script></head>
<body><header class="top"><a class="brand" href="${u}index.html"><span class="glyph">◈</span> ${escapeHtml(sources.site.name)}</a>
<nav class="topnav"><a href="${u}index.html">Map</a><a href="${u}adr.html">ADRs</a><a href="${u}manifest.html">Manifest</a><a href="${u}wiki/distribution.html">Distribution</a><a href="${u}wiki/contributing.html">Contribute</a><a href="${sources.site.portal}">Portal ↗</a></nav>
<form class="search" role="search" onsubmit="return false"><input id="q" type="search" placeholder="search the constellation…" autocomplete="off" aria-label="search"><div id="results" class="results" hidden></div></form></header>
<div class="wrap"><aside class="side">${nav}</aside><main class="main">${crumb ? `<div class="crumbs">${crumb}</div>` : ""}${meta}<article class="doc">${body}</article></main></div>
<footer class="foot">built ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · <a href="https://github.com/NickFlach/kannaka-library">NickFlach/kannaka-library</a> · every page here has a source file on GitHub; edit it there.</footer>
<script>${JS}</script></body></html>`;
}

function sideNav(current) {
  const u = up(current?.url || "index.html");
  const comps = sources.components.filter((c) => docs.some((d) => d.comp.id === c.id));
  const groups = sources.layers.map((l) => ({ l, cs: comps.filter((c) => c.layer === l.id) })).filter((g) => g.cs.length);
  let s = `<div class="navgroup"><div class="navtitle">Wiki</div>${docs.filter((d) => d.comp.id === "library").sort((a, b) => (a.meta.order || 99) - (b.meta.order || 99)).map((d) => `<a class="${current === d ? "on" : ""}" href="${u}${d.url}">${escapeHtml(d.title)}</a>`).join("")}</div>`;
  for (const g of groups) {
    s += `<div class="navgroup"><div class="navtitle">${escapeHtml(g.l.title)}</div>`;
    for (const c of g.cs) {
      const ds = docs.filter((d) => d.comp.id === c.id);
      const open = current && current.comp.id === c.id;
      const readme = ds.find((d) => /^README\.md$/i.test(d.path)) || ds[0];
      s += `<details${open ? " open" : ""}><summary><a href="${u}${readme.url}">${escapeHtml(c.id)}</a> <span class="n">${ds.length}</span></summary>`;
      for (const d of ds.filter((x) => x !== readme).slice(0, 400)) s += `<a class="sub ${current === d ? "on" : ""}" href="${u}${d.url}" title="${escapeHtml(d.path)}">${escapeHtml(shortTitle(d))}</a>`;
      s += `</details>`;
    }
    s += `</div>`;
  }
  return s;
}
const shortTitle = (d) => (d.adr ? `${String(d.adr.n).padStart(4, "0")} ${d.title.replace(/^ADR[- ]?\d+[:.\s-]*/i, "")}` : d.title).slice(0, 70);

// ---------------------------------------------------------------- writers
function write(url, html) { const p = join(OUT, ...url.split("/")); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, html); }

function writeDocs() {
  for (const d of docs) {
    const u = up(d.url);
    const gh = `https://github.com/${d.repo}/blob/${d.branch}/${d.path}`;
    const meta = `<div class="meta"><span class="repo">${escapeHtml(d.repo)}</span> <code>${escapeHtml(d.path)}</code>${d.date ? ` · ${d.date.slice(0, 10)}` : ""}${d.adr?.status ? ` · <span class="status s-${d.adr.status.toLowerCase().replace(/\W+/g, "-")}">${escapeHtml(d.adr.status)}</span>` : ""} · <a href="${gh}">source ↗</a> · <a href="${gh.replace("/blob/", "/edit/")}">edit ↗</a></div>`;
    const toc = d.headings.filter((h) => h.level >= 2 && h.level <= 3).length >= 4
      ? `<nav class="toc"><div class="navtitle">On this page</div>${d.headings.filter((h) => h.level >= 2 && h.level <= 3).map((h) => `<a class="l${h.level}" href="#${h.id}">${escapeHtml(h.text.replace(/[`*_]/g, ""))}</a>`).join("")}</nav>` : "";
    write(d.url, page({ url: d.url, title: d.title, body: toc + d.html, nav: sideNav(d),
      crumbs: [[sources.site.name, `${u}index.html`], [d.comp.title || d.comp.id, d.comp.id === "library" ? null : `${u}${(docs.find((x) => x.comp.id === d.comp.id && /^README\.md$/i.test(x.path)) || d).url}`], [d.title, null]], meta }));
  }
}

function writeAdrIndex() {
  const adrs = docs.filter((d) => d.adr).sort((a, b) => a.comp.id.localeCompare(b.comp.id) || a.adr.n - b.adr.n);
  const groups = [...new Set(adrs.map((d) => d.comp.id))];
  let body = `<h1>Architecture Decision Records</h1><p>${adrs.length} decisions across ${groups.length} repositories. A decision is a page like any other; its status is whatever the record says.</p>`;
  for (const g of groups) {
    const rows = adrs.filter((d) => d.comp.id === g);
    body += `<h2 id="${g}">${escapeHtml(rows[0].comp.title)} <span class="n">${rows.length}</span></h2><table><thead><tr><th>#</th><th>Decision</th><th>Status</th><th>Updated</th></tr></thead><tbody>`;
    for (const d of rows) body += `<tr><td>${String(d.adr.n).padStart(4, "0")}</td><td><a href="${d.url}">${escapeHtml(d.title.replace(/^ADR[- ]?\d+[:.\s-]*/i, ""))}</a></td><td>${d.adr.status ? `<span class="status s-${d.adr.status.toLowerCase().replace(/\W+/g, "-")}">${escapeHtml(d.adr.status)}</span>` : ""}</td><td>${d.date ? d.date.slice(0, 10) : ""}</td></tr>`;
    body += `</tbody></table>`;
  }
  write("adr.html", page({ url: "adr.html", title: "ADRs", body, nav: sideNav(null), crumbs: [[sources.site.name, "index.html"], ["ADRs", null]] }));
}

function writeManifestPage() {
  let body = `<h1>Constellation manifest</h1>`;
  if (!manifest) { body += `<p>No manifest was built. Run <code>node scripts/build-manifest.mjs</code> first.</p>`; }
  else {
    body += `<p>Generated ${manifest.generated.slice(0, 16).replace("T", " ")} UTC. Machine-readable at <a href="constellation.json"><code>constellation.json</code></a>${existsSync(join(dirname(MANIFEST), "constellation.json.sig")) ? ` with an ed25519 <a href="constellation.json.sig">signature</a> (public key <a href="manifest.pub"><code>manifest.pub</code></a>)` : " (unsigned in this build)"}. Installers pin to these versions and hashes rather than to whatever <em>latest</em> happens to be.</p>`;
    for (const l of manifest.layers) {
      const cs = manifest.components.filter((c) => c.layer === l.id);
      if (!cs.length) continue;
      body += `<h2 id="${l.id}">${escapeHtml(l.title)}</h2><p class="dim">${escapeHtml(l.blurb)}</p>`;
      for (const c of cs) {
        body += `<h3 id="${c.id}">${escapeHtml(c.title)} ${c.release ? `<span class="ver">${escapeHtml(c.release.version)}</span>` : c.private ? `<span class="ver private">private</span>` : ""}</h3><p>${escapeHtml(c.blurb)}${c.repo ? ` <a href="${c.repo}">${c.repo.replace("https://github.com/", "")} ↗</a>` : ""}</p>`;
        if (c.assets?.length) {
          body += `<table><thead><tr><th>asset</th><th>target</th><th>sha256</th></tr></thead><tbody>`;
          for (const a of c.assets) body += `<tr><td><a href="${a.url}">${escapeHtml(a.name)}</a></td><td>${a.target || ""}</td><td><code class="sha">${a.sha256 ? a.sha256.slice(0, 16) + "…" : "—"}</code></td></tr>`;
          body += `</tbody></table>`;
        }
        if (c.kind === "model") {
          body += `<p>Hosted: <code>${escapeHtml(c.hosted.base_url)}</code> ${c.hosted.online ? "<span class='status s-online'>online</span>" : "<span class='status s-offline'>offline</span>"}${c.hosted.models?.length ? ` serving ${c.hosted.models.map((m) => `<code>${escapeHtml(m)}</code>`).join(", ")}` : ""}. Local: <code>ollama run ${escapeHtml(c.local.model)}</code> from <code>${escapeHtml(c.local.from)}</code>.</p>`;
          if (c.models?.length) {
            body += `<table><thead><tr><th>tag</th><th>base</th><th>served ppl</th><th>voice judge</th><th>weights</th></tr></thead><tbody>`;
            for (const m of c.models) body += `<tr><td><code>${escapeHtml(m.tag)}</code></td><td>${escapeHtml(m.base || "")}</td><td>${m.served_ppl ?? ""}</td><td>${m.judge_mean != null ? `${m.judge_mean.toFixed(2)} (n=${m.judge_n})` : ""}</td><td>${m.huggingface ? `<a href="https://huggingface.co/${m.huggingface}">${escapeHtml(m.huggingface.split("/")[1])}</a>` : ""}</td></tr>`;
            body += `</tbody></table>`;
          }
          body += `<p>${c.huggingface.map((h) => `<a href="${h}">${escapeHtml(h.replace("https://huggingface.co/", ""))}</a>`).join(" · ")}</p>`;
        }
      }
    }
    body += `<h2 id="services">Services</h2><table><thead><tr><th>service</th><th>url</th></tr></thead><tbody>${manifest.services.map((s) => `<tr><td>${escapeHtml(s.title)}</td><td><a href="${s.url}">${escapeHtml(s.url)}</a></td></tr>`).join("")}</tbody></table>`;
    body += `<h2 id="install">Install</h2><pre><code>curl -fsSL ${manifest.installers.sh} | sh
irm ${manifest.installers.ps1} | iex
${manifest.installers.brew}</code></pre>`;
  }
  write("manifest.html", page({ url: "manifest.html", title: "Manifest", body, nav: sideNav(null), crumbs: [[sources.site.name, "index.html"], ["Manifest", null]] }));
  if (manifest) {
    cpSync(MANIFEST, join(OUT, "constellation.json"));
    const sig = join(dirname(MANIFEST), "constellation.json.sig");
    if (existsSync(sig)) cpSync(sig, join(OUT, "constellation.json.sig"));
  }
  if (existsSync(join(ROOT, "manifest.pub"))) cpSync(join(ROOT, "manifest.pub"), join(OUT, "manifest.pub"));
}

function writeHome() {
  const home = docs.find((d) => d.url === "index.html");
  const comps = sources.components;
  let map = `<div class="layers">`;
  for (const l of sources.layers) {
    const cs = comps.filter((c) => c.layer === l.id);
    map += `<section class="layer"><h2 id="${l.id}">${escapeHtml(l.title)}</h2><p class="dim">${escapeHtml(l.blurb)}</p><div class="cards">`;
    for (const c of cs) {
      const readme = docs.find((d) => d.comp.id === c.id && /^README\.md$/i.test(d.path)) || docs.find((d) => d.comp.id === c.id);
      const mc = manifest?.components.find((m) => m.id === c.id);
      const href = readme ? readme.url : c.repo ? `https://github.com/${c.repo}` : c.hosted?.page || "#";
      map += `<a class="card${c.private ? " private" : ""}" href="${href}"><div class="cardtitle">${escapeHtml(c.title)}${mc?.release ? ` <span class="ver">${escapeHtml(mc.release.version)}</span>` : ""}${c.private ? ` <span class="ver private">private</span>` : ""}</div><div class="blurb">${escapeHtml(c.blurb)}</div><div class="cardfoot">${c.repo ? escapeHtml(c.repo) : c.hosted ? "huggingface · hosted" : ""}${readme ? ` · ${docs.filter((d) => d.comp.id === c.id).length} pages` : ""}</div></a>`;
    }
    map += `</div></section>`;
  }
  map += `</div>`;
  const body = (home ? home.html : `<h1>${escapeHtml(sources.site.name)}</h1>`) + map;
  write("index.html", page({ url: "index.html", title: sources.site.tagline, body, nav: sideNav(home) }));
}

function writeSearch() {
  const index = [];
  const stop = new Set("the a an and or of to in is it for on with as by at this that from be are was were not have has but if then than can will its into your you we our they their which what when where how also".split(" "));
  for (const d of docs) {
    const terms = {};
    const tok = (s, w) => { for (const t of s.toLowerCase().split(/[^a-z0-9_.-]+/)) { const x = t.replace(/^[._-]+|[._-]+$/g, ""); if (x.length >= 3 && x.length <= 40 && !stop.has(x)) terms[x] = (terms[x] || 0) + w; } };
    tok(d.title, 8); tok(d.comp.id, 4); tok(d.path, 2); tok(d.text.slice(0, 20000), 1);
    const top = Object.entries(terms).sort((a, b) => b[1] - a[1]).slice(0, 220);
    index.push({ u: d.url, t: d.title, r: d.comp.id, x: d.text.replace(/\s+/g, " ").slice(0, 160), k: Object.fromEntries(top) });
  }
  writeFileSync(join(OUT, "search.json"), JSON.stringify(index));
}

function writeStatic() {
  writeFileSync(join(OUT, "favicon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#07070f"/><text x="16" y="23" font-size="20" text-anchor="middle" fill="#ffd700">◈</text></svg>`);
  writeFileSync(join(OUT, ".nojekyll"), "");
  writeFileSync(join(OUT, "robots.txt"), "User-agent: *\nAllow: /\n");
}

// ---------------------------------------------------------------- main
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
collect(); renderAll(); writeDocs(); writeAdrIndex(); writeManifestPage(); writeHome(); writeSearch(); writeStatic();
log(`${docs.length} pages, ${docs.filter((d) => d.adr).length} ADRs → ${OUT}`);
